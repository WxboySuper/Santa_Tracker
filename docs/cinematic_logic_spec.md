# Santa Tracker: Cinematic Logic Specification

## Core Philosophy

"The Magic Over The Math."

The primary goal is viewer engagement. We prioritize smooth geographical paths and exciting visuals over strict timezone adherence.

## 1. The Timeline & "The Window"

We calculate validity based on Local Arrival Time.

Target Window (The Sweet Spot)

- Green (Ideal): 11:00 PM (23:00) — 2:00 AM (02:00)
  - Narrative: Everyone is asleep; Santa is in the zone.

- Yellow (Warning):
  - Early: 10:30 PM — 11:00 PM
  - Late: 2:00 AM — 3:30 AM
  - Narrative: Valid, but risky. Used for "leniency" hops (e.g., short island jumps).

- Red (Broken):
  - Before 10:30 PM (Risk when kids may be awake)
  - After 3:30 AM (Early risers / sunlight risk)

### Phase 1: The Hype Build (Launch)

- Start Location: North Pole
- Target: First delivery node (e.g., Kiritimati)

Logic: The start time at the North Pole is back-calculated from the first delivery.

Example:
- If First Delivery is 00:00 (UTC+14) and travel time is ~9 minutes,
- North Pole departure ≈ 23:51 (UTC+14) the previous day.

Visuals: Maximum cinematic zoom. Santa is "deploying."

## 2. Stop Types & Pacing

The "stop duration" is a narrative tool, not a logistical one. Typical stop types:

| Stop Type     | Typical Duration | Use Case / Notes                                                        |
|---------------|------------------|-------------------------------------------------------------------------|
| Standard      | 60s              | Default for ~90% of locations.                                          |
| Major         | 120s             | Major metros (e.g., London, NYC, Tokyo); allows time for facts/visuals. |
| Flyby         | 0s               | Dense clusters or neighborhoods — quick drops without stopping.         |
| Refuel / Rest | 300s+            | Optional cookie break to reset time if Santa gets too far ahead.        |

## 3. The Camera Director (Auto-Zoom)

The zoom level is dictated by the current action state, not just user input.

- **State A — The Delivery (Stop)**
  - Action: Arrived at node
  - Zoom: High (city / street level)
  - Focus: The sleigh, the counter incrementing, local facts

- **State B — Short Hop (Inter-island / Region)**
  - Action: Local and regional travel
  - Zoom: Medium (region level)
  - Focus: The path to the immediate next target

- **State C — Long Haul (Ocean Crossing)**
  - Action: Long-haul travel (supersonic / hypersonic visualization)
  - Zoom: Low (globe / curvature level)
  - Focus: The grandeur of the flight; allows Santa to move visually faster

Note: Users can toggle a "Manual Mode" to override auto-zoom, but "Auto" is the default.
