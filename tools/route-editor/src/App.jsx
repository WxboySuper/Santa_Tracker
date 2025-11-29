import { useState, useCallback, useRef, useEffect } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { exportToJSON } from './utils/exportUtils';

// Default flight duration for flyTo animation (in milliseconds)
const FLIGHT_DURATION_MS = 2000;
// Base delay between stops at 1x speed (in milliseconds)
const BASE_DELAY_MS = 2000;

function App() {
    const [locations, setLocations] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    
    // Simulation state
    const [simulationState, setSimulationState] = useState({
        status: 'stopped', // 'stopped', 'running', 'paused'
        currentIndex: 0,
        currentPosition: null,
        currentLocationName: '',
        progress: 0
    });
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    
    // Refs for simulation control
    const mapRef = useRef(null);
    const simulationRef = useRef(null);
    const isPausedRef = useRef(false);
    const shouldStopRef = useRef(false);

    const addLocation = useCallback((location) => {
        setLocations(prevLocations => [...prevLocations, { ...location, id: crypto.randomUUID() }]);
    }, []);

    const updateLocation = useCallback((id, updatedData) => {
        setLocations(prevLocations => prevLocations.map(loc => 
            loc.id === id ? { ...loc, ...updatedData } : loc
        ));
    }, []);

    const deleteLocation = useCallback((id) => {
        setLocations(prevLocations => prevLocations.filter(loc => loc.id !== id));
    }, []);

    const reorderLocations = useCallback((newOrder) => {
        setLocations(newOrder);
    }, []);

    const handleExport = useCallback(() => {
        exportToJSON(locations);
    }, [locations]);

    // Handle map ready callback
    const handleMapReady = useCallback((map) => {
        mapRef.current = map;
    }, []);

    // Helper function to create a delay that can be interrupted
    const delay = (ms) => {
        return new Promise((resolve) => {
            const checkInterval = 100; // Check every 100ms for pause/stop
            let elapsed = 0;
            
            const check = () => {
                if (shouldStopRef.current) {
                    resolve();
                    return;
                }
                
                if (isPausedRef.current) {
                    // While paused, keep checking but don't count time
                    setTimeout(check, checkInterval);
                    return;
                }
                
                elapsed += checkInterval;
                if (elapsed >= ms) {
                    resolve();
                } else {
                    setTimeout(check, checkInterval);
                }
            };
            
            setTimeout(check, checkInterval);
        });
    };

    // Run simulation - async function that moves through locations
    const runSimulation = useCallback(async () => {
        if (!mapRef.current || !locations || locations.length < 2) {
            console.warn('Cannot start simulation: map not ready or insufficient locations');
            return;
        }

        const map = mapRef.current;
        shouldStopRef.current = false;
        isPausedRef.current = false;

        // Start from the beginning or resume from paused index
        const startIndex = simulationState.status === 'paused' ? simulationState.currentIndex : 0;
        
        setSimulationState(prev => ({
            ...prev,
            status: 'running'
        }));

        // Iterate through each location
        for (let i = startIndex; i < locations.length; i++) {
            // Check if we should stop
            if (shouldStopRef.current) {
                break;
            }

            const loc = locations[i];
            
            // Validate location data
            if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
                console.warn(`Invalid location at index ${i}:`, loc);
                continue;
            }

            const position = [loc.latitude, loc.longitude];
            const progress = ((i + 1) / locations.length) * 100;
            
            // Update simulation state
            setSimulationState({
                status: 'running',
                currentIndex: i,
                currentPosition: position,
                currentLocationName: loc.name || `Stop ${i + 1}`,
                progress
            });

            // Calculate zoom level based on whether we have a next location
            const nextLoc = locations[i + 1];
            let zoomLevel = 6;
            
            if (nextLoc) {
                // Calculate distance-based zoom
                const latDiff = Math.abs(nextLoc.latitude - loc.latitude);
                const lngDiff = Math.abs(nextLoc.longitude - loc.longitude);
                const maxDiff = Math.max(latDiff, lngDiff);
                
                if (maxDiff > 50) zoomLevel = 3;
                else if (maxDiff > 20) zoomLevel = 4;
                else if (maxDiff > 10) zoomLevel = 5;
                else zoomLevel = 6;
            }

            // Fly to the location
            try {
                map.flyTo(position, zoomLevel, { 
                    duration: FLIGHT_DURATION_MS / 1000, // flyTo uses seconds
                    easeLinearity: 0.25
                });
            } catch (err) {
                console.error('Error during flyTo:', err);
            }

            // Wait for the flight animation to complete
            await delay(FLIGHT_DURATION_MS / playbackSpeed);
            
            // Additional delay at each stop (inversely proportional to speed)
            if (i < locations.length - 1) {
                await delay(BASE_DELAY_MS / playbackSpeed);
            }
        }

        // Simulation complete (unless stopped)
        if (!shouldStopRef.current) {
            setSimulationState(prev => ({
                ...prev,
                status: 'stopped',
                progress: 100
            }));
        }
    }, [locations, playbackSpeed, simulationState.status, simulationState.currentIndex]);

    // Start/Resume simulation
    const handleStartSimulation = useCallback(() => {
        if (simulationState.status === 'paused') {
            // Resume
            isPausedRef.current = false;
            setSimulationState(prev => ({
                ...prev,
                status: 'running'
            }));
        } else {
            // Start fresh
            runSimulation();
        }
    }, [simulationState.status, runSimulation]);

    // Pause simulation
    const handlePauseSimulation = useCallback(() => {
        isPausedRef.current = true;
        setSimulationState(prev => ({
            ...prev,
            status: 'paused'
        }));
    }, []);

    // Stop simulation
    const handleStopSimulation = useCallback(() => {
        shouldStopRef.current = true;
        isPausedRef.current = false;
        setSimulationState({
            status: 'stopped',
            currentIndex: 0,
            currentPosition: null,
            currentLocationName: '',
            progress: 0
        });
        
        // Reset map view
        if (mapRef.current && locations.length > 0) {
            mapRef.current.setView([20, 0], 2);
        }
    }, [locations]);

    // Handle speed change
    const handleSpeedChange = useCallback((speed) => {
        setPlaybackSpeed(speed);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            shouldStopRef.current = true;
        };
    }, []);

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
                // Simulation props
                simulationState={simulationState}
                playbackSpeed={playbackSpeed}
                onSpeedChange={handleSpeedChange}
                onStartSimulation={handleStartSimulation}
                onPauseSimulation={handlePauseSimulation}
                onStopSimulation={handleStopSimulation}
            />
            <MapEditor 
                locations={locations}
                onAddLocation={addLocation}
                setSelectedLocation={setSelectedLocation}
                simulationState={simulationState}
                currentSimulationIndex={simulationState.currentIndex}
                onMapReady={handleMapReady}
            />
        </div>
    );
}

export default App;
