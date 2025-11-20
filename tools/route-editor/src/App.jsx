import React, { useState } from 'react'
import MapEditor from './components/MapEditor'
import Sidebar from './components/Sidebar'
import { exportToJSON } from './utils/exportUtils'

function App() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)

  const addLocation = (location) => {
    setLocations([...locations, { ...location, id: Date.now() }])
  }

  const updateLocation = (id, updatedData) => {
    setLocations(locations.map(loc => 
      loc.id === id ? { ...loc, ...updatedData } : loc
    ))
  }

  const deleteLocation = (id) => {
    setLocations(locations.filter(loc => loc.id !== id))
  }

  const reorderLocations = (newOrder) => {
    setLocations(newOrder)
  }

  const handleExport = () => {
    exportToJSON(locations)
  }

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
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
      />
    </div>
  )
}

export default App
