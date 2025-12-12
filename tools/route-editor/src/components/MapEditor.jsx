import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { Search } from 'lucide-react';
import { getTimezoneOffset } from '../utils/exportUtils';
import timezones from '../data/ne_10m_time_zones.json';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored markers
const createColoredIcon = (color) => {
    return new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
};

const greenIcon = createColoredIcon('green');
const redIcon = createColoredIcon('red');
const blueIcon = createColoredIcon('blue');

const colors = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

/**
 * Styles the timezone polygons based on their properties.
 * Uses map_color6 for coloring if available, otherwise falls back to a hash of the zone.
 * 
 * @param {Object} feature - The GeoJSON feature to style
 * @returns {Object} Leaflet style object
 */
// Simple string hash function (djb2)
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return Math.abs(hash);
}

const timezoneStyle = (feature) => {
    // Use map_color6 for coloring if available, otherwise fallback to a hash of the zone
    const colorIndex = feature.properties.map_color6 
        ? (feature.properties.map_color6 - 1) % colors.length 
        : hashString(String(feature.properties.zone ?? '')) % colors.length;

    return {
        fillColor: colors[colorIndex] || '#cccccc',
        weight: 1,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.2
    };
};

/**
 * Adds popup interactions to each timezone feature.
 * Displays timezone name, UTC offset, and affected places.
 * 
 * @param {Object} feature - The GeoJSON feature
 * @param {Object} layer - The Leaflet layer
 */
const onEachTimezone = (feature, layer) => {
    if (feature.properties) {
        layer.bindPopup(`
            <div class="text-sm">
                <strong>${feature.properties.name}</strong><br/>
                UTC: ${feature.properties.utc_format}<br/>
                Places: ${feature.properties.places}
            </div>
        `);
    }
};

// Rate limiting for Nominatim API (1 request per second)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

const waitForRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve =>
            setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
        );
    }
    lastRequestTime = Date.now();
};

// Search result item component to avoid inline functions in JSX props
// Memoized to prevent unnecessary re-renders
// Uses primitive props for stable memoization
const SearchResultItem = memo(function SearchResultItem({ 
    displayName, 
    lat, 
    lon, 
    country, 
    onSelect 
}) {
    const handleClick = useCallback(() => {
        onSelect(displayName, lat, lon, country);
    }, [onSelect, displayName, lat, lon, country]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(displayName, lat, lon, country);
        }
    }, [onSelect, displayName, lat, lon, country]);

    return (
        <div
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            className="p-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 text-sm"
        >
            {displayName}
        </div>
    );
});

// Search bar component
function SearchBar({ onLocationSelect }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError('');

        await waitForRateLimit();

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
                {
                    headers: {
                        'User-Agent': 'SantaRouteEditor/1.0 (https://github.com/WxboySuper/Santa_Tracker)'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Search failed with status ${response.status}`);
            }

            const data = await response.json();
            setResults(data);

            if (data.length === 0) {
                setError('No results found. Try a different search term.');
            }
        } catch (error) {  // skipcq: JS-0123
            console.error('Search error:', error);
            setError('Search failed. Please check your connection and try again.');
        }
        setLoading(false);
    };

    const handleQueryChange = useCallback((e) => {
        setQuery(e.target.value);
    }, []);

    const handleSelectResult = useCallback((displayName, lat, lon, country) => {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
    
        onLocationSelect({
            name: displayName.split(',')[0],
            latitude,
            longitude,
            country: country || '',
            utc_offset: getTimezoneOffset(latitude, longitude),
            priority: 1,
            notes: '',
            population: 0
        }, { lat: latitude, lng: longitude });
    
        setQuery('');
        setResults([]);
        setError('');
    }, [onLocationSelect]);

    return (
        <div className="absolute top-4 left-14 z-[1000] bg-white rounded-lg shadow-lg p-2 w-80">
            <form onSubmit={handleSearch} className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Search for a city or location..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center gap-2"
                >
                    <Search size={16} />
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                    {error}
                </div>
            )}
      
            {results.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto">
                    {results.map((result) => (
                        <SearchResultItem
                            key={result.place_id}
                            displayName={result.display_name}
                            lat={result.lat}
                            lon={result.lon}
                            country={result.address?.country}
                            onSelect={handleSelectResult}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Map event handlers
function MapEventHandler({ onMapClick }) {
    const handleContextMenu = useCallback((e) => {
        onMapClick(e.latlng);
    }, [onMapClick]);

    useMapEvents({
        contextmenu: handleContextMenu,
    });
    return null;
}

// Component to handle map centering
function MapCenter({ center }) {
    const map = useMap();
  
    useEffect(() => {
        if (center) {
            map.flyTo(center, 8, { duration: 1 });
        }
    }, [center, map]);
    return null;
}

function MapEditor({ locations, onAddLocation, setSelectedLocation }) {
    const [mapCenter, setMapCenter] = useState(null);

    // This ensures that when panning across the dateline, the timezone layer continues uninterrupted.
    const extendedTimezones = useMemo(() => {
        /**
         * Recursively shifts coordinates by a given longitude offset.
         * Handles both simple polygons and multi-polygons.
         * 
         * @param {Array} coords - The coordinates array (nested arrays of numbers)
         * @param {number} offset - The longitude offset to apply (e.g., -360 or 360)
         * @returns {Array} The shifted coordinates
         */
        const shiftCoords = (coords, offset) => {
            // Base case: [x, y] point
            if (typeof coords[0] === 'number') {
                return [coords[0] + offset, coords[1]];
            }
            // Recursive case: Array of points or arrays
            return coords.map(c => shiftCoords(c, offset));
        };

        const createFeatures = (offset, prefix) =>
            timezones.features.map((f, index) => ({
                ...f,
                geometry: offset !== 0 ? { ...f.geometry, coordinates: shiftCoords(f.geometry.coordinates, offset) } : f.geometry,
                properties: { ...f.properties, uniqueId: `${prefix}-${index}` },
            }));

        const left = createFeatures(-360, 'left');
        const center = createFeatures(0, 'center');
        const right = createFeatures(360, 'right');

        return {
            type: "FeatureCollection",
            features: [...left, ...center, ...right]
        };
    }, []);

    const handleMapClick = useCallback(async (latlng) => {
        const { lat, lng } = latlng;

        await waitForRateLimit();
    
        // Reverse geocode to get location name
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                {
                    headers: {
                        'User-Agent': 'SantaRouteEditor/1.0 (https://github.com/WxboySuper/Santa_Tracker)'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Reverse geocoding failed: ${response.status}`);
            }

            if (!response.ok) {
                throw new Error(`Reverse geocoding failed: ${response.status}`);
            }
            const data = await response.json();
            onAddLocation({
                name: data.address?.city || data.address?.town || data.address?.village || 'Unknown Location',
                latitude: lat,
                longitude: lng,
                country: data.address?.country || '',
                utc_offset: getTimezoneOffset(lat, lng),
                priority: 1,
                notes: '',
                population: 0
            });
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            onAddLocation({
                name: 'Unknown Location',
                latitude: lat,
                longitude: lng,
                country: '',
                utc_offset: getTimezoneOffset(lat, lng),
                priority: 1,
                notes: '',
                population: 0
            });
        }
    }, [onAddLocation]);

    const handleLocationSelect = useCallback((location, center) => {
        onAddLocation(location);
        setMapCenter(center);
    }, [onAddLocation]);

    const getMarkerIcon = useCallback((index, total, nodeType) => {
        // Special handling for START (North Pole) node
        if (nodeType === 'START' || index === 0) return greenIcon;
        if (total === 1) return blueIcon;
        if (index === total - 1) return redIcon;
        return blueIcon;
    }, []);

    const handleMarkerClick = useCallback((locationId) => {
        setSelectedLocation(locationId);
    }, [setSelectedLocation]);

    // Support both old and new schema for polyline positions
    const polylinePositions = locations.map(loc => {
        const lat = loc.location?.lat ?? loc.latitude ?? 0;
        const lng = loc.location?.lng ?? loc.longitude ?? 0;
        return [lat, lng];
    });

    return (
        <div className="flex-1 relative">
            <MapContainer
                center={[45, 170]}
                zoom={2}
                className="h-full w-full"
                worldCopyJump={false}
                minZoom={2}
                maxBounds={[[-120, -Infinity], [120, Infinity]]}
                maxBoundsViscosity={1.0}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20}
                />

                <GeoJSON 
                    key="timezones"
                    data={extendedTimezones} 
                    style={timezoneStyle} 
                    onEachFeature={onEachTimezone} 
                />
        
                <MapEventHandler onMapClick={handleMapClick} />
                <MapCenter center={mapCenter} />
        
                {/* Render markers - support both old and new schema */}
                {locations.map((location, index) => {
                    const lat = location.location?.lat ?? location.latitude ?? 0;
                    const lng = location.location?.lng ?? location.longitude ?? 0;
                    const name = location.location?.name ?? location.name ?? 'Unknown';
                    const region = location.location?.region ?? location.country ?? '';
                    const nodeType = location.type || 'DELIVERY';
                    
                    return (
                        <Marker
                            key={location.id}
                            position={[lat, lng]}
                            icon={getMarkerIcon(index, locations.length, nodeType)}
                            eventHandlers={{
                                click: () => handleMarkerClick(location.id)
                            }}
                        >
                            <Popup>
                                <div className="text-sm">
                                    <strong>{name}</strong>
                                    {region && (
                                        <>
                                            <br />
                                            {region}
                                        </>
                                    )}
                                    <br />
                                    <span className="text-gray-500">
                                        {nodeType === 'START' ? '🎅 Start Point' : 
                                            nodeType === 'FLYBY' ? '✈️ Flyby' : 
                                                '🎁 Delivery'}
                                    </span>
                                    {location.schedule?.local_arrival_time && (
                                        <>
                                            <br />
                                            <span className="text-blue-600">
                                                Local: {location.schedule.local_arrival_time}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
        
                {/* Render polyline connecting locations */}
                {polylinePositions.length > 1 && (
                    <Polyline
                        positions={polylinePositions}
                        color="#c41e3a"
                        weight={3}
                        opacity={0.7}
                        dashArray="10, 5"
                    />
                )}
            </MapContainer>
      
            <SearchBar onLocationSelect={handleLocationSelect} />
        </div>
    );
}

export default MapEditor;
