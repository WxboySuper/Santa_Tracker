# 2026 route rebuild: the midnight sweep

Owner direction, 2026-11-25, after reviewing the draft on a map. The 160-stop draft zig-zagged between Brisbane,
Honiara and Sydney, between Göbekli Tepe, Helsinki and Istanbul, and between São Paulo, Greenland and Suriname.
The route needs a new order and a larger candidate pool.

## The idea

Santa follows midnight west around the world in one continuous sweep and visits as many places as the flight window
allows.

1. **Westward sweep.** Move west with local midnight. An eastward leg is a defect unless its leg record has one of
   the reason codes below. The local-time window alone does not justify backtracking.
2. **Use the full local window.** Deliver between 23:00 Dec 24 and 05:00 Dec 25 at each destination. Do not pin
   arrivals to 01:00. South of 35 degrees latitude, stop by 02:30 local time because late-December nights are short.
3. **Maximize stops, then country coverage.** There is no fixed total. Aim for 550-700 stops when the candidate pool,
   timing, speed, separation, tier dwell and return deadline allow it. At least 500 stops is the current scale check.
   Cover countries and territories along the sweep before adding extra stops where they fit.
4. **Fill local clusters.** Process real UTC-offset bands, including half-hour and quarter-hour bands. Within a band,
   favor short nearby hops and alternate the preferred latitude direction from band to band. Do not jump across a
   region to collect a distant offset band.
5. **Geography decides.** Drop or replace places that force a detour. Category and population weights choose among
   nearby places; they do not set quotas.
6. **No hand-pinned order.** The route order comes from the seeded sweep algorithm. It has no pinned stop sequence,
   arrival anchors, UTC-offset caps or fixed route total.

## Fixed constraints

- Takeoff from the North Pole at 2026-12-24 10:00 UTC. Return by 2026-12-25 14:00 UTC.
- A 60-second dwell applies to a major stop, 30 seconds to a city, 10 seconds to a town and 3 seconds to a hop.
- Tier a stop as `major` when population is at least 1,000,000, it is a national capital with population at least
  250,000, or it is a curated headline landmark in the `special` or `cultural` category. A `city` has population
  from 100,000 through 999,999, is another national capital, or is another curated landmark. A `town` has
  population from 5,000 through 99,999. Other stops, including places with unknown population, are `hop`.
- A delivery can begin after the prior stop's dwell and the travel time at the planning speed. No extra arrival-gap
  minimum applies.
- Leg speed p90 is at most 20,000 km/h. No leg may exceed 25,000 km/h.
- Stops must be at least 20 km apart. This lets nearby major-city pairs such as Mexico City and Teotihuacan both
  remain in the candidate pool without an exception list.
- Local legs use a 4,000 km/h planning speed. Legs of at least 1,500 km use 19,000 km/h only for cross-continent,
  island or polar crossings. Long overland legs keep the local speed.
- Keep the current tone rules and sensitive-place veto list.
- Expected landmark candidates include the Great Wall, Angkor and Machu Picchu.

## Country limit

The generator allows at most twelve stops per country. This ceiling prevents the large populated-place inventories
in countries such as the United States, China and India from taking over the route while leaving room to add dense
town and village clusters. The route prioritizes stop count, then country coverage, within this limit.

## Eastward legs

Measure longitude movement after date-line unwrapping. An eastward leg is movement by more than 1 degree. It is
allowed only with one of these machine-readable reason codes, stored as `transit_to_here.eastward_reason`:

- `dateline`: an early leg near the date line into the UTC+13 or UTC+14 Pacific, before the sweep is established.
- `offset-anomaly`: the destination's UTC offset puts its local midnight earlier than its longitude suggests, and
  the destination is still inside its 23:00-05:00 window. Examples include China's single time zone, western
  Kazakhstan, Spain on UTC+1 and Argentina on UTC-3.
- `return`: the final leg to the North Pole.

Any other eastward leg fails review. A detour is a stop where the two-leg path through it is more than 2.5 times the
direct distance between its neighboring stops. The route must not add detours during local search. List all
eastward legs and any detour flags in the review page.

## What the generator reports

Report total stops, stop-tier counts, countries and territories covered, stops per continent and UTC-offset band,
path length, leg speed median, p90 and maximum, local-arrival histogram, every eastward leg and its reason, detour
flags, the 20 longest legs, and the share of the candidate snapshot's population estimate within 500 km of a stop.
The current candidate snapshot has no state, province or territory identifier, so subnational coverage cannot be
measured from these files.
