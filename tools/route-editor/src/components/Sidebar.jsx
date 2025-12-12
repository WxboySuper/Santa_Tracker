import { useState, useCallback, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
    GripVertical, 
    Trash2, 
    ChevronDown, 
    ChevronUp, 
    Download, 
    Play,
    Lock,
    MapPin,
    Plane,
    Clock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Link,
    Unlink,
    Save,
    FileJson,
    FolderOpen,
    Gift,
    Users,
    MessageSquare
} from 'lucide-react';

// ============================================================================
// Stop Duration Options (from cinematic_logic_spec.md)
// ============================================================================
const STOP_DURATION_OPTIONS = [
    { value: 0, label: 'Flyby (0s)', description: 'Quick pass, no stop' },
    { value: 60, label: 'Standard (60s)', description: 'Default for most locations' },
    { value: 120, label: 'Major (120s)', description: 'Major metros (London, NYC, Tokyo)' },
    { value: 300, label: 'Rest Stop (5m)', description: 'Cookie break / time reset' },
];

// ============================================================================
// Status Badge Component
// ============================================================================
function StatusBadge({ status }) {
    const config = {
        GREEN: { 
            className: 'status-badge-green', 
            icon: CheckCircle, 
            text: 'On Time' 
        },
        YELLOW: { 
            className: 'status-badge-yellow', 
            icon: AlertTriangle, 
            text: 'Warning' 
        },
        RED: { 
            className: 'status-badge-red', 
            icon: XCircle, 
            text: 'Off Schedule' 
        },
    };

    const { className, icon: Icon, text } = config[status] || config.RED;

    return (
        <span className={`status-badge ${className} inline-flex items-center gap-1`}>
            <Icon size={12} />
            {text}
        </span>
    );
}

// ============================================================================
// Node Type Badge Component  
// ============================================================================
function NodeTypeBadge({ type, index }) {
    const config = {
        START: { className: 'node-badge-start', icon: Lock, text: 'Start' },
        DELIVERY: { className: 'node-badge-delivery', icon: MapPin, text: `Stop ${index}` },
        FLYBY: { className: 'node-badge-flyby', icon: Plane, text: 'Flyby' },
    };

    const { className, icon: Icon, text } = config[type] || config.DELIVERY;

    return (
        <span className={`node-badge ${className} inline-flex items-center gap-1`}>
            <Icon size={12} />
            {text}
        </span>
    );
}

// ============================================================================
// Sortable Location Card Component
// ============================================================================
function SortableLocationCard({ 
    location, 
    index, 
    total, 
    onUpdate, 
    onDelete, 
    isSelected, 
    onSelect,
    validation,
    canDelete 
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isLocked = location.type === 'START' || index === 0;
  
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ 
        id: location.id,
        disabled: isLocked,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleChange = useCallback((field, value) => {
        // Handle nested updates for location and stop_experience
        if (field.startsWith('location.')) {
            const subField = field.replace('location.', '');
            onUpdate(location.id, { 
                location: { ...location.location, [subField]: value }
            });
        } else if (field.startsWith('stop_experience.')) {
            const subField = field.replace('stop_experience.', '');
            onUpdate(location.id, { 
                stop_experience: { ...location.stop_experience, [subField]: value }
            });
        } else {
            onUpdate(location.id, { [field]: value });
        }
    }, [location, onUpdate]);

    const handleCardClick = useCallback(() => {
        onSelect(location.id);
    }, [location.id, onSelect]);

    const handleExpandToggle = useCallback((e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    }, [isExpanded]);

    const handleDelete = useCallback((e) => {
        e.stopPropagation();
        if (canDelete) {
            onDelete(location.id);
        }
    }, [location.id, onDelete, canDelete]);

    const handleInputClick = useCallback((e) => {
        e.stopPropagation();
    }, []);

    // Get display values - support both old and new schema
    const displayName = location.location?.name || location.name || 'Unknown Location';
    const displayRegion = location.location?.region || location.country || '';
    const lat = location.location?.lat ?? location.latitude ?? 0;
    const lng = location.location?.lng ?? location.longitude ?? 0;
    const localArrival = location.schedule?.local_arrival_time || '--:--';
    const status = location.schedule?.time_window_status || (index === 0 ? 'GREEN' : null);
    const stopDuration = location.stop_experience?.duration_seconds ?? 60;
    const nodeType = location.type || 'DELIVERY';

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white rounded-lg shadow-md mb-3 border-2 transition-all ${
                isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'
            } ${isLocked ? 'node-locked' : ''}`}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick();
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="p-3">
                {/* Header Row */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={`drag-handle touch-none ${isLocked ? 'cursor-not-allowed' : 'cursor-move'}`}
                        {...(isLocked ? {} : { ...attributes, ...listeners })}
                        aria-label={isLocked ? 'Locked - cannot reorder' : 'Drag to reorder'}
                    >
                        {isLocked ? (
                            <Lock size={20} className="text-gray-400" />
                        ) : (
                            <GripVertical size={20} className="text-gray-400 hover:text-gray-600" />
                        )}
                    </button>
          
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <NodeTypeBadge type={nodeType} index={index} />
                                <h3 className="font-semibold text-sm truncate">{displayName}</h3>
                            </div>
              
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={handleExpandToggle}
                                    className="p-1 hover:bg-gray-100 rounded"
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                {canDelete && (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                                        aria-label="Delete location"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
            
                        {/* Location Info Row */}
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                            {displayRegion && <span>{displayRegion}</span>}
                            {displayRegion && <span className="text-gray-400">•</span>}
                            <span>{lat.toFixed(4)}°, {lng.toFixed(4)}°</span>
                        </div>

                        {/* Schedule Info Row */}
                        {index > 0 && (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                    <Clock size={12} />
                                    <span>Local: {localArrival}</span>
                                </div>
                                {status && <StatusBadge status={status} />}
                            </div>
                        )}
                    </div>
                </div>

                {/* Expanded Form */}
                {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                        {/* Name & Region */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Location Name
                                </label>
                                <input
                                    type="text"
                                    value={location.location?.name || ''}
                                    onChange={(e) => handleChange('location.name', e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onClick={handleInputClick}
                                    disabled={isLocked}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Region/Country
                                </label>
                                <input
                                    type="text"
                                    value={location.location?.region || ''}
                                    onChange={(e) => handleChange('location.region', e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onClick={handleInputClick}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>

                        {/* Node Type & Stop Duration */}
                        {!isLocked && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Node Type
                                    </label>
                                    <select
                                        value={nodeType}
                                        onChange={(e) => {
                                            const newType = e.target.value;
                                            handleChange('type', newType);
                                            // Auto-set duration for FLYBY
                                            if (newType === 'FLYBY') {
                                                handleChange('stop_experience.duration_seconds', 0);
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onClick={handleInputClick}
                                    >
                                        <option value="DELIVERY">Delivery (Full Stop)</option>
                                        <option value="FLYBY">Flyby (Quick Pass)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Stop Duration
                                    </label>
                                    <select
                                        value={stopDuration}
                                        onChange={(e) => handleChange('stop_experience.duration_seconds', parseInt(e.target.value, 10))}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onClick={handleInputClick}
                                        disabled={nodeType === 'FLYBY'}
                                    >
                                        {STOP_DURATION_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* UTC Offset */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Timezone Offset (UTC)
                            </label>
                            <input
                                type="number"
                                value={location.location?.timezone_offset ?? 0}
                                onChange={(e) => handleChange('location.timezone_offset', parseFloat(e.target.value) || 0)}
                                min="-12"
                                max="14"
                                step="0.5"
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={handleInputClick}
                                disabled={isLocked}
                            />
                        </div>

                        {/* Yellow Status Acknowledgment */}
                        {status === 'YELLOW' && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm text-yellow-800 font-medium">
                                            Off-Peak Arrival Detected
                                        </p>
                                        <p className="text-xs text-yellow-700 mt-1">
                                            Arriving at {localArrival} is outside the ideal window (11PM - 2AM).
                                            This is acceptable but risky.
                                        </p>
                                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={location.acknowledged_off_peak || false}
                                                onChange={(e) => handleChange('acknowledged_off_peak', e.target.checked)}
                                                className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                                                onClick={handleInputClick}
                                            />
                                            <span className="text-xs text-yellow-800 font-medium">
                                                Acknowledge off-peak arrival
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Red Status Warning */}
                        {status === 'RED' && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                    <XCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm text-red-800 font-medium">
                                            Invalid Arrival Time
                                        </p>
                                        <p className="text-xs text-red-700 mt-1">
                                            Arriving at {localArrival} is outside the safe window.
                                            Consider adjusting the route or increasing previous stop durations.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Transit Info (Read-only) */}
                        {location.transit_to_here && (
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-xs font-medium text-gray-600 mb-1">Transit Info</p>
                                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                                    <div>
                                        <span className="block text-gray-400">Distance</span>
                                        {location.transit_to_here.distance_km?.toLocaleString() || '—'} km
                                    </div>
                                    <div>
                                        <span className="block text-gray-400">Duration</span>
                                        {Math.round((location.transit_to_here.duration_seconds || 0) / 60)} min
                                    </div>
                                    <div>
                                        <span className="block text-gray-400">Speed</span>
                                        {location.transit_to_here.speed_curve || '—'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Fun Facts & Content Section */}
                        {!isLocked && (
                            <div className="border-t border-gray-200 pt-3 mt-3">
                                <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                                    <MessageSquare size={12} />
                                    Location Details & Fun Facts
                                </p>
                                
                                {/* Population & Presents */}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                                            <Users size={10} />
                                            Population
                                        </label>
                                        <input
                                            type="number"
                                            value={location.stop_experience?.population || ''}
                                            onChange={(e) => handleChange('stop_experience.population', parseInt(e.target.value, 10) || 0)}
                                            placeholder="e.g., 500000"
                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            onClick={handleInputClick}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                                            <Gift size={10} />
                                            Presents
                                        </label>
                                        <input
                                            type="number"
                                            value={location.stop_experience?.presents_delivered_at_stop || ''}
                                            onChange={(e) => handleChange('stop_experience.presents_delivered_at_stop', parseInt(e.target.value, 10) || 0)}
                                            placeholder="e.g., 250000"
                                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            onClick={handleInputClick}
                                        />
                                    </div>
                                </div>

                                {/* Fun Fact */}
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Fun Fact (shown to viewers)
                                    </label>
                                    <textarea
                                        value={location.stop_experience?.fun_fact || ''}
                                        onChange={(e) => handleChange('stop_experience.fun_fact', e.target.value)}
                                        placeholder="e.g., 'Kiritimati is the first place on Earth to welcome each new day!'"
                                        rows={2}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        onClick={handleInputClick}
                                    />
                                </div>

                                {/* Notable Landmark */}
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Notable Landmark
                                    </label>
                                    <input
                                        type="text"
                                        value={location.stop_experience?.landmark || ''}
                                        onChange={(e) => handleChange('stop_experience.landmark', e.target.value)}
                                        placeholder="e.g., 'Captain Cook Hotel'"
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onClick={handleInputClick}
                                    />
                                </div>

                                {/* Weather Condition */}
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Weather Condition
                                    </label>
                                    <select
                                        value={location.stop_experience?.weather_condition || 'clear'}
                                        onChange={(e) => handleChange('stop_experience.weather_condition', e.target.value)}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onClick={handleInputClick}
                                    >
                                        <option value="clear">☀️ Clear</option>
                                        <option value="cloudy">☁️ Cloudy</option>
                                        <option value="rain">🌧️ Rain</option>
                                        <option value="snow">❄️ Snow</option>
                                        <option value="blizzard">🌨️ Blizzard</option>
                                        <option value="fog">🌫️ Fog</option>
                                        <option value="thunderstorm">⛈️ Thunderstorm</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Route Stats Component
// ============================================================================
function RouteStats({ locations, validationResults }) {
    const stats = useMemo(() => {
        const totalStops = locations.length;
        
        // Calculate total distance and duration
        let totalDistance = 0;
        let totalDuration = 0;
        locations.forEach(loc => {
            if (loc.transit_to_here) {
                totalDistance += loc.transit_to_here.distance_km || 0;
                totalDuration += loc.transit_to_here.duration_seconds || 0;
            }
            if (loc.stop_experience) {
                totalDuration += loc.stop_experience.duration_seconds || 0;
            }
        });

        // Count validation statuses
        const greenCount = validationResults.filter(v => v.status === 'GREEN').length;
        const yellowCount = validationResults.filter(v => v.status === 'YELLOW').length;
        const redCount = validationResults.filter(v => v.status === 'RED').length;

        return {
            totalStops,
            totalDistance: Math.round(totalDistance),
            totalDurationHours: Math.round(totalDuration / 3600 * 10) / 10,
            greenCount,
            yellowCount,
            redCount,
        };
    }, [locations, validationResults]);

    return (
        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 border-b border-gray-200">
            <div className="stat-card stat-card-red">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Total Stops</div>
                <div className="text-lg font-bold text-gray-800">{stats.totalStops}</div>
            </div>
            <div className="stat-card stat-card-green">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Distance</div>
                <div className="text-lg font-bold text-gray-800">{stats.totalDistance.toLocaleString()} km</div>
            </div>
            <div className="stat-card stat-card-blue">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Duration</div>
                <div className="text-lg font-bold text-gray-800">{stats.totalDurationHours}h</div>
            </div>
            <div className="stat-card stat-card-gold">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Status</div>
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-green-600 font-bold">{stats.greenCount}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-yellow-600 font-bold">{stats.yellowCount}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-red-600 font-bold">{stats.redCount}</span>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Main Sidebar Component
// ============================================================================
function Sidebar({ 
    locations, 
    onUpdateLocation, 
    onDeleteLocation, 
    onReorder, 
    onExport, 
    selectedLocation, 
    setSelectedLocation,
    validationResults = [],
    canDeleteNode,
    // File linking props
    linkedFileName,
    isAutoSaveEnabled,
    onLinkFile,
    onUnlinkFile,
    onOpenFile,
    onToggleAutoSave,
    lastSaveTime,
    isSaving,
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
  
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = locations.findIndex(loc => loc.id === active.id);
        const newIndex = locations.findIndex(loc => loc.id === over.id);
        
        // Prevent moving anchor node (index 0)
        if (oldIndex === 0 || newIndex === 0) return;
        
        onReorder(arrayMove(locations, oldIndex, newIndex));
    }, [locations, onReorder]);

    const handleCollapseToggle = useCallback(() => {
        setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);

    const handleOpenSimulator = useCallback(() => {
        // Save route data to localStorage for the simulator to pick up
        const routeData = {
            meta: {
                year: new Date().getFullYear(),
                route_version: '1.0',
                generated_at: new Date().toISOString(),
            },
            route_nodes: locations,
        };
        localStorage.setItem('routeEditorSimulatorData', JSON.stringify(routeData));
        
        // Open simulator in new tab
        window.open('/simulator', '_blank');
    }, [locations]);

    if (isCollapsed) {
        return (
            <div className="w-12 bg-gray-100 border-r border-gray-300 flex items-start justify-center pt-4">
                <button
                    type="button"
                    onClick={handleCollapseToggle}
                    className="p-2 bg-white rounded shadow hover:bg-gray-50"
                    aria-label="Expand sidebar"
                >
                    <ChevronDown size={20} className="rotate-90" />
                </button>
            </div>
        );
    }

    return (
        <div className="w-96 bg-white border-r border-gray-300 flex flex-col shadow-lg">
            {/* Header */}
            <div className="admin-header text-white p-4">
                <div className="flex items-center justify-between mb-1">
                    <h1 className="text-lg font-bold flex items-center gap-2">
                        🎅 Route Editor
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                            ADMIN
                        </span>
                    </h1>
                    <button
                        type="button"
                        onClick={handleCollapseToggle}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronDown size={20} className="-rotate-90" />
                    </button>
                </div>
                <p className="text-xs text-white/80">
                    Right-click map to add stops. Drag to reorder.
                </p>
            </div>

            {/* Stats */}
            <RouteStats locations={locations} validationResults={validationResults} />

            {/* Location List */}
            <div className="flex-1 overflow-y-auto p-3">
                {locations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <MapPin size={48} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-sm font-medium">No locations added yet</p>
                        <p className="text-xs mt-1">Search for a city or right-click on the map</p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={locations.map(loc => loc.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {locations.map((location, index) => (
                                <SortableLocationCard
                                    key={location.id}
                                    location={location}
                                    index={index}
                                    total={locations.length}
                                    onUpdate={onUpdateLocation}
                                    onDelete={onDeleteLocation}
                                    isSelected={selectedLocation === location.id}
                                    onSelect={setSelectedLocation}
                                    validation={validationResults[index]}
                                    canDelete={canDeleteNode ? canDeleteNode(location, index) : index !== 0}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* Action Buttons */}
            <div className="p-3 bg-gray-50 border-t border-gray-200 space-y-2">
                {/* File Link Status */}
                {linkedFileName ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileJson size={14} className="text-green-600 flex-shrink-0" />
                                <span className="text-xs text-green-700 truncate" title={linkedFileName}>
                                    {linkedFileName}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={onUnlinkFile}
                                className="p-1 text-green-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Unlink file"
                            >
                                <Unlink size={14} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isAutoSaveEnabled}
                                    onChange={(e) => onToggleAutoSave(e.target.checked)}
                                    className="w-3.5 h-3.5 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                />
                                <span className="text-xs text-green-700">Auto-save</span>
                            </label>
                            <span className="text-[10px] text-green-600 flex items-center gap-1">
                                {isSaving ? (
                                    <>
                                        <Save size={10} className="animate-pulse" />
                                        Saving...
                                    </>
                                ) : lastSaveTime ? (
                                    <>
                                        <CheckCircle size={10} />
                                        Saved {lastSaveTime}
                                    </>
                                ) : null}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2 mb-2">
                        <button
                            type="button"
                            onClick={onOpenFile}
                            className="flex-1 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center justify-center gap-2 text-sm hover:bg-green-100 transition-colors"
                            title="Open an existing route file"
                        >
                            <FolderOpen size={14} />
                            Open File
                        </button>
                        <button
                            type="button"
                            onClick={onLinkFile}
                            className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center justify-center gap-2 text-sm hover:bg-blue-100 transition-colors"
                            title="Create a new file to auto-save to"
                        >
                            <Link size={14} />
                            New File
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={handleOpenSimulator}
                        disabled={locations.length < 2}
                        className="px-3 py-2.5 btn-secondary-christmas rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Play size={16} />
                        Test Route
                    </button>
                    <button
                        type="button"
                        onClick={onExport}
                        disabled={locations.length < 2}
                        className="px-3 py-2.5 btn-primary-christmas rounded-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={16} />
                        Export
                    </button>
                </div>
                {locations.length > 1 && (
                    <p className="text-xs text-gray-500 text-center">
                        {locations.length} stops • {linkedFileName ? 'Linked' : 'Export as new schema JSON'}
                    </p>
                )}
            </div>
        </div>
    );
}

export default Sidebar;
