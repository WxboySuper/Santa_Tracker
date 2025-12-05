/**
 * Cinematic Logic Utilities for Santa Tracker Route Editor
 * 
 * Implements the calculation logic defined in docs/editor_algorithm_logic.md
 * and docs/cinematic_logic_spec.md
 * 
 * @module cinematicLogic
 */

// ============================================================================
// Constants
// ============================================================================

/** Earth's radius in kilometers */
const EARTH_RADIUS_KM = 6371;

/**
 * Speed thresholds and values (km/h)
 *
 * Speed tiers from fastest to slowest:
 * - HYPERSONIC_LONG: ~65,000 km/h - For extreme distances like North Pole to first stop (~9800km in ~9min)
 * - HYPERSONIC: 10,000 km/h - For long-haul ocean crossings (>2000km)
 * - CRUISING: 1,500 km/h - For short regional hops (<500km)
 */
const SPEED = {
    HYPERSONIC_LONG: 60000, // For extreme long-haul (>5000km) - "The Launch"
    HYPERSONIC: 14000,      // For long-haul ocean crossings (2000-5000km)
    CRUISING: 2050,         // For short regional hops (<500km)
};

/** Distance thresholds for speed curve selection (km) */
const DISTANCE_THRESHOLD = {
    HYPERSONIC_LONG: 5000,  // Use hypersonic_long speed above this distance (e.g., North Pole launch)
    HYPERSONIC: 800,       // Use hypersonic speed above this distance
    CRUISING: 450,          // Use cruising speed below this distance
};

/** Time window boundaries (in decimal hours, where 24 = midnight, 25 = 1am, etc.) */
const TIME_WINDOW = {
    GREEN_START: 22.68,   // 10:45 PM
    GREEN_END: 27.25,     // 2:30 AM (next day)
    YELLOW_EARLY: 22.5,  // 10:30 PM (early warning)
    YELLOW_LATE: 28.0,   // 3:30 AM (late warning)
};

// ============================================================================
// Distance Calculation
// ============================================================================

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula.
 * 
 * @param {number} lat1 - Latitude of point A in degrees
 * @param {number} lng1 - Longitude of point A in degrees
 * @param {number} lat2 - Latitude of point B in degrees
 * @param {number} lng2 - Longitude of point B in degrees
 * @returns {number} Distance in kilometers
 * 
 * @example
 * // Distance from North Pole to Kiritimati
 * const distance = calculateDistance(90.0, 0.0, 1.872, -157.36);
 * console.log(distance); // ~9800 km
 */
export function calculateDistance(lat1, lng1, lat2, lng2) {
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lng2 - lng1);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
}

// ============================================================================
// Travel Time Calculation
// ============================================================================

/**
 * Calculates cinematic travel time based on distance, using variable speed curves.
 * 
 * Speed Logic (from editor_algorithm_logic.md):
 * - Distance > 2000km: HYPERSONIC (~10,000 km/h) - Fast ocean travel
 * - Distance < 500km: CRUISING (~1,500 km/h) - Slower, visible travel
 * - Between 500-2000km: Interpolated speed for smooth transitions
 * 
 * @param {number} distanceKm - Distance to travel in kilometers
 * @returns {{ durationSeconds: number, speedKmh: number, speedCurve: 'HYPERSONIC' | 'CRUISING' | 'INTERPOLATED' }}
 *
 * @example
 * // Extreme long haul (hypersonic_long) - like North Pole to Kiritimati
 * calculateCinematicTravelTime(9800); // { durationSeconds: ~543, speedKmh: 65000, speedCurve: 'HYPERSONIC_LONG' }
 *
 * // Long haul (hypersonic)
 * calculateCinematicTravelTime(3000); // { durationSeconds: 1080, speedKmh: 10000, speedCurve: 'HYPERSONIC' }
 *
 * // Short hop (cruising)
 * calculateCinematicTravelTime(300); // { durationSeconds: 720, speedKmh: 1500, speedCurve: 'CRUISING' }
 */
export function calculateCinematicTravelTime(distanceKm) {
    let speedKmh;
    let speedCurve;

    if (distanceKm >= DISTANCE_THRESHOLD.HYPERSONIC_LONG) {
        // Extreme long haul - use hypersonic_long speed (e.g., North Pole launch)
        speedKmh = SPEED.HYPERSONIC_LONG;
        speedCurve = 'HYPERSONIC_LONG';
    } else if (distanceKm >= DISTANCE_THRESHOLD.HYPERSONIC) {
        // Long haul - use hypersonic speed
        speedKmh = SPEED.HYPERSONIC;
        speedCurve = 'HYPERSONIC';
    } else if (distanceKm <= DISTANCE_THRESHOLD.CRUISING) {
        // Short hop - use cruising speed
        speedKmh = SPEED.CRUISING;
        speedCurve = 'CRUISING';
    } else {
        // Interpolate between cruising and hypersonic for mid-range distances (500-2000km)
        // Linear interpolation: speed increases as distance increases
        const t = (distanceKm - DISTANCE_THRESHOLD.CRUISING) /
                  (DISTANCE_THRESHOLD.HYPERSONIC - DISTANCE_THRESHOLD.CRUISING);
        speedKmh = SPEED.CRUISING + t * (SPEED.HYPERSONIC - SPEED.CRUISING);
        speedCurve = 'REGIONAL';
    }

    // Calculate duration: time = distance / speed, convert to seconds
    const durationHours = distanceKm / speedKmh;
    const durationSeconds = Math.round(durationHours * 3600);

    return {
        durationSeconds,
        speedKmh: Math.round(speedKmh),
        speedCurve,
    };
}

// ============================================================================
// Time Window Validation
// ============================================================================

/**
 * Validates the arrival time against the "Traffic Light" rules.
 * 
 * Time Window Rules (from editor_algorithm_logic.md):
 * - GREEN (Ideal): 23.0 (11pm) to 26.0 (2am) - Everyone is asleep
 * - YELLOW (Warning):
 *   - Early: 22.5 (10:30pm) to 23.0 (11pm) - Risky, kids might be awake
 *   - Late: 26.0 (2am) to 27.5 (3:30am) - Early risers/sunlight risk
 * - RED (Broken): Before 22.5 or after 27.5
 *
 * Note: Hours > 24 represent the next day (e.g., 25.0 = 1:00 AM)
 *
 * @param {number} localHourDecimal - Local arrival time as decimal hours (e.g., 23.5 = 11:30 PM)
 * @returns {'GREEN' | 'YELLOW' | 'RED'} Traffic light status
 *
 * @example
 * validateArrivalWindow(23.5);  // 'GREEN' - 11:30 PM, perfect
 * validateArrivalWindow(22.75); // 'YELLOW' - 10:45 PM, a bit early
 * validateArrivalWindow(21.0);  // 'RED' - 9:00 PM, kids are awake!
 */
export function validateArrivalWindow(localHourDecimal) {
    // Normalize the hour to handle wrap-around (e.g., if someone passes 1.5 instead of 25.5)
    // We expect hours in the range of ~22-28 for valid tracking, but handle edge cases
    let normalizedHour = localHourDecimal;

    // If hour is less than 12, assume it's early morning next day (add 24)
    if (normalizedHour < 12) {
        normalizedHour += 24;
    }

    // GREEN Zone: 23.0 (11pm) <= localTime <= 26.0 (2am)
    if (normalizedHour >= TIME_WINDOW.GREEN_START && normalizedHour <= TIME_WINDOW.GREEN_END) {
        return 'GREEN';
    }

    // YELLOW Zone - Early: 22.5 (10:30pm) <= localTime < 23.0 (11pm)
    if (normalizedHour >= TIME_WINDOW.YELLOW_EARLY && normalizedHour < TIME_WINDOW.GREEN_START) {
        return 'YELLOW';
    }

    // YELLOW Zone - Late: 26.0 (2am) < localTime <= 27.5 (3:30am)
    if (normalizedHour > TIME_WINDOW.GREEN_END && normalizedHour <= TIME_WINDOW.YELLOW_LATE) {
        return 'YELLOW';
    }

    // RED Zone: Too early (< 22.5) or too late (> 27.5)
    return 'RED';
}

// ============================================================================
// Helper Exports (for convenience)
// ============================================================================

/**
 * Converts UTC time to local decimal hours given a timezone offset.
 * 
 * @param {Date|string} utcTime - UTC time as Date object or ISO string
 * @param {number} timezoneOffset - Timezone offset in hours (e.g., 14 for UTC+14)
 * @returns {number} Local time as decimal hours (0-24+)
 *
 * @example
 * utcToLocalDecimalHours('2024-12-24T10:00:00Z', 14); // 24.0 (midnight local)
 */
export function utcToLocalDecimalHours(utcTime, timezoneOffset) {
    const date = typeof utcTime === 'string' ? new Date(utcTime) : utcTime;
    const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    let localHours = utcHours + timezoneOffset;

    // Keep in 0-48 range for easier comparison (allows for next-day times)
    if (localHours < 0) {
        localHours += 24;
    }

    return localHours;
}

/**
 * Determines the appropriate camera zoom level based on travel duration.
 *
 * Camera Logic (from cinematic_logic_spec.md):
 * - Long Haul (>15 min): LOW zoom (Globe/Curvature Level) - value 3
 * - Short Hop (<15 min): MEDIUM zoom (Region Level) - value 9
 *
 * @param {number} travelSeconds - Travel duration in seconds
 * @returns {number} Camera zoom level
 */
export function getCameraZoomForTransit(travelSeconds) {
    const LONG_HAUL_THRESHOLD = 15 * 60; // 15 minutes in seconds

    if (travelSeconds > LONG_HAUL_THRESHOLD) {
        return 3; // Globe level for long flights
    }
    return 9; // Region level for short hops
}

/**
 * Gets a human-readable status message for a time window validation result.
 * 
 * @param {'GREEN' | 'YELLOW' | 'RED'} status - The validation status
 * @param {number} localHourDecimal - The local arrival time
 * @returns {string} Human-readable status message
 */
export function getStatusMessage(status, localHourDecimal) {
    const timeStr = decimalHoursToTimeString(localHourDecimal);

    switch (status) {
    case 'GREEN':
        return `✅ Arriving at ${timeStr} - Perfect timing!`;
    case 'YELLOW':
        return `⚠️ Arriving at ${timeStr} - Acceptable, but risky.`;
    case 'RED':
        return `❌ Arriving at ${timeStr} - Outside safe window!`;
    default:
        return `Unknown status for ${timeStr}`;
    }
}

/**
 * Converts decimal hours to a formatted time string (HH:MM).
 * 
 * @param {number} decimalHours - Time as decimal hours
 * @returns {string} Formatted time string (e.g., "23:30")
 */
export function decimalHoursToTimeString(decimalHours) {
    // Normalize to 0-24 range
    const normalized = ((decimalHours % 24) + 24) % 24;
    const hours = Math.floor(normalized);
    const minutes = Math.round((normalized - hours) * 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
