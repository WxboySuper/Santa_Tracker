# Route Editor: Status Calculation Logic

This logic runs every time the Admin adds a node or adjusts a path in the Editor.

## 1. Inputs

- Previous Node (A): Departure Time (UTC)
- Current Node (B): Latitude/Longitude, Timezone Offset

Settings:

- Cinematic Speed (km/h) — variable based on distance
- Stop Duration (default: 60s)

## 2. Calculation Steps

### Step 0 — The Anchor (North Pole Hard Lock)

- Node 0 is ALWAYS the North Pole (90.0, 0.0).
- It does not have a set "Departure Time" until Node 1 is created.
- Calculation:
  - Determine desired arrival at Node 1 (e.g., midnight local).
  - Calculate travel time (Node 0 -> Node 1).
  - North Pole departure = Node 1 arrival − travel time.
- Constraint: The North Pole node cannot be deleted or moved.

### Step A — Distance & Travel Time

1. Calculate the Haversine distance between A and B.
2. Apply the cinematic speed curve to determine travel speed and seconds.

Speed rules (as implemented in tools/route-editor/src/utils/cinematicLogic.js):

| Distance range (km) | Speed mode              |                          Speed (km/h) | Notes / formula                                   |
|--------------------:|-------------------------|--------------------------------------:|---------------------------------------------------|
|             >= 5000 | HYPERSONIC_LONG         |                                60,000 | Extreme long-haul (e.g., North Pole launch)       |
|           800–4,999 | HYPERSONIC              |                                14,000 | Long-haul / ocean crossings                       |
|             451–799 | REGIONAL (interpolated) | interpolated between 2,050 and 14,000 | Smooth transition between cruising and hypersonic |
|              <= 450 | CRUISING                |                                 2,050 | Short regional hops                               |

- Distance thresholds (km):
  - HYPERSONIC_LONG: 5000
  - HYPERSONIC: 800
  - CRUISING: 450

Result: TravelSeconds (seconds)

### Step B — Arrival Time (UTC)

ArrivalUTC = PrevDepartureUTC + TravelSeconds

### Step C — Local Time Conversion

Convert the arrival instant to local time for evaluation:

LocalTimeDecimal = (ArrivalUTC_in_hours + TimezoneOffset)

Example: 14.5 ⇒ 14:30 (2:30 PM)

> Note: Some validation logic below uses values greater than 24 to represent times after midnight (e.g., 26.0 == 02:00 next day).

### Step D — The "Traffic Light" Validator

The docs now reflect the exact time-window constants used in the editor's cinematic logic utility.

Time window constants (decimal hours) from cinematicLogic.js:

- GREEN_START: 22.68 (approx. 22:40:48 — developer-commented as ~10:45 PM)
- GREEN_END: 27.25 (27.25 decimal hours)
- YELLOW_EARLY: 22.5 (10:30 PM)
- YELLOW_LATE: 28.0 (3:00 AM of the next day boundary used in code comments as 3:30)

Evaluate the local arrival time against the target window (using the numeric constants above):

- GREEN Zone (Ideal):
  - GREEN_START (22.68) ⇐ LocalTime ⇐ GREEN_END (27.25)

- YELLOW Zone (Warning):
  - Early: YELLOW_EARLY (22.5) ⇐ LocalTime < GREEN_START (22.68)
  - Late: GREEN_END (27.25) < LocalTime ⇐ YELLOW_LATE (28.0)

- RED Zone (Error):
  - LocalTime < YELLOW_EARLY (22.5) — Too early
  - LocalTime > YELLOW_LATE (28.0) — Too late

> Note: The JS implementation normalizes times < 12 by adding 24 before comparison (so 1:30 AM becomes 25.5), and then applies the numeric thresholds above.

### Step E — Camera State Assignment

- If TravelSeconds > 900 (15 minutes):
  - set transit_to_here.camera_zoom = LOW (globe-level)
- Else:
  - set transit_to_here.camera_zoom = MEDIUM (region-level)

## 3. The "Wiggle Room" Strategy (Implementation)

When the Route Editor returns a YELLOW status:

- The Admin UI shows a warning, e.g. "Arriving at 10:45 PM. Acceptable?"
- If the Admin accepts, the system flags the node as `valid_early_arrival`.

If the Admin wants to fix the timing, options include:

- Increase Travel Time (manual override of speed or path).
- Increase Stop Duration of the previous node (the "cookie break" strategy).

---

If you'd like, I can also:
- Add a small pseudocode reference implementation for these steps.
- Provide unit-test scaffolding that asserts the traffic-light boundaries.
- Convert the numeric-window logic to a normalized time function that avoids >24 arithmetic.
