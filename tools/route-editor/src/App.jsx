import { useState, useCallback, useEffect, useRef } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { exportToJSON, writeToFileHandle, pickFileForLinking, pickFileToOpen } from './utils/exportUtils';
import { 
    recalculateRoute, 
    validateRoute, 
    canDeleteNode,
    NORTH_POLE_ANCHOR 
} from './utils/routeCalculations';

function App() {
    // Route nodes state - initialized with the North Pole anchor
    const [routeNodes, setRouteNodes] = useState(() => {
        // Initialize with the North Pole anchor node
        return [{
            ...NORTH_POLE_ANCHOR,
            comment: '--- NODE 0: THE ANCHOR (HARD LOCKED) ---',
            schedule: {
                arrival_utc: null,
                departure_utc: null,
            },
            transit_to_here: null,
        }];
    });
    
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [validationResults, setValidationResults] = useState([]);
    
    // File linking state
    const [linkedFileHandle, setLinkedFileHandle] = useState(null);
    const [linkedFileName, setLinkedFileName] = useState(null);
    const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(true);
    const [lastSaveTime, setLastSaveTime] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Debounce timer ref for auto-save
    const autoSaveTimerRef = useRef(null);

    // Legacy alias for backwards compatibility with existing components
    const locations = routeNodes;

    /**
     * Recalculates the entire route schedule.
     * Called whenever nodes are added, updated, deleted, or reordered.
     * 
     * Implementation of docs/editor_algorithm_logic.md:
     * 1. Node[0] is always the North Pole (locked)
     * 2. Calculates arrival UTC for each node based on previous departure + travel time
     * 3. Back-calculates Node[0]'s departure from Node[1]'s arrival
     */
    const recalculate = useCallback((nodes) => {
        // Determine desired local arrival hour for the first stop.
        // Historically we started with locations in UTC+14 (midnight local).
        // If the first stop's timezone is earlier (e.g., UTC+12 for Russia),
        // shift the target to 23:00 local to keep timing consistent across start choices.
        let firstArrivalHour = 0; // default midnight
        try {
            const node1 = nodes && nodes[1];
            const tz = node1?.location?.timezone_offset;
            if (typeof tz === 'number') {
                // If timezone is substantially earlier than +14 (<= +12), use 22:45 local
                // Represented as decimal hours: 22.75
                if (tz <= 12) {
                    firstArrivalHour = 22.75; // 22:45 local
                }
            }
        } catch (e) {
            // Fallback to midnight on any error
            firstArrivalHour = 0;
        }

        const updatedNodes = recalculateRoute(nodes, {
            targetYear: new Date().getFullYear(),
            firstArrivalHour, // Local hour for first stop arrival
        });
        
        // Validate the updated route
        const validation = validateRoute(updatedNodes);
        setValidationResults(validation);
        
        return updatedNodes;
    }, []);

    // Recalculate route whenever nodes change (after initial render)
    useEffect(() => {
        if (routeNodes.length > 1) {
            const recalculated = recalculate(routeNodes);
            // Only update if schedules changed to avoid infinite loop
            const hasChanges = recalculated.some((node, i) => 
                JSON.stringify(node.schedule) !== JSON.stringify(routeNodes[i]?.schedule)
            );
            if (hasChanges) {
                setRouteNodes(recalculated);
            }
        }
    }, [routeNodes]); // Only re-run when node count changes

    // Auto-save to linked file when route changes
    useEffect(() => {
        if (!linkedFileHandle || !isAutoSaveEnabled || routeNodes.length < 2) {
            return;
        }

        // Clear existing timer
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        // Debounce auto-save by 1 second
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                const routeData = {
                    meta: {
                        year: new Date().getFullYear(),
                        route_version: '1.0',
                    },
                    route_nodes: routeNodes,
                };
                await writeToFileHandle(linkedFileHandle, routeData);
                setLastSaveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            } catch (error) {
                console.error('Auto-save failed:', error);
                // If permission was revoked, unlink the file
                if (error.name === 'NotAllowedError') {
                    setLinkedFileHandle(null);
                    setLinkedFileName(null);
                    alert('File access was revoked. Please re-link the file.');
                }
            } finally {
                setIsSaving(false);
            }
        }, 1000);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [routeNodes, linkedFileHandle, isAutoSaveEnabled]);

    // File linking handlers
    const handleLinkFile = useCallback(async () => {
        try {
            const result = await pickFileForLinking();
            if (result) {
                setLinkedFileHandle(result.handle);
                setLinkedFileName(result.name);
                setIsAutoSaveEnabled(true);
                setLastSaveTime(null);
                
                // Immediately save current state to the file
                if (routeNodes.length > 1) {
                    setIsSaving(true);
                    const routeData = {
                        meta: {
                            year: new Date().getFullYear(),
                            route_version: '1.0',
                        },
                        route_nodes: routeNodes,
                    };
                    await writeToFileHandle(result.handle, routeData);
                    setLastSaveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    setIsSaving(false);
                    try{
                        await writeToFileHandle(result.handle, routeData);
                        setLastSaveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                    } finally {
                        setIsSaving(false);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to link file:', error);
            alert(`Failed to link file: ${error.message}`);
        }
    }, [routeNodes]);

    const handleUnlinkFile = useCallback(() => {
        setLinkedFileHandle(null);
        setLinkedFileName(null);
        setLastSaveTime(null);
        setIsAutoSaveEnabled(true);
    }, []);

    const handleToggleAutoSave = useCallback((enabled) => {
        setIsAutoSaveEnabled(enabled);
    }, []);

    // Open an existing route file and load it
    const handleOpenFile = useCallback(async () => {
        try {
            const result = await pickFileToOpen();
            if (result) {
                // Validate the loaded data has the expected structure
                if (!result.data || !result.data.route_nodes || !Array.isArray(result.data.route_nodes)) {
                    throw new Error('Invalid route file format. Expected route_nodes array.');
                }

                // Load the route data
                const loadedNodes = result.data.route_nodes;
                
                // Ensure the first node is still the North Pole anchor
                if (loadedNodes.length > 0 && loadedNodes[0].type === 'START') {
                    // Recalculate the route to ensure all schedules are correct
                    const recalculatedNodes = recalculate(loadedNodes);
                    setRouteNodes(recalculatedNodes);
                } else {
                    // Prepend North Pole anchor if missing
                    const nodesWithAnchor = [
                        {
                            ...NORTH_POLE_ANCHOR,
                            comment: '--- NODE 0: THE ANCHOR (HARD LOCKED) ---',
                            schedule: {
                                arrival_utc: null,
                                departure_utc: null,
                            },
                            transit_to_here: null,
                        },
                        ...loadedNodes,
                    ];
                    const recalculatedNodes = recalculate(nodesWithAnchor);
                    setRouteNodes(recalculatedNodes);
                }

                // Link to this file for auto-save
                setLinkedFileHandle(result.handle);
                setLinkedFileName(result.name);
                setIsAutoSaveEnabled(true);
                setLastSaveTime(null);

                console.log(`Loaded route from ${result.name} with ${loadedNodes.length} nodes`);
            }
        } catch (error) {
            console.error('Failed to open file:', error);
            alert(`Failed to open file: ${error.message}`);
        }
    }, [recalculate]);

    const addLocation = useCallback((location) => {
        setRouteNodes(prevNodes => {
            // Create the new node with proper structure
            // Handle both old format (from MapEditor) and new format
            const nodeIndex = prevNodes.length;
            const name = location.name || location.location?.name || 'Unknown Location';
            const lat = location.latitude ?? location.lat ?? location.location?.lat ?? 0;
            const lng = location.longitude ?? location.lng ?? location.location?.lng ?? 0;
            const timezoneOffset = location.utc_offset ?? location.timezone_offset ?? location.location?.timezone_offset ?? 0;
            const region = location.country ?? location.region ?? location.location?.region ?? '';
            
            const newNode = {
                id: `node_${String(nodeIndex).padStart(3, '0')}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20)}`,
                type: 'DELIVERY', // Default type for new nodes
                location: {
                    name: name,
                    region: region,
                    lat: lat,
                    lng: lng,
                    timezone_offset: timezoneOffset,
                },
                stop_experience: {
                    duration_seconds: 60,
                    camera_zoom: 14,
                    weather_condition: 'clear',
                    presents_delivered_at_stop: 0,
                },
                // Schedule and transit will be calculated by recalculateRoute
                schedule: {},
                transit_to_here: null,
            };

            const updatedNodes = [...prevNodes, newNode];
            return recalculate(updatedNodes);
        });
    }, [recalculate]);

    const updateLocation = useCallback((id, updatedData) => {
        setRouteNodes(prevNodes => {
            const updatedNodes = prevNodes.map(node => {
                if (node.id !== id) return node;
                
                // Deep merge for nested objects (location, stop_experience, schedule)
                const merged = { ...node };
                
                // Merge location if provided
                if (updatedData.location) {
                    merged.location = { ...node.location, ...updatedData.location };
                }
                
                // Merge stop_experience if provided
                if (updatedData.stop_experience) {
                    merged.stop_experience = { ...node.stop_experience, ...updatedData.stop_experience };
                }
                
                // Merge schedule if provided
                if (updatedData.schedule) {
                    merged.schedule = { ...node.schedule, ...updatedData.schedule };
                }
                
                // Handle top-level properties (type, acknowledged_off_peak, etc.)
                Object.keys(updatedData).forEach(key => {
                    if (!['location', 'stop_experience', 'schedule'].includes(key)) {
                        merged[key] = updatedData[key];
                    }
                });
                
                return merged;
            });
            
            return recalculate(updatedNodes);
        });
    }, [recalculate]);

    const deleteLocation = useCallback((id) => {
        setRouteNodes(prevNodes => {
            const nodeIndex = prevNodes.findIndex(n => n.id === id);
            const node = prevNodes[nodeIndex];
            
            // Prevent deletion of anchor node (Step 0 constraint)
            if (!canDeleteNode(node, nodeIndex)) {
                console.warn('Cannot delete the North Pole anchor node');
                return prevNodes;
            }
            
            const updatedNodes = prevNodes.filter(n => n.id !== id);
            return recalculate(updatedNodes);
        });
    }, [recalculate]);

    const reorderLocations = useCallback((newOrder) => {
        // Ensure the anchor stays at position 0
        const anchorNode = newOrder.find(n => n.type === 'START');
        if (anchorNode && newOrder[0] !== anchorNode) {
            // Move anchor back to position 0
            const filtered = newOrder.filter(n => n.type !== 'START');
            newOrder = [anchorNode, ...filtered];
        }
        
        setRouteNodes(recalculate(newOrder));
    }, [recalculate]);

    const handleExport = useCallback(() => {
        // Export with the new route data structure
        const routeData = {
            meta: {
                year: new Date().getFullYear(),
                route_version: '1.0',
                generated_at: new Date().toISOString(),
            },
            route_nodes: routeNodes,
        };
        exportToJSON(routeData);
    }, [routeNodes]);

    return (
        <div className="flex h-screen w-screen">
            <Sidebar 
                locations={locations}
                onUpdateLocation={updateLocation}
                onDeleteLocation={deleteLocation}
                onReorder={reorderLocations}
                onExport={handleExport}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                validationResults={validationResults}
                canDeleteNode={canDeleteNode}
                // File linking props
                linkedFileName={linkedFileName}
                isAutoSaveEnabled={isAutoSaveEnabled}
                onLinkFile={handleLinkFile}
                onUnlinkFile={handleUnlinkFile}
                onOpenFile={handleOpenFile}
                onToggleAutoSave={handleToggleAutoSave}
                lastSaveTime={lastSaveTime}
                isSaving={isSaving}
            />
            <MapEditor 
                locations={locations}
                onAddLocation={addLocation}
                setSelectedLocation={setSelectedLocation}
            />
        </div>
    );
}

export default App;
