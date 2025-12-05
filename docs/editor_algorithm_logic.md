Route Editor: Status Calculation Logic

This logic runs every time the Admin adds a node or adjusts a path in the Editor.

1. Inputs

Previous Node (A): Departure Time (UTC).

Current Node (B): Lat/Lng, Timezone Offset.

Settings:

Cinematic Speed (km/h) - Variable based on distance.

Stop Duration (Default 60s).

2. Calculation Steps

Step 0: The Anchor (North Pole Hard Lock)

Node 0 is ALWAYS the North Pole (90.0, 0.0).

Logic: It does not have a set "Departure Time" until Node 1 is created.

Calculation:

Determine Desired Arrival at Node 1 (e.g., Midnight Local).

Calculate Travel Time (Node 0 -> Node 1).

North Pole Departure = Node 1 Arrival - Travel Time.

Constraint: The North Pole node cannot be deleted or moved.

Step A: Distance & Travel Time

Calculate Haversine Distance between A and B.

Apply Cinematic Speed Curve:

IF Distance > 2000km: Speed = Hypersonic (Travel time = Dist / FastSpeed).

IF Distance < 500km: Speed = Cruising (Travel time = Dist / NormalSpeed).

Result: TravelSeconds.

Step B: Arrival Time (UTC)

ArrivalUTC = PrevDepartureUTC + TravelSeconds.

Step C: Local Time Conversion

LocalTimeDecimal = (ArrivalUTC (in hours) + TimezoneOffset) % 24.
Example: 14.5 = 2:30 PM.

Step D: The "Traffic Light" Validator

Rules:

GREEN Zone: 23.0 (11pm) <= LocalTime <= 26.0 (2am next day).

YELLOW Zone (Warning):

Early: 22.5 (10:30pm) <= LocalTime < 23.0.

Late: 26.0 (2am) < LocalTime <= 27.5 (3:30am).

RED Zone (Error):

LocalTime < 22.5 (Too early).

LocalTime > 27.5 (Too late).

Step E: Camera State Assignment

IF TravelSeconds > 900 (15 mins):

Set transit_to_here.camera_zoom to LOW (Globe).

ELSE:

Set transit_to_here.camera_zoom to MEDIUM (Region).

3. The "Wiggle Room" Strategy (Implementation)

If the Route Editor returns a YELLOW status:

Admin UI shows a warning: "Arriving at 10:45 PM. Acceptable?"

Admin accepts.

System flags node as valid_early_arrival.

If the Admin wants to fix it, they can:

Increase Travel Time (Manual Override).

Increase Stop Duration of Previous node (The "Cookie Break" strategy).