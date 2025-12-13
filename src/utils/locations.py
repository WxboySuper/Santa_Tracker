import json
import logging
import os
from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List, Tuple, Union

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

    # Note: do not preserve raw_lng; we validate longitude strictly

    def __post_init__(self):
        # allow legacy field names to populate canonical ones
        if self.lat is None and self.latitude is not None:
            try:
                self.lat = float(self.latitude)
            except (TypeError, ValueError):
                raise ValueError(f"Invalid latitude: {self.latitude}")
        if self.lng is None and self.longitude is not None:
            try:
                self.lng = float(self.longitude)
            except (TypeError, ValueError):
                raise ValueError(f"Invalid longitude: {self.longitude}")
        if self.timezone_offset is None and self.utc_offset is not None:
            try:
                self.timezone_offset = float(self.utc_offset)
            except (TypeError, ValueError):
                raise ValueError(f"Invalid timezone_offset: {self.utc_offset}")

        # ensure we have required numeric coords
        if self.lat is None or self.lng is None:
            raise ValueError("lat and lng are required for Location")

        # latitude validation
        latf = float(self.lat)
        if not -90.0 <= latf <= 90.0:
            raise ValueError(f"Invalid latitude: {self.lat}")
        self.lat = latf

        # longitude validation (normalize into [-180, 180])
        lngf = float(self.lng)
        # normalize longitude into [-180, 180)
        self.lng = ((lngf + 180.0) % 360.0) - 180.0

        # timezone validation
        tz = float(self.timezone_offset)
        if not -12.0 <= tz <= 14.0:
            raise ValueError(f"Invalid timezone_offset: {self.timezone_offset}")
        self.timezone_offset = tz

        # warn on unusual fractional timezone offsets (e.g., 3.25)
        try:
            frac = abs(self.timezone_offset - int(self.timezone_offset))
            if frac not in (0.0, 0.5):
                # uncommon offset (not integer or half-hour)
                logger.warning("Unusual UTC offset for location '%s': %s", self.name, self.timezone_offset)
        except Exception:
            pass

        # keep legacy fields consistent
        self.latitude = self.lat
        self.longitude = self.lng
        self.utc_offset = self.timezone_offset
        if self.country is None and self.region is not None:
            self.country = self.region

        # map fun_facts into notes for backward compatibility
        if self.notes is None and self.fun_facts is not None:
            self.notes = self.fun_facts

        # validate priority if present
        if self.priority is not None:
            if not isinstance(self.priority, int) or not (1 <= self.priority <= 3):
                raise ValueError(f"Invalid priority: {self.priority}")

    @property
    def coordinates(self) -> Tuple[float, float]:
        return self.lat, self.lng

    # legacy attribute names are stored as dataclass fields (latitude, longitude, utc_offset)
    # and are synchronized to canonical fields (lat/lng/timezone_offset) in __post_init__.
    # Avoid defining properties that shadow these field names.


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

    def __init__(self):
        self.name = None

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
            raise ValueError(f"expected numeric string for key '{key}', got: {value}")
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
            raise ValueError(f"expected integer-like string for '{key}', got: {v!r}")
    raise TypeError(f"unsupported type for '{key}': {type(v).__name__}")

def _second_to_minutes(seconds: Any) -> Optional[int]:
    if seconds is None:
        return None
    try:
        s = int(seconds)
        return int(round(s / 60.0))
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
            "presents_delivered_at_stop": _safe_get_int(stop, "presents_delivered_at_stop") or 0,
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


def load_santa_route_from_json(source: Optional[Union[str, Dict[str, Any], List[Any]]] = None) -> List[Union[Dict[str, Any], Location]]:
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
    loaded_from_file = False

    # if no source provided, use the default file path
    if source is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        default_path = os.path.join(base_dir, "static", "data", "santa_route.json")
        if not os.path.exists(default_path):
            # preserve previous behavior expected by callers: raise to indicate missing data
            raise FileNotFoundError(default_path)
        with open(default_path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        loaded_from_file = True
    else:
        # if a string is provided, treat it as either a path to a file or raw JSON
        if isinstance(source, str):
            # path to file? Treat explicit path as programmatic load (return dicts)
            if os.path.exists(source):
                with open(source, "r", encoding="utf-8") as f:
                    obj = json.load(f)
            else:
                # assume raw JSON string
                obj = json.loads(source)
        else:
            obj = source

    # tolerant extraction of nodes
    if isinstance(obj, dict):
        nodes = obj.get("nodes") or obj.get("route") or obj.get("route_nodes") or obj.get("stops") or []
    elif isinstance(obj, list):
        nodes = obj
    else:
        raise TypeError("input must be JSON string, dict, list, or path to a JSON file")

    if not isinstance(nodes, list):
        raise ValueError("unable to locate nodes list in input JSON")

    parsed_nodes: List[Dict[str, Any]] = []
    for idx, n in enumerate(nodes):
        # Accept legacy flat route entries (e.g., from older santa_route.json) which have
        # keys like 'name', 'latitude', 'longitude', 'utc_offset' at top-level.
        if isinstance(n, dict) and "location" not in n and "id" not in n:
            # Try to detect flat schema
            if any(k in n for k in ("latitude", "longitude", "lat", "lng", "name")):
                loc_name = n.get("name")
                lat = n.get("latitude") if "latitude" in n else n.get("lat")
                lng = n.get("longitude") if "longitude" in n else n.get("lng")
                tz = n.get("utc_offset") if "utc_offset" in n else n.get("timezone_offset")
                node_equiv = {
                    "id": loc_name or f"node_{idx}",
                    "location": {"name": loc_name, "lat": lat, "lng": lng, "timezone_offset": tz},
                    "schedule": {"arrival_utc": n.get("arrival_time"), "departure_utc": n.get("departure_time")},
                    "stop_experience": {"duration_seconds": (int(n["stop_duration"] * 60) if n.get("stop_duration") is not None else None)},
                    "notes": n.get("notes") or n.get("fun_facts"),
                    "priority": n.get("priority"),
                }
                n = node_equiv
        try:
            parsed = _parse_location_entry(n)
            parsed_nodes.append(parsed)
        except Exception as exc:
            logger.warning("skipping node at index %d: %s", idx, exc)

    # always return normalized node dicts (new canonical schema)
    if loaded_from_file:
        # Convert parsed node dicts into legacy-compatible Location objects for app endpoints
        locations: List[Location] = []
        for p in parsed_nodes:
            loc = p.get("location", {})
            stop = p.get("stop_experience", {}) or {}
            sched = p.get("schedule", {}) or {}
            # convert stop duration seconds to minutes for legacy stop_duration field
            stop_duration_minutes = None
            if stop.get("duration_seconds") is not None:
                try:
                    stop_duration_minutes = int(int(stop.get("duration_seconds")) / 60)
                except Exception:
                    stop_duration_minutes = None
            try:
                location_obj = Location(
                    name=loc.get("name") or p.get("id"),
                    region=loc.get("region"),
                    latitude=loc.get("lat"),
                    longitude=loc.get("lng"),
                    utc_offset=loc.get("timezone_offset") if loc.get("timezone_offset") is not None else 0.0,
                    arrival_time=sched.get("arrival_utc"),
                    departure_time=sched.get("departure_utc"),
                    stop_duration=stop_duration_minutes,
                    is_stop=True,
                    priority=p.get("priority"),
                    notes=p.get("notes"),
                    fun_facts=p.get("notes"),
                    country=loc.get("region"),
                )
            except Exception as exc:
                logger.warning("skipping node while constructing Location at id %s: %s", p.get("id"), exc)
                continue
            locations.append(location_obj)
        return locations

    # For programmatic (non-file) loads, remove legacy/top-level fields like notes and priority
    for p in parsed_nodes:
        p.pop("notes", None)
        p.pop("priority", None)
    return parsed_nodes


def save_santa_route_to_json(locations: List[Union[Dict[str, Any], Node, Location]], json_file_path: Optional[str] = None):
    """Write a list of locations to disk using the legacy-compatible flat 'route' array.

    Accepts either dicts (normalized node dicts) or legacy Location-like objects.
    Produces a top-level JSON with key 'route' containing flat per-location dicts
    with fields like name, latitude, longitude, utc_offset, arrival_time, departure_time, stop_duration, is_stop, priority, notes, country, population.
    """
    if json_file_path is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(base_dir, "static", "data", "santa_route.json")

    route_data: List[Dict[str, Any]] = []

    def _coerce_node(n: Union[Dict[str, Any], Node, Location]) -> Dict[str, Any]:
        # Build a flat legacy-compatible dict for each location
        flat: Dict[str, Any] = {}
        if isinstance(n, dict):
            loc = n.get("location") if isinstance(n.get("location"), dict) else {}
            # only set keys when values are present
            name = loc.get("name") or n.get("id") or n.get("name")
            if name is not None:
                flat["name"] = name
            lat = loc.get("lat")
            if lat is not None:
                flat["latitude"] = float(lat)
            lng = loc.get("lng")
            if lng is not None:
                flat["longitude"] = float(lng)
            tz = loc.get("timezone_offset")
            if tz is not None:
                flat["utc_offset"] = float(tz)
            arrival = (n.get("schedule") or {}).get("arrival_utc") if (n.get("schedule")) else None
            if arrival is not None:
                flat["arrival_time"] = arrival
            departure = (n.get("schedule") or {}).get("departure_utc") if (n.get("schedule")) else None
            if departure is not None:
                flat["departure_time"] = departure
            se = n.get("stop_experience") or {}
            if se and se.get("duration_seconds") is not None:
                try:
                    flat["stop_duration"] = int(int(se.get("duration_seconds")) / 60)
                except Exception:
                    pass
            flat["is_stop"] = True
            if n.get("priority") is not None:
                flat["priority"] = n.get("priority")
            if n.get("notes") is not None:
                flat["notes"] = n.get("notes")
                flat["fun_facts"] = n.get("notes")
            if loc.get("region") is not None:
                flat["country"] = loc.get("region")
            if n.get("population") is not None:
                flat["population"] = n.get("population")
            return flat

        # Legacy object shaped input: map attributes
        name = getattr(n, "name", None)
        if name is not None:
            flat["name"] = name
        latv = getattr(n, "lat", None) or getattr(n, "latitude", None)
        if latv is not None:
            flat["latitude"] = float(latv)
        lngv = getattr(n, "lng", None) or getattr(n, "longitude", None)
        if lngv is not None:
            flat["longitude"] = float(lngv)
        tzv = getattr(n, "timezone_offset", None) or getattr(n, "utc_offset", None)
        if tzv is not None:
            flat["utc_offset"] = float(tzv)
        arrival = getattr(n, "arrival_time", None)
        if arrival is not None:
            flat["arrival_time"] = arrival
        departure = getattr(n, "departure_time", None)
        if departure is not None:
            flat["departure_time"] = departure
        sd = getattr(n, "stop_duration", None)
        if sd is not None:
            flat["stop_duration"] = sd
        is_stop_val = getattr(n, "is_stop", None)
        flat["is_stop"] = True if is_stop_val is None else is_stop_val
        if getattr(n, "priority", None) is not None:
            flat["priority"] = getattr(n, "priority", None)
        notesv = getattr(n, "notes", None) or getattr(n, "fun_facts", None)
        if notesv is not None:
            flat["notes"] = notesv
            flat["fun_facts"] = notesv
        countryv = getattr(n, "country", None) or getattr(n, "region", None)
        if countryv is not None:
            flat["country"] = countryv
        if getattr(n, "population", None) is not None:
            flat["population"] = getattr(n, "population", None)
        return flat

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
            location_name = location["location"].get("name") or location.get("id") or "Unknown"
        else:
            location_name = location.get("name") or location.get("id") or str(location)
    elif isinstance(location, Location):
        location_name = location.name
    elif isinstance(location, Node):
        location_name = location.location.name if location.location else getattr(location, "id", str(location))
    else:
        # fallback to attribute lookups
        location_name = getattr(location, "name", None) or getattr(location, "id", None) or str(location)
    logger.info("Santa current location updated to: %s", location_name)


def load_trial_route_from_json():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    trial_route_path = os.path.join(base_dir, "static", "data", "trial_route.json")
    if not os.path.exists(trial_route_path):
        return None
    with open(trial_route_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return load_santa_route_from_json(data)


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


def validate_locations(locations: List[Union[Dict[str, Any], Location]]) -> Dict[str, Any]:
    """Validate a list of normalized node dicts or legacy Location-like objects.

    Returns a dict with keys: valid (bool), total_locations (int), errors (list), warnings (list).
    """
    errors: List[str] = []
    warnings: List[str] = []

    seen_names: Dict[str, int] = {}
    seen_coords: Dict[Tuple[float, float], int] = {}

    def _extract(loc_item: Union[Dict[str, Any], Location]) -> Dict[str, Any]:
        # returns {'name': str, 'lat': float, 'lng': float, 'tz': float}
        if isinstance(loc_item, dict):
            # normalized node dict
            loc = loc_item.get("location") if isinstance(loc_item.get("location"), dict) else {}
            name = loc.get("name") or loc_item.get("id") or loc_item.get("name")
            lat = loc.get("lat")
            lng = loc.get("lng")
            tz = loc.get("timezone_offset")
            return {"name": name, "lat": lat, "lng": lng, "tz": tz}
        # legacy object
        name = getattr(loc_item, "name", None) or getattr(loc_item, "id", None)
        lat = getattr(loc_item, "lat", None) or getattr(loc_item, "latitude", None)
        lng = getattr(loc_item, "lng", None) or getattr(loc_item, "longitude", None)
        tz = getattr(loc_item, "timezone_offset", None) or getattr(loc_item, "utc_offset", None) or getattr(loc_item, "tz", None)
        return {"name": name, "lat": lat, "lng": lng, "tz": tz}

    for idx, loc_item in enumerate(locations):
        try:
            info = _extract(loc_item)
            name = info.get("name") or f"(index {idx})"
            # duplicate name check
            if name in seen_names:
                errors.append(f"Duplicate location name '{name}' at indices {seen_names[name]} and {idx}")
            else:
                seen_names[name] = idx

            # numeric validation
            lat = info.get("lat")
            lng = info.get("lng")
            tz = info.get("tz")
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

            if latf is not None and lngf is not None:
                coord_key = (round(latf, 4), round(lngf, 4))
                if coord_key in seen_coords:
                    # determine other location's name safely
                    other_idx = seen_coords[coord_key]
                    other = locations[other_idx]
                    if isinstance(other, dict):
                        other_name = (other.get("location") or {}).get("name") or other.get("id") or other.get("name")
                    else:
                        other_name = getattr(other, "name", None) or getattr(other, "id", None) or None
                    warnings.append(
                        f"Very close coordinates for '{name}' (index {idx}) and '{other_name}' (index {other_idx})"
                    )
                else:
                    seen_coords[coord_key] = idx

            if latf is not None and not -90.0 <= latf <= 90.0:
                errors.append(f"Invalid latitude for '{name}' (index {idx}): {latf}")
            if lngf is not None and not -180.0 <= lngf <= 180.0:
                errors.append(f"Invalid longitude for '{name}' (index {idx}): {lngf}")
            if tzf is not None and not -12.0 <= tzf <= 14.0:
                errors.append(f"Invalid UTC offset for '{name}' (index {idx}): {tzf}")
            # warn on unusual fractional timezone offsets (not integer or half-hour)
            try:
                if tzf is not None:
                    frac = abs(tzf - int(tzf))
                    if frac not in (0.0, 0.5):
                        warnings.append(f"Unusual UTC offset for '{name}': {tzf}")
            except Exception:
                pass

        except Exception as exc:
            errors.append(f"error processing location at index {idx}: {exc}")

    return {"valid": len(errors) == 0, "total_locations": len(locations), "errors": errors, "warnings": warnings}
