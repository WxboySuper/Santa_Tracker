import json
import logging
import math
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)


@dataclass
class StopExperience:
    duration_seconds: Optional[int] = None
    camera_zoom: Optional[int] = None
    weather_condition: Optional[str] = None
    presents_delivered_at_stop: Optional[int] = None


@dataclass
class TransitToHere:
    description: Optional[str] = None
    duration_seconds: Optional[int] = None
    distance_km: Optional[float] = None
    speed_curve: Optional[str] = None
    speed_kmh: Optional[float] = None
    camera_zoom: Optional[int] = None


@dataclass
class Schedule:
    arrival_utc: Optional[str] = None
    departure_utc: Optional[str] = None
    local_arrival_time: Optional[str] = None
    time_window_status: Optional[str] = None


@dataclass
class Location:
    name: str
    region: Optional[str] = None
    # canonical coordinates (may be set from legacy fields in __post_init__)
    lat: Optional[float] = None
    lng: Optional[float] = None
    timezone_offset: Optional[float] = None

    # legacy / optional fields for backward compatibility
    latitude: Optional[float] = field(default=None, repr=False)
    longitude: Optional[float] = field(default=None, repr=False)
    utc_offset: Optional[float] = field(default=None, repr=False)
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    stop_duration: Optional[float] = None
    is_stop: Optional[bool] = None
    priority: Optional[int] = None
    notes: Optional[str] = None
    fun_facts: Optional[str] = None
    country: Optional[str] = None
    population: Optional[int] = None

    def __post_init__(self):
        # Delegate to focused helpers to keep cyclomatic complexity low
        _location_coerce_legacy_fields(self)
        _location_validate_and_normalize_coords(self)
        _location_sync_legacy_fields_and_notes(self)
        _location_validate_priority(self)

    @property
    def coordinates(self) -> Tuple[float, float]:
        return self.lat, self.lng

    # Legacy attribute names are stored as dataclass fields (latitude, longitude,
    # utc_offset) and synchronized to canonical fields (lat/lng/timezone_offset)
    # in __post_init__. Avoid defining properties that shadow these field names.


@dataclass
class Node:
    comment: Optional[str]
    id: str
    type: str
    location: Location
    stop_experience: Optional[StopExperience] = None
    schedule: Optional[Schedule] = None
    transit_to_here: Optional[TransitToHere] = None
    acknowledged_off_peak: Optional[bool] = None
    name: Optional[str] = None

    def __post_init__(self):
        if not self.id:
            raise ValueError("Node.id is required")
        # optional: enforce allowed type values (e.g., START, DELIVERY, TRANSIT)
        if not isinstance(self.location, Location):
            raise TypeError("location must be a Location instance")


def _safe_get_float(d: Dict[str, Any], key: str) -> Optional[float]:
    value = d.get(key)
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "").strip())
        except ValueError:
            raise ValueError(
                f"expected numeric string for key '{key}', got: {value}"
            ) from None
    raise TypeError(f"unsupported type for key '{key}': {type(value).__name__}")


def _safe_get_int(d: Dict[str, Any], key: str) -> Optional[int]:
    v = d.get(key)
    if v is None:
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        try:
            return int(float(v.replace(",", "").strip()))
        except ValueError:
            msg = f"expected integer-like string for '{key}', got: {v!r}"
            raise ValueError(msg) from None
    raise TypeError(f"unsupported type for '{key}': {type(v).__name__}")


def _second_to_minutes(seconds: Any) -> Optional[int]:
    if seconds is None:
        return None
    try:
        s = int(seconds)
        return round(s / 60.0)
    except (TypeError, ValueError):
        return None


def _parse_location_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(entry, dict):
        raise TypeError("entry must be a dict")
    node_id = entry.get("id")
    if not node_id:
        raise ValueError("missing required 'id' in node entry")

    loc = entry.get("location", {})
    if not isinstance(loc, dict):
        raise ValueError(f"invalid 'location' for node {node_id}")

    lat = _safe_get_float(loc, "lat")
    lng = _safe_get_float(loc, "lng")
    if lat is None or lng is None:
        raise ValueError(f"missing lat/lng for node {node_id}")

    timezone_offset = _safe_get_float(loc, "timezone_offset")

    stop = entry.get("stop_experience", {}) or {}
    schedule = entry.get("schedule", {}) or {}
    transit = entry.get("transit_to_here", None)

    parsed_transit = None
    if transit:
        if not isinstance(transit, dict):
            raise ValueError(f"invalid 'transit_to_here' for node {node_id}")
        parsed_transit = {
            "description": transit.get("description"),
            "duration_seconds": _safe_get_int(transit, "duration_seconds"),
            "distance_km": _safe_get_float(transit, "distance_km"),
            "speed_curve": transit.get("speed_curve"),
            "speed_kmh": _safe_get_float(transit, "speed_kmh"),
            "camera_zoom": _safe_get_int(transit, "camera_zoom"),
        }

    parsed = {
        "id": node_id,
        "type": entry.get("type"),
        "comment": entry.get("comment"),
        "location": {
            "name": loc.get("name"),
            "region": loc.get("region"),
            "lat": lat,
            "lng": lng,
            "timezone_offset": timezone_offset,
        },
        "stop_experience": {
            "duration_seconds": _safe_get_int(stop, "duration_seconds") or 0,
            "camera_zoom": _safe_get_int(stop, "camera_zoom"),
            "weather_condition": stop.get("weather_condition"),
            "presents_delivered_at_stop": _safe_get_int(
                stop, "presents_delivered_at_stop"
            )
            or 0,
        },
        "schedule": {
            "arrival_utc": schedule.get("arrival_utc"),
            "departure_utc": schedule.get("departure_utc"),
            "local_arrival_time": schedule.get("local_arrival_time"),
            "time_window_status": schedule.get("time_window_status"),
        },
        "transit_to_here": parsed_transit,
        # preserve some legacy top-level fields if present
        "notes": entry.get("notes") or entry.get("fun_facts"),
        "priority": entry.get("priority"),
    }
    return parsed


def load_santa_route_from_json(
    source: Optional[Union[str, Dict[str, Any], List[Any]]] = None,
) -> List[Union[Dict[str, Any], Location]]:
    """
    Accepts a JSON string, a parsed dict, a list, or a file path. If `source` is None
    it will attempt to read the default `static/data/santa_route.json` file.
    If the input is loaded from a file path (default or explicit path), this
    function returns a list of legacy-compatible `Location` instances so the
    rest of the application can continue to access attributes like
    `latitude`/`longitude`/`utc_offset`. If the input is a raw JSON string or
    an already-parsed dict/list passed programmatically, it returns the
    normalized node dicts.
    """
    obj, _loaded_from_file = _load_source_to_obj(source)

    nodes = _get_nodes_from_obj(obj)
    parsed_nodes = _parse_and_normalize_nodes(nodes)

    # Behaviour:
    # - If caller did not supply a source (source is None), return a list of
    #   Location objects for use by the admin UI (existing code paths expect
    #   dataclass instances).
    # - If caller supplied an explicit source (file path, JSON string, or
    #   parsed object), return the normalized node dicts. For programmatic
    #   inputs (JSON string or in-memory object) we strip legacy top-level
    #   fields like 'notes' and 'priority'. For explicit file paths we return
    #   the parsed nodes unchanged to preserve on-disk fields.
    if source is None:
        return _parsed_nodes_to_locations(parsed_nodes)

    # For any explicit source (file path, JSON string, or parsed object)
    # return the normalized parsed node dicts and strip legacy top-level
    # fields like 'notes' and 'priority' so callers receive a canonical
    # representation.
    for p in parsed_nodes:
        p.pop("notes", None)
        p.pop("priority", None)
    return parsed_nodes


def _coerce_node_from_node(n: Node) -> Dict[str, Any]:
    loc = n.location
    flat: Dict[str, Any] = {}
    flat["name"] = loc.name
    flat["latitude"] = float(loc.latitude if loc.latitude is not None else loc.lat)
    flat["longitude"] = float(loc.longitude if loc.longitude is not None else loc.lng)
    flat["utc_offset"] = float(
        loc.utc_offset if loc.utc_offset is not None else loc.timezone_offset
    )
    flat["arrival_time"] = getattr(loc, "arrival_time", None)
    flat["departure_time"] = getattr(loc, "departure_time", None)
    flat["country"] = loc.country or loc.region
    flat["population"] = loc.population
    flat["priority"] = loc.priority
    if loc.notes is not None:
        flat["notes"] = loc.notes
        flat["fun_facts"] = loc.notes
    flat["stop_duration"] = getattr(loc, "stop_duration", None)
    is_stop_val = getattr(loc, "is_stop", None)
    flat["is_stop"] = True if is_stop_val is None else is_stop_val
    return flat


def _coerce_node_from_dict(n: Dict[str, Any]) -> Dict[str, Any]:
    loc = n.get("location") if isinstance(n.get("location"), dict) else {}
    flat: Dict[str, Any] = {}

    # Basic fields
    flat.update(_coerce_node_basic_from_dict(n, loc))

    # Coordinate fields
    flat.update(_coerce_node_coords_from_dict(n, loc))

    # Schedule fields
    flat.update(_coerce_node_schedule_from_dict(n))

    # Stop experience
    flat.update(_coerce_node_stop_experience_from_dict(n))

    # Optional fields: priority, notes, country, population
    if n.get("priority") is not None:
        flat["priority"] = n.get("priority")
    if n.get("notes") is not None:
        flat["notes"] = n.get("notes")
        flat["fun_facts"] = n.get("notes")
    if loc.get("region") is not None:
        flat["country"] = loc.get("region")
    if n.get("population") is not None:
        flat["population"] = n.get("population")

    # defaults
    flat.setdefault("is_stop", True)

    return flat


def _coerce_node_basic_from_dict(
    n: Dict[str, Any], loc: Dict[str, Any]
) -> Dict[str, Any]:
    """Extract basic non-numeric fields like name."""
    out: Dict[str, Any] = {}
    name = loc.get("name") or n.get("id") or n.get("name")
    if name is not None:
        out["name"] = name
    return out


def _coerce_node_coords_from_dict(
    n: Dict[str, Any], loc: Dict[str, Any]
) -> Dict[str, Any]:
    """Extract and convert numeric coordinate fields; keep errors local."""
    out: Dict[str, Any] = {}
    lat_cand = loc.get("lat") if loc.get("lat") is not None else n.get("latitude")
    lng_cand = loc.get("lng") if loc.get("lng") is not None else n.get("longitude")
    tz_cand = (
        loc.get("timezone_offset")
        if loc.get("timezone_offset") is not None
        else n.get("utc_offset")
    )

    if lat_cand is not None:
        try:
            out["latitude"] = float(lat_cand)
        except (TypeError, ValueError):
            logger.debug(
                "ignored invalid latitude=%r for node=%r", lat_cand, n.get("id")
            )
    if lng_cand is not None:
        try:
            out["longitude"] = float(lng_cand)
        except (TypeError, ValueError):
            logger.debug(
                "ignored invalid longitude=%r for node=%r", lng_cand, n.get("id")
            )
    if tz_cand is not None:
        try:
            out["utc_offset"] = float(tz_cand)
        except (TypeError, ValueError):
            logger.debug(
                "ignored invalid timezone_offset=%r for node=%r", tz_cand, n.get("id")
            )
    return out


def _coerce_node_schedule_from_dict(n: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    schedule = n.get("schedule") or {}
    arrival = schedule.get("arrival_utc") if schedule else n.get("arrival_time")
    departure = schedule.get("departure_utc") if schedule else n.get("departure_time")
    if arrival is not None:
        out["arrival_time"] = arrival
    if departure is not None:
        out["departure_time"] = departure
    return out


def _coerce_node_stop_experience_from_dict(n: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    se = n.get("stop_experience") or {}
    if se and se.get("duration_seconds") is not None:
        try:
            val = se.get("duration_seconds")
            if val is not None:
                out["stop_duration"] = int(float(val) / 60)
        except (TypeError, ValueError):
            logger.debug(
                "ignored invalid stop_experience.duration_seconds=%r for node=%r",
                se.get("duration_seconds"),
                n.get("id"),
            )
    return out


def _coerce_node_from_legacy_obj(n) -> Dict[str, Any]:
    flat: Dict[str, Any] = {}

    # Basic and optional fields
    flat.update(_coerce_node_basic_from_legacy_obj(n))
    flat.update(_coerce_node_coords_from_legacy_obj(n))
    flat.update(_coerce_node_schedule_from_legacy_obj(n))

    sd = getattr(n, "stop_duration", None)
    if sd is not None:
        flat["stop_duration"] = sd

    candidate_is_stop = getattr(n, "is_stop", None)
    flat["is_stop"] = True if candidate_is_stop is None else candidate_is_stop

    candidate_priority = getattr(n, "priority", None)
    if candidate_priority is not None:
        flat["priority"] = candidate_priority

    candidate_notes = getattr(n, "notes", None) or getattr(n, "fun_facts", None)
    if candidate_notes is not None:
        flat["notes"] = candidate_notes
        flat["fun_facts"] = candidate_notes

    candidate_country = getattr(n, "country", None) or getattr(n, "region", None)
    if candidate_country is not None:
        flat["country"] = candidate_country

    candidate_population = getattr(n, "population", None)
    if candidate_population is not None:
        flat["population"] = candidate_population

    return flat


def _coerce_node_basic_from_legacy_obj(n) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    name = getattr(n, "name", None)
    if name is not None:
        out["name"] = name
    return out


def _coerce_node_coords_from_legacy_obj(n) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    latv = getattr(n, "lat", None) or getattr(n, "latitude", None)
    if latv is not None:
        try:
            out["latitude"] = float(latv)
        except (TypeError, ValueError):
            logger.debug("ignored invalid latitude=%r for legacy obj", latv)
    lngv = getattr(n, "lng", None) or getattr(n, "longitude", None)
    if lngv is not None:
        try:
            out["longitude"] = float(lngv)
        except (TypeError, ValueError):
            logger.debug("ignored invalid longitude=%r for legacy obj", lngv)
    tzv = getattr(n, "timezone_offset", None) or getattr(n, "utc_offset", None)
    if tzv is not None:
        try:
            out["utc_offset"] = float(tzv)
        except (TypeError, ValueError):
            logger.debug("ignored invalid utc_offset=%r for legacy obj", tzv)
    return out


def _coerce_node_schedule_from_legacy_obj(n) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    arrival = getattr(n, "arrival_time", None)
    if arrival is not None:
        out["arrival_time"] = arrival
    departure = getattr(n, "departure_time", None)
    if departure is not None:
        out["departure_time"] = departure
    return out


def _coerce_node(n: Union[Dict[str, Any], Node, Location]) -> Dict[str, Any]:
    if isinstance(n, Node):
        return _coerce_node_from_node(n)
    if isinstance(n, dict):
        return _coerce_node_from_dict(n)
    return _coerce_node_from_legacy_obj(n)


def save_santa_route_to_json(
    locations: List[Union[Dict[str, Any], Node, Location]],
    json_file_path: Optional[str] = None,
):
    """Write a list of locations to disk using the legacy-compatible flat 'route' array.

    Accepts either dicts (normalized node dicts) or legacy Location-like objects.
    Produces a top-level JSON with key 'route' containing flat per-location
    dicts with legacy fields (for example: name, latitude, longitude,
    utc_offset, arrival_time, departure_time, stop_duration, is_stop,
    priority, notes, country, population).
    """
    if json_file_path is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(base_dir, "static", "data", "santa_route.json")

    route_data: List[Dict[str, Any]] = []

    for item in locations:
        coerced = _coerce_node(item)
        route_data.append(coerced)

    # write to disk using legacy-compatible top-level key "route"
    with open(json_file_path, "w", encoding="utf-8") as f:
        json.dump({"route": route_data}, f, indent=2, ensure_ascii=False)


def update_santa_location(location):
    # Accept normalized node dicts, Location/Node dataclasses, or legacy objects
    if isinstance(location, dict):
        # try several shapes
        if isinstance(location.get("location"), dict):
            location_name = (
                location["location"].get("name") or location.get("id") or "Unknown"
            )
        else:
            location_name = location.get("name") or location.get("id") or str(location)
    elif isinstance(location, Location):
        location_name = location.name
    elif isinstance(location, Node):
        location_name = (
            location.location.name
            if location.location
            else getattr(location, "id", str(location))
        )
    else:
        # fallback to attribute lookups
        location_name = (
            getattr(location, "name", None)
            or getattr(location, "id", None)
            or str(location)
        )
    logger.info("Santa current location updated to: %s", location_name)


def load_trial_route_from_json():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    if not os.path.exists(trial_route_path):
        return None
    return load_santa_route_from_json(trial_route_path)


def save_trial_route_to_json(locations: List[Union[Dict[str, Any], Node, Location]]):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    save_santa_route_to_json(locations, trial_route_path)


def delete_trial_route():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    if os.path.exists(trial_route_path):
        os.remove(trial_route_path)
        return True
    return False


def has_trial_route():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    return os.path.exists(trial_route_path)


def validate_locations(
    locations: List[Union[Dict[str, Any], Location]],
) -> Dict[str, Any]:
    """Validate a list of normalized node dicts or legacy Location-like objects.

    Returns a dict with keys:
    valid (bool), total_locations (int), errors (list), warnings (list).
    """
    errors: List[str] = []
    warnings: List[str] = []

    seen_names: Dict[str, int] = {}
    seen_coords: Dict[Tuple[float, float], int] = {}

    def _extract(loc_item: Union[Dict[str, Any], Location]) -> Dict[str, Any]:
        # returns {'name': str, 'lat': float, 'lng': float, 'tz': float}
        return _extract_loc_info(loc_item)

    for idx, loc_item in enumerate(locations):
        try:
            info = _extract(loc_item)
            name = info.get("name") or f"(index {idx})"

            # check for duplicate names
            if name in seen_names:
                errors.append(
                    f"Duplicate location name '{name}' at indices {seen_names[name]} "
                    f"and {idx}"
                )
            else:
                seen_names[name] = idx

            # delegate numeric & coordinate checks to helper
            sub_errors, sub_warnings = _validate_numeric_and_coord_checks(
                name,
                idx,
                info.get("lat"),
                info.get("lng"),
                info.get("tz"),
                seen_coords,
                locations,
            )
            errors.extend(sub_errors)
            warnings.extend(sub_warnings)

        except (TypeError, ValueError, KeyError, AttributeError) as exc:
            errors.append(f"error processing location at index {idx}: {exc}")

    return {
        "valid": len(errors) == 0,
        "total_locations": len(locations),
        "errors": errors,
        "warnings": warnings,
    }


def _extract_loc_info(loc_item: Union[Dict[str, Any], Location]) -> Dict[str, Any]:
    if isinstance(loc_item, dict):
        loc_field = loc_item.get("location")
        loc = loc_field if isinstance(loc_field, dict) else {}
        name = loc.get("name") or loc_item.get("id") or loc_item.get("name")
        lat = loc.get("lat")
        lng = loc.get("lng")
        tz = loc.get("timezone_offset")
        return {"name": name, "lat": lat, "lng": lng, "tz": tz}
    name = getattr(loc_item, "name", None) or getattr(loc_item, "id", None)
    lat = getattr(loc_item, "lat", None) or getattr(loc_item, "latitude", None)
    lng = getattr(loc_item, "lng", None) or getattr(loc_item, "longitude", None)
    tz = (
        getattr(loc_item, "timezone_offset", None)
        or getattr(loc_item, "utc_offset", None)
        or getattr(loc_item, "tz", None)
    )
    return {"name": name, "lat": lat, "lng": lng, "tz": tz}


def _validate_numeric_and_coord_checks(
    name: str,
    idx: int,
    lat: Any,
    lng: Any,
    tz: Any,
    seen_coords: Dict[Tuple[float, float], int],
    locations: List[Union[Dict[str, Any], Location]],
) -> Tuple[List[str], List[str]]:
    # Orchestrator that delegates detailed checks to focused helpers
    errors: List[str] = []
    warnings: List[str] = []

    latf, lngf, tzf, conv_errors = _convert_to_numeric(lat, lng, tz, name, idx)
    errors.extend(conv_errors)

    if latf is not None and lngf is not None:
        dup_warnings = _check_duplicate_coords(
            latf, lngf, name, idx, seen_coords, locations
        )
        warnings.extend(dup_warnings)

    range_errors, range_warnings = _range_and_tz_checks(latf, lngf, tzf, name, idx)
    errors.extend(range_errors)
    warnings.extend(range_warnings)

    return errors, warnings


def _convert_to_numeric(
    lat: Any, lng: Any, tz: Any, name: str, idx: int
) -> Tuple[Optional[float], Optional[float], Optional[float], List[str]]:
    """Convert lat/lng/tz to floats and collect conversion errors."""
    errors: List[str] = []
    try:
        latf = float(lat)
    except (TypeError, ValueError):
        errors.append(f"Invalid latitude for '{name}' (index {idx}): {lat}")
        latf = None
    try:
        lngf = float(lng)
    except (TypeError, ValueError):
        errors.append(f"Invalid longitude for '{name}' (index {idx}): {lng}")
        lngf = None
    try:
        tzf = float(tz) if tz is not None else None
    except (TypeError, ValueError):
        errors.append(f"Invalid UTC offset for '{name}' (index {idx}): {tz}")
        tzf = None
    return latf, lngf, tzf, errors


def _check_duplicate_coords(
    latf: float,
    lngf: float,
    name: str,
    idx: int,
    seen_coords: Dict[Tuple[float, float], int],
    locations: List[Union[Dict[str, Any], Location]],
) -> List[str]:
    """Check for near-duplicate coordinates and return warnings; updates seen_coords."""
    warnings: List[str] = []
    coord_key = (round(latf, 4), round(lngf, 4))
    if coord_key in seen_coords:
        other_idx = seen_coords[coord_key]
        other = locations[other_idx]
        if isinstance(other, dict):
            other_name = (
                (other.get("location") or {}).get("name")
                or other.get("id")
                or other.get("name")
            )
        else:
            other_name = (
                getattr(other, "name", None) or getattr(other, "id", None) or None
            )
        warnings.append(
            f"Very close coordinates for '{name}' (index {idx}) and "
            f"'{other_name}' (index {other_idx})"
        )
    else:
        seen_coords[coord_key] = idx
    return warnings


def _range_and_tz_checks(
    latf: Optional[float],
    lngf: Optional[float],
    tzf: Optional[float],
    name: str,
    idx: int,
) -> Tuple[List[str], List[str]]:
    """
    Validate numeric ranges for coordinates and timezone;
    also warn on unusual tz fractions.
    """
    errors: List[str] = []
    warnings: List[str] = []
    if latf is not None and not -90.0 <= latf <= 90.0:
        errors.append(f"Invalid latitude for '{name}' (index {idx}): {latf}")
    if lngf is not None and not -180.0 <= lngf <= 180.0:
        errors.append(f"Invalid longitude for '{name}' (index {idx}): {lngf}")
    if tzf is not None and not -12.0 <= tzf <= 14.0:
        errors.append(f"Invalid UTC offset for '{name}' (index {idx}): {tzf}")
    if tzf is not None:
        try:
            tzf_val = float(tzf)
        except (TypeError, ValueError):
            # keep behavior explicit instead of silently ignoring unexpected types
            warnings.append(f"Unusual UTC offset for '{name}' (index {idx}): {tzf}")
        else:
            # fractional part robust for negatives and floating imprecision
            frac = abs(tzf_val % 1)
            allowed = {0.0, 0.25, 0.5, 0.75}
            if not any(math.isclose(frac, a, abs_tol=1e-9) for a in allowed):
                warnings.append(f"Unusual UTC offset for '{name}': {tzf_val}")
    return errors, warnings


def _location_coerce_legacy_fields(loc: Location) -> None:
    """Coerce legacy field names into canonical numeric fields (lat/lng/tmz_offset).

    Raises ValueError/TypeError with the same messages as previous implementation so
    callers/tests observe identical behavior.
    """
    if loc.lat is None and loc.latitude is not None:
        try:
            loc.lat = float(loc.latitude)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid latitude: {loc.latitude}") from None
    if loc.lng is None and loc.longitude is not None:
        try:
            loc.lng = float(loc.longitude)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid longitude: {loc.longitude}") from None
    if loc.timezone_offset is None and loc.utc_offset is not None:
        try:
            loc.timezone_offset = float(loc.utc_offset)
        except (TypeError, ValueError):
            raise ValueError(f"Invalid timezone_offset: {loc.utc_offset}") from None


def _location_validate_and_normalize_coords(loc: Location) -> None:
    """
    Validate presence and ranges of coordinates
    and normalize longitude to [-180,180].
    """
    if loc.lat is None or loc.lng is None:
        raise ValueError("lat and lng are required for Location")
    if loc.timezone_offset is None:
        raise ValueError("timezone_offset is required for Location")

    latf = float(loc.lat)
    if not -90.0 <= latf <= 90.0:
        raise ValueError(f"Invalid latitude: {loc.lat}")
    loc.lat = latf

    lngf = float(loc.lng)
    loc.lng = ((lngf + 180.0) % 360.0) - 180.0

    tz = float(loc.timezone_offset)
    if not -12.0 <= tz <= 14.0:
        raise ValueError(f"Invalid timezone_offset: {loc.timezone_offset}")
    loc.timezone_offset = tz

    try:
        tzf = float(loc.timezone_offset)
    except (TypeError, ValueError):
        logger.warning(
            "Unusual UTC offset for location '%s': %s", loc.name, loc.timezone_offset
        )
    else:
        frac = abs(tzf % 1)
        allowed = {0.0, 0.25, 0.5, 0.75}
        if not any(math.isclose(frac, a, abs_tol=1e-9) for a in allowed):
            logger.warning("Unusual UTC offset for location '%s': %s", loc.name, tzf)


def _location_sync_legacy_fields_and_notes(loc: Location) -> None:
    """Keep legacy fields synchronized and handle backward-compatible mappings."""
    loc.latitude = loc.lat
    loc.longitude = loc.lng
    loc.utc_offset = loc.timezone_offset
    if loc.country is None and loc.region is not None:
        loc.country = loc.region
    if loc.notes is None and loc.fun_facts is not None:
        loc.notes = loc.fun_facts


def _location_validate_priority(loc: Location) -> None:
    """Validate optional priority field if present."""
    if loc.priority is not None and (
        not isinstance(loc.priority, int) or not (1 <= loc.priority <= 3)
    ):
        raise ValueError(f"Invalid priority: {loc.priority}")


def _load_source_to_obj(source):
    """
    Load the incoming source into a Python object
    and indicate if it came from file.
    """
    loaded_from_file = False
    if source is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        default_path = os.path.join(base_dir, "static", "data", "santa_route.json")
        if not os.path.exists(default_path):
            raise FileNotFoundError(default_path)
        with open(default_path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        loaded_from_file = True
    else:
        if isinstance(source, str):
            if os.path.exists(source):
                with open(source, "r", encoding="utf-8") as f:
                    obj = json.load(f)
                loaded_from_file = False
            else:
                obj = json.loads(source)
        else:
            obj = source
    return obj, loaded_from_file


def _get_nodes_from_obj(obj):
    if isinstance(obj, dict):
        nodes = (
            obj.get("nodes")
            or obj.get("route")
            or obj.get("route_nodes")
            or obj.get("stops")
            or []
        )
    elif isinstance(obj, list):
        nodes = obj
    else:
        raise TypeError("input must be JSON string, dict, list, or path to a JSON file")
    if not isinstance(nodes, list):
        raise ValueError("unable to locate nodes list in input JSON")
    return nodes


def _parse_and_normalize_nodes(nodes: List[Any]) -> List[Dict[str, Any]]:
    parsed_nodes: List[Dict[str, Any]] = []
    for idx, n in enumerate(nodes):
        try:
            # detect legacy flat schema and convert to node-equivalent dict
            if (
                isinstance(n, dict)
                and "location" not in n
                and "id" not in n
                and any(k in n for k in ("latitude", "longitude", "lat", "lng", "name"))
            ):
                n = _convert_flat_to_node_equiv(n, idx)
            parsed = _parse_location_entry(n)
            parsed_nodes.append(parsed)
        except (TypeError, ValueError, KeyError) as exc:
            logger.warning(
                "skipping node at index %d due to %s", idx, exc.__class__.__name__
            )
            logger.debug("node parse failure details", exc_info=True)
        except AttributeError as exc:
            logger.warning("skipping node at index %d: %s", idx, exc)
    return parsed_nodes


def _convert_flat_to_node_equiv(n: Dict[str, Any], idx: int) -> Dict[str, Any]:
    loc_name = n.get("name")
    lat = n.get("latitude") if "latitude" in n else n.get("lat")
    lng = n.get("longitude") if "longitude" in n else n.get("lng")
    tz = n.get("utc_offset") if "utc_offset" in n else n.get("timezone_offset")
    node_equiv = {
        "id": loc_name or f"node_{idx}",
        "location": {"name": loc_name, "lat": lat, "lng": lng, "timezone_offset": tz},
        "schedule": {
            "arrival_utc": n.get("arrival_time"),
            "departure_utc": n.get("departure_time"),
        },
        "stop_experience": {
            "duration_seconds": (
                int(n["stop_duration"] * 60)
                if n.get("stop_duration") is not None
                else None
            )
        },
        "notes": n.get("notes") or n.get("fun_facts"),
        "priority": n.get("priority"),
    }
    return node_equiv


def _parsed_nodes_to_locations(parsed_nodes: List[Dict[str, Any]]) -> List[Location]:
    locations: List[Location] = []
    for p in parsed_nodes:
        loc = p.get("location", {})
        stop = p.get("stop_experience", {}) or {}
        sched = p.get("schedule", {}) or {}
        stop_duration_minutes = None
        if stop.get("duration_seconds") is not None:
            try:
                stop_duration_minutes = int(float(stop.get("duration_seconds")) / 60)
            except (TypeError, ValueError):
                stop_duration_minutes = None
        try:
            utc_off = loc.get("timezone_offset")
            if utc_off is None:
                utc_off = 0.0
            location_obj = Location(
                name=loc.get("name") or p.get("id"),
                region=loc.get("region"),
                latitude=loc.get("lat"),
                longitude=loc.get("lng"),
                utc_offset=utc_off,
                arrival_time=sched.get("arrival_utc"),
                departure_time=sched.get("departure_utc"),
                stop_duration=stop_duration_minutes,
                is_stop=True,
                priority=p.get("priority"),
                notes=p.get("notes"),
                fun_facts=p.get("notes"),
                country=loc.get("region"),
            )
        except (TypeError, ValueError) as exc:
            logger.warning(
                "skipping node while constructing Location %s", exc.__class__.__name__
            )
            logger.debug("Location construction failure details", exc_info=True)
            continue
        locations.append(location_obj)
    return locations


def create_location_from_payload(data: Dict[str, Any]) -> Location:
    """Create a `Location` instance from a flat payload dict (admin API payload).

    This centralizes parsing/validation for incoming admin payloads. It raises
    `ValueError` or `TypeError` on invalid/missing fields to mirror previous
    validation behavior.
    """
    if not isinstance(data, dict):
        raise TypeError("payload must be a dict")

    # Support both 'name' and 'location' keys for backward compatibility
    name = data.get("name") or data.get("location")
    if not name:
        raise ValueError("Missing required field: name")

    # Notes/back-compat
    notes = data.get("notes") if "notes" in data else data.get("fun_facts")

    # Use legacy field names so Location.__post_init__ can coerce
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    utc_offset = data.get("utc_offset")

    loc = Location(
        name=name,
        latitude=latitude,
        longitude=longitude,
        utc_offset=utc_offset,
        arrival_time=data.get("arrival_time"),
        departure_time=data.get("departure_time"),
        country=data.get("country"),
        population=data.get("population"),
        priority=data.get("priority"),
        notes=notes,
        fun_facts=data.get("fun_facts"),
        stop_duration=data.get("stop_duration"),
        is_stop=data.get("is_stop", True),
    )

    return loc
