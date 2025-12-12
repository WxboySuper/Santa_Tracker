/**
 * Route Calculation Utilities for Santa Tracker Route Editor
 * 
 * Implements the route recalculation logic from docs/editor_algorithm_logic.md
 * Handles the schedule computation for all nodes in Santa's route.
 * 
 * @module routeCalculations
 */

import {
    calculateDistance,
    calculateCinematicTravelTime,
    validateArrivalWindow,
    utcToLocalDecimalHours,
    getCameraZoomForTransit,
    decimalHoursToTimeString,
} from './cinematicLogic.js';

// ============================================================================
// Constants
// ============================================================================

/** The North Pole anchor node configuration */
export const NORTH_POLE_ANCHOR = {
    id: 'node_000_north_pole',
    type: 'START',
    location: {
        name: 'North Pole',
        region: 'Arctic',
        lat: 80.0,
        lng: 180.0,
        timezone_offset: 0,
    },
    stop_experience: {
        duration_seconds: 0,
        camera_zoom: 4,
        weather_condition: 'blizzard',
        presents_delivered_at_stop: 0,
    },
};

/** Default stop duration in seconds */
const DEFAULT_STOP_DURATION = 60;

/** Major city stop duration in seconds */
const MAJOR_STOP_DURATION = 120;

/** Flyby duration (instant) */
const FLYBY_DURATION = 0;

// ============================================================================
// Main Route Calculation Function
// ============================================================================

/**
 * Recalculates the entire route schedule based on node positions and timing rules.
 * 
 * Implementation of the algorithm from docs/editor_algorithm_logic.md:
 * 1. Ensures Node[0] is locked as the North Pole (cannot be moved/deleted)
 * 2. Iterates from Node[1] calculating arrival UTC based on previous departure + travel time
 * 3. Back-calculates Node[0]'s departure_utc from Node[1]'s arrival - travel time
 * 
 * @param {Array} nodes - Array of route nodes (locations with timing data)
 * @param {Object} options - Optional configuration
 * @param {string} options.targetYear - Year for the route (default: current year)
 * @param {number} options.firstArrivalHour - Desired local arrival hour at first stop (default: 0 = midnight)
 * @returns {Array} Updated nodes array with recalculated schedules
 */
export function recalculateRoute(nodes, options = {}) {
    const { 
        targetYear = new Date().getFullYear(),
        firstArrivalHour = 0, // Midnight local time
    } = options;

    // If no nodes or only the anchor, return as-is with anchor ensured
    if (!nodes || nodes.length === 0) {
        return [createAnchorNode(targetYear)];
    }

    // Create a working copy of nodes
    const updatedNodes = nodes.map(node => ({ ...node }));

    // Step 0: Ensure Node[0] is ALWAYS the North Pole anchor
    ensureAnchorNode(updatedNodes, targetYear);

    // If only the anchor exists, nothing more to calculate
    if (updatedNodes.length === 1) {
        return updatedNodes;
    }

    // Step 1: Calculate Node[1]'s desired arrival time (midnight local)
    const node1 = updatedNodes[1];
    const node1ArrivalUTC = calculateFirstNodeArrival(node1, targetYear, firstArrivalHour);
  
    // Step 2: Calculate travel time from North Pole to Node[1]
    // For very long distances (>5000km), uses HYPERSONIC_LONG speed (60,000 km/h)
    const anchorNode = updatedNodes[0];
    const transitToNode1 = calculateTransitInfo(anchorNode, node1);
  
    // Step 3: Back-calculate North Pole departure (Step 0 from algorithm)
    // North Pole Departure = Node 1 Arrival - Travel Time
    const anchorDepartureUTC = new Date(node1ArrivalUTC.getTime() - (transitToNode1.duration_seconds * 1000));
  
    // Update anchor node schedule
    updatedNodes[0] = {
        ...anchorNode,
        schedule: {
            arrival_utc: null, // North Pole has no arrival time
            departure_utc: anchorDepartureUTC.toISOString(),
        },
        transit_to_here: null, // No travel to the start
    };

    // Step 4: Update Node[1] with calculated values
    const node1LocalHour = utcToLocalDecimalHours(node1ArrivalUTC, node1.location.timezone_offset);
    const node1Status = validateArrivalWindow(node1LocalHour);
    const node1StopDuration = getStopDuration(node1);
    const node1DepartureUTC = new Date(node1ArrivalUTC.getTime() + (node1StopDuration * 1000));

    updatedNodes[1] = {
        ...node1,
        transit_to_here: transitToNode1,
        schedule: {
            arrival_utc: node1ArrivalUTC.toISOString(),
            departure_utc: node1DepartureUTC.toISOString(),
            local_arrival_time: decimalHoursToTimeString(node1LocalHour % 24),
            time_window_status: node1Status,
        },
    };

    // Step 5: Iterate through remaining nodes (Node[2] onwards)
    for (let i = 2; i < updatedNodes.length; i++) {
        const prevNode = updatedNodes[i - 1];
        const currentNode = updatedNodes[i];

        // Calculate transit from previous node
        const transitInfo = calculateTransitInfo(prevNode, currentNode);

        // Calculate arrival: PrevDepartureUTC + TravelSeconds
        const prevDepartureUTC = new Date(prevNode.schedule.departure_utc);
        const arrivalUTC = new Date(prevDepartureUTC.getTime() + (transitInfo.duration_seconds * 1000));

        // Calculate local time and validate
        const localHour = utcToLocalDecimalHours(arrivalUTC, currentNode.location.timezone_offset);
        const status = validateArrivalWindow(localHour);

        // Calculate departure based on stop duration
        const stopDuration = getStopDuration(currentNode);
        const departureUTC = new Date(arrivalUTC.getTime() + (stopDuration * 1000));

        // Update node with calculated values
        updatedNodes[i] = {
            ...currentNode,
            transit_to_here: transitInfo,
            schedule: {
                arrival_utc: arrivalUTC.toISOString(),
                departure_utc: departureUTC.toISOString(),
                local_arrival_time: decimalHoursToTimeString(localHour % 24),
                time_window_status: status,
            },
        };
    }

    return updatedNodes;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates the North Pole anchor node with default values.
 * 
 * @param {number} year - Target year for the route
 * @returns {Object} The anchor node
 */
function createAnchorNode() {
    return {
        ...NORTH_POLE_ANCHOR,
        comment: '--- NODE 0: THE ANCHOR (HARD LOCKED) ---',
        schedule: {
            arrival_utc: null,
            departure_utc: null, // Will be back-calculated when Node[1] is added
        },
        transit_to_here: null,
    };
}

/**
 * Ensures Node[0] is the North Pole anchor. If not, inserts it.
 * 
 * @param {Array} nodes - Array of nodes (modified in place)
 * @param {number} year - Target year
 */
function ensureAnchorNode(nodes, year) {
    const firstNode = nodes[0];
  
    // Check if first node is the anchor by ID or type (not lat, which may vary)
    const isAnchor = firstNode && 
        (firstNode.id === 'node_000_north_pole' || firstNode.type === 'START');

    if (!isAnchor) {
        // Insert the anchor at position 0
        nodes.unshift(createAnchorNode(year));
    } else {
        // Ensure anchor has correct locked properties
        nodes[0] = {
            ...nodes[0],
            ...NORTH_POLE_ANCHOR,
            comment: '--- NODE 0: THE ANCHOR (HARD LOCKED) ---',
        };
    }
}

/**
 * Calculates the desired arrival time for the first delivery node.
 * The first delivery should arrive at midnight local time.
 * 
 * @param {Object} node - The first delivery node
 * @param {number} year - Target year
 * @param {number} targetLocalHour - Desired local arrival hour (0 = midnight)
 * @returns {Date} UTC arrival time
 */
function calculateFirstNodeArrival(node, year, targetLocalHour = 0) {
    const timezoneOffset = node.location?.timezone_offset || 0;
  
    // Target: December 24th at midnight local time
    // For UTC+14 (e.g., Kiritimati), midnight local = 10:00 UTC
    // Formula: UTC = LocalTime - TimezoneOffset
    // Support fractional hours (e.g., 22.75 => 22:45)
    let targetUTCHourDecimal = (targetLocalHour - timezoneOffset + 24) % 24;

    // Extract hours and minutes from decimal hours
    let utcHour = Math.floor(targetUTCHourDecimal);
    let utcMinute = Math.round((targetUTCHourDecimal - utcHour) * 60);

    // Handle minute rounding overflow (e.g., 59.999 -> 60)
    if (utcMinute >= 60) {
        utcMinute = 0;
        utcHour = (utcHour + 1) % 24;
    }

    // Create the date: December 24th at the calculated UTC hour and minute
    const arrivalDate = new Date(Date.UTC(year, 11, 24, utcHour, utcMinute, 0));

    return arrivalDate;
}

/**
 * Calculates transit information between two nodes.
 * 
 * @param {Object} fromNode - The origin node
 * @param {Object} toNode - The destination node
 * @returns {Object} Transit information object
 */
function calculateTransitInfo(fromNode, toNode) {
    const distance = calculateDistance(
        fromNode.location.lat,
        fromNode.location.lng,
        toNode.location.lat,
        toNode.location.lng
    );

    // Speed is automatically determined by distance:
    // - >5000km: HYPERSONIC_LONG (60,000 km/h)
    // - 2000-5000km: HYPERSONIC (14,000 km/h)
    // - 500-2000km: REGIONAL (interpolated)
    // - <500km: CRUISING (2,050 km/h)
    const travelTime = calculateCinematicTravelTime(distance);
    const cameraZoom = getCameraZoomForTransit(travelTime.durationSeconds);

    return {
        description: generateTransitDescription(fromNode, toNode, distance),
        duration_seconds: travelTime.durationSeconds,
        distance_km: Math.round(distance),
        speed_curve: travelTime.speedCurve,
        speed_kmh: travelTime.speedKmh,
        camera_zoom: cameraZoom,
    };
}

/**
 * Generates a human-readable description for a transit segment.
 * 
 * @param {Object} fromNode - Origin node
 * @param {Object} toNode - Destination node
 * @param {number} distance - Distance in km
 * @returns {string} Transit description
 */
function generateTransitDescription(fromNode, toNode, distance) {
    if (fromNode.type === 'START') {
        return 'The Launch';
    }
  
    if (distance > 2000) {
        return `Long Haul to ${toNode.location.region || toNode.location.name}`;
    }
  
    if (distance < 100) {
        return 'Quick Hop';
    }
  
    return `Flight to ${toNode.location.name}`;
}

/**
 * Gets the stop duration for a node based on its type.
 * 
 * @param {Object} node - The route node
 * @returns {number} Stop duration in seconds
 */
function getStopDuration(node) {
    // Use existing duration if set
    if (node.stop_experience?.duration_seconds !== undefined) {
        return node.stop_experience.duration_seconds;
    }

    // Determine based on node type
    switch (node.type) {
    case 'FLYBY':
        return FLYBY_DURATION;
    case 'START':
        return 0;
    case 'DELIVERY':
    default:
        // Check if it's a major city (could be enhanced with a priority/importance field)
        if (node.priority === 1 || node.is_major_stop) {
            return MAJOR_STOP_DURATION;
        }
        return DEFAULT_STOP_DURATION;
    }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates the entire route and returns validation results for each node.
 * 
 * @param {Array} nodes - Array of route nodes
 * @returns {Array} Array of validation results
 */
export function validateRoute(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((node, index) => {
        if (index === 0) {
            // Anchor node is always valid
            return {
                nodeId: node.id,
                index,
                status: 'GREEN',
                message: 'North Pole Anchor (locked)',
            };
        }

        const status = node.schedule?.time_window_status || 'RED';
        const localTime = node.schedule?.local_arrival_time || 'Unknown';

        return {
            nodeId: node.id,
            index,
            status,
            localArrivalTime: localTime,
            message: getValidationMessage(status, localTime),
        };
    });
}

/**
 * Gets a validation message based on status.
 * 
 * @param {string} status - Traffic light status
 * @param {string} localTime - Local arrival time string
 * @returns {string} Validation message
 */
function getValidationMessage(status, localTime) {
    switch (status) {
    case 'GREEN':
        return `✅ Arrives at ${localTime} - Perfect!`;
    case 'YELLOW':
        return `⚠️ Arrives at ${localTime} - Acceptable, but risky`;
    case 'RED':
        return `❌ Arrives at ${localTime} - Outside safe window!`;
    default:
        return `Unknown status at ${localTime}`;
    }
}

/**
 * Checks if a node can be deleted (anchor cannot be deleted).
 * 
 * @param {Object} node - The node to check
 * @param {number} index - The node's index in the array
 * @returns {boolean} True if the node can be deleted
 */
export function canDeleteNode(node, index) {
    return index !== 0 && node.type !== 'START';
}

/**
 * Checks if a node can be moved/reordered (anchor cannot be moved).
 * 
 * @param {Object} node - The node to check
 * @param {number} index - The node's index
 * @returns {boolean} True if the node can be moved
 */
export function canMoveNode(node, index) {
    return index !== 0 && node.type !== 'START';
}
