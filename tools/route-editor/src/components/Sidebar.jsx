import { useState, useCallback } from 'react';
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
import { GripVertical, Trash2, ChevronDown, ChevronUp, Download } from 'lucide-react';

// Sortable location card
function SortableLocationCard({ location, index, total, onUpdate, onDelete, isSelected, onSelect }) {
    const [isExpanded, setIsExpanded] = useState(false);
  
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: location.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleChange = useCallback((field, value) => {
        onUpdate(location.id, { [field]: value });
    }, [location.id, onUpdate]);

    const getBadgeColor = useCallback(() => {
        if (total === 1) return 'bg-blue-500';
        if (index === 0) return 'bg-green-500';
        if (index === total - 1) return 'bg-red-500';
        return 'bg-blue-500';
    }, [index, total]);

    const getBadgeText = useCallback(() => {
        if (total === 1) return 'Only Stop';
        if (index === 0) return 'Start';
        if (index === total - 1) return 'End';
        return `Stop ${index + 1}`;
    }, [index, total]);

    const handleCardClick = useCallback(() => {
        onSelect(location.id);
    }, [location.id, onSelect]);

    const handleCardKeyDown = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
        }
    }, [handleCardClick]);

    const handleExpandToggle = useCallback((e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    }, [isExpanded]);

    const handleDelete = useCallback((e) => {
        e.stopPropagation();
        onDelete(location.id);
    }, [location.id, onDelete]);

    const handleInputClick = useCallback((e) => {
        e.stopPropagation();
    }, []);

    const handleNameChange = useCallback((e) => {
        handleChange('name', e.target.value);
    }, [handleChange]);

    const handleCountryChange = useCallback((e) => {
        handleChange('country', e.target.value);
    }, [handleChange]);

    const handlePriorityChange = useCallback((e) => {
        handleChange('priority', parseInt(e.target.value, 10));
    }, [handleChange]);

    const handleUtcOffsetChange = useCallback((e) => {
        handleChange('utc_offset', parseInt(e.target.value, 10) || 0);
    }, [handleChange]);

    const handleStopDurationChange = useCallback((e) => {
        handleChange('stop_duration', parseInt(e.target.value, 10) || 0);
    }, [handleChange]);

    const handleNotesChange = useCallback((e) => {
        handleChange('notes', e.target.value);
    }, [handleChange]);

    const handlePopulationChange = useCallback((e) => {
        handleChange('population', parseInt(e.target.value, 10) || 0);
    }, [handleChange]);

    return (
        // skipcq: JS-0415
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white rounded-lg shadow-md mb-3 border-2 ${
                isSelected ? 'border-blue-500' : 'border-transparent'
            }`}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            role="button"
            tabIndex={0}
        >
            <div className="p-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="cursor-move touch-none"
                        {...attributes}
                        {...listeners}
                        aria-label="Drag to reorder"
                    >
                        <GripVertical size={20} className="text-gray-400 hover:text-gray-600" />
                    </button>
          
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${getBadgeColor()}`}>
                                    {getBadgeText()}
                                </span>
                                <h3 className="font-semibold text-sm">{location.name || 'Unnamed Location'}</h3>
                            </div>
              
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={handleExpandToggle}
                                    className="p-1 hover:bg-gray-100 rounded"
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="p-1 hover:bg-red-100 text-red-600 rounded"
                                    aria-label="Delete location"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
            
                        <div className="text-xs text-gray-500 mt-1">
                            {location.country && `${location.country} • `}
                            {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
                        </div>
                    </div>
                </div>

                {/* skipcq: JS-0415 - Complex form structure requires nesting for proper layout */}
                {isExpanded && (
                    // skipcq: 0415
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                        <div>
                            <label htmlFor={`name-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                Name
                            </label>
                            <input
                                id={`name-${location.id}`}
                                type="text"
                                value={location.name}
                                onChange={handleNameChange}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={handleInputClick}
                            />
                        </div>

                        <div>
                            <label htmlFor={`country-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                Country
                            </label>
                            <input
                                id={`country-${location.id}`}
                                type="text"
                                value={location.country}
                                onChange={handleCountryChange}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={handleInputClick}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label htmlFor={`priority-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                    Priority
                                </label>
                                <select
                                    id={`priority-${location.id}`}
                                    value={location.priority}
                                    onChange={handlePriorityChange}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onClick={handleInputClick}
                                >
                                    <option value={1}>1 - High</option>
                                    <option value={2}>2 - Medium</option>
                                    <option value={3}>3 - Low</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor={`utc-offset-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                    UTC Offset
                                </label>
                                <input
                                    id={`utc-offset-${location.id}`}
                                    type="number"
                                    value={location.utc_offset}
                                    onChange={handleUtcOffsetChange}
                                    min="-12"
                                    max="14"
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    onClick={handleInputClick}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor={`duration-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                Stop Duration (minutes)
                            </label>
                            <input
                                id={`duration-${location.id}`}
                                type="number"
                                value={location.stop_duration || 0}
                                onChange={handleStopDurationChange}
                                min="0"
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={handleInputClick}
                            />
                        </div>

                        <div>
                            <label htmlFor={`notes-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                Notes
                            </label>
                            <textarea
                                id={`notes-${location.id}`}
                                value={location.notes}
                                onChange={handleNotesChange}
                                rows={3}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Fun facts or special notes..."
                                onClick={handleInputClick}
                            />
                        </div>

                        <div>
                            <label htmlFor={`population-${location.id}`} className="block text-xs font-medium text-gray-700 mb-1">
                                Population (optional)
                            </label>
                            <input
                                id={`population-${location.id}`}
                                type="number"
                                value={location.population || 0}
                                onChange={handlePopulationChange}
                                min="0"
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={handleInputClick}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Sidebar({ locations, onUpdateLocation, onDeleteLocation, onReorder, onExport, selectedLocation, setSelectedLocation }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
  
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            const oldIndex = locations.findIndex(loc => loc.id === active.id);
            const newIndex = locations.findIndex(loc => loc.id === over.id);
            onReorder(arrayMove(locations, oldIndex, newIndex));
        }
    }, [locations, onReorder]);

    const handleCollapseToggle = useCallback(() => {
        setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);

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
        <div className="w-96 bg-gray-50 border-r border-gray-300 flex flex-col">
            <div className="p-4 bg-white border-b border-gray-300">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-xl font-bold text-gray-800">🎅 Route Editor</h1>
                    <button
                        type="button"
                        onClick={handleCollapseToggle}
                        className="p-1 hover:bg-gray-100 rounded"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronDown size={20} className="-rotate-90" />
                    </button>
                </div>
                <p className="text-sm text-gray-600">
                    Right-click on map to add locations. Drag to reorder.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {locations.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p className="text-sm">No locations added yet.</p>
                        <p className="text-xs mt-2">Search for a city or right-click on the map to add stops.</p>
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
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            <div className="p-4 bg-white border-t border-gray-300">
                <button
                    type="button"
                    onClick={onExport}
                    disabled={locations.length === 0}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                    <Download size={20} />
                    Export Route ({locations.length} stops)
                </button>
                {locations.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                        Route will be exported as JSON
                    </p>
                )}
            </div>
        </div>
    );
}

export default Sidebar;
