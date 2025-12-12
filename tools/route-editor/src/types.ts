/**
 * Type definitions for the Santa Tracker Cinematic Route Editor
 * Based on docs/route_data_schema.json
 * 
 * Note: This file is for type reference only; the rest of the app is JavaScript.
 */

// ============================================================================
// Core Enums / Literal Types
// ============================================================================

/** Node types defining the purpose of each route stop */
export type NodeType = 'START' | 'DELIVERY' | 'FLYBY';

/** Speed curve types for transit segments */
export type SpeedCurve = 'HYPERSONIC' | 'CRUISING' | 'HYPERSONIC_LONG' | 'REGIONAL';

/** Traffic light status for time window validation */
export type TimeWindowStatus = 'GREEN' | 'YELLOW' | 'RED';

/** Weather conditions for stop experience */
export type WeatherCondition = 'clear' | 'blizzard' | 'snow' | 'cloudy' | 'rain' | 'fog' | 'thunderstorm';

// ============================================================================
// Location Data
// ============================================================================

/** Geographic and timezone information for a location */
export interface Location {
  /** Display name of the location */
  name: string;
  /** Region or country */
  region: string;
  /** Latitude coordinate */
  lat: number;
  /** Longitude coordinate */
  lng: number;
  /** UTC timezone offset in hours (e.g., 14 for UTC+14) */
  timezone_offset: number;
}

// ============================================================================
// Stop Experience
// ============================================================================

/** Configuration for the stop experience at a node */
export interface StopExperience {
  /** Duration of stop in seconds (0 for FLYBY nodes) */
  duration_seconds: number;
  /** Camera zoom level for the stop (higher = more zoomed in) */
  camera_zoom: number;
  /** Weather condition at the stop */
  weather_condition: WeatherCondition;
  /** Number of presents delivered at this stop */
  presents_delivered_at_stop: number;
}

// ============================================================================
// Transit Information
// ============================================================================

/** Information about the transit/travel to reach a node */
export interface TransitInfo {
  /** Human-readable description of the transit segment */
  description: string;
  /** Travel duration in seconds */
  duration_seconds: number;
  /** Distance traveled in kilometers */
  distance_km: number;
  /** Speed curve type based on distance (HYPERSONIC for long hauls, CRUISING for short hops) */
  speed_curve: SpeedCurve;
  /** Camera zoom level during transit (lower = more zoomed out for globe view) */
  camera_zoom: number;
}

// ============================================================================
// Schedule
// ============================================================================

/** Timing and validation information for a node */
export interface Schedule {
  /** UTC arrival time (ISO 8601 string, null for START node) */
  arrival_utc: string | null;
  /** UTC departure time (ISO 8601 string) */
  departure_utc: string;
  /** Local arrival time in HH:MM format (optional, not present on START node) */
  local_arrival_time?: string;
  /** Traffic light status indicating time window validity */
  time_window_status?: TimeWindowStatus;
}

// ============================================================================
// Route Node
// ============================================================================

/** A single node in Santa's route */
export interface RouteNode {
  /** Optional comment for documentation/debugging */
  comment?: string;
  /** Unique identifier for the node (e.g., "node_001_kiritimati") */
  id: string;
  /** Type of node: START (North Pole), DELIVERY (full stop), or FLYBY (quick pass) */
  type: NodeType;
  /** Geographic and timezone information */
  location: Location;
  /** Stop experience configuration */
  stop_experience: StopExperience;
  /** Schedule/timing information */
  schedule: Schedule;
  /** Transit information for travel TO this node (null for START node) */
  transit_to_here: TransitInfo | null;
}

// ============================================================================
// Route Metadata
// ============================================================================

/** Metadata about the route file */
export interface RouteMeta {
  /** Year the route is for */
  year: number;
  /** Version string for the route data */
  route_version: string;
  /** ISO 8601 timestamp of when the route was generated */
  generated_at: string;
}

// ============================================================================
// Main Route Data Structure
// ============================================================================

/** Complete route data structure containing metadata and all route nodes */
export interface RouteData {
  /** Route metadata */
  meta: RouteMeta;
  /** Array of route nodes in order of visitation */
  route_nodes: RouteNode[];
}

// ============================================================================
// Editor-Specific Types (for UI state)
// ============================================================================

/** Validation result for a single node */
export interface NodeValidation {
  nodeId: string;
  status: TimeWindowStatus;
  localArrivalTime: number; // Decimal hours (e.g., 23.5 = 11:30 PM)
  message?: string;
}

/** Editor state for managing the route */
export interface EditorState {
  routeData: RouteData | null;
  selectedNodeId: string | null;
  isDirty: boolean;
  validationResults: NodeValidation[];
}
