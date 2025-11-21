import { useState, useCallback } from 'react';
import MapEditor from './components/MapEditor';
import Sidebar from './components/Sidebar';
import { exportToJSON } from './utils/exportUtils';

function App() {
    const [locations, setLocations] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);

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
