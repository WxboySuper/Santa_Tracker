export const exportToJSON = (locations) => {
    // Transform locations to match the required schema
    const exportData = locations.map(loc => ({
        name: loc.name || '',
        latitude: loc.latitude || 0,
        longitude: loc.longitude || 0,
        utc_offset: loc.utc_offset || 0,
        country: loc.country || '',
        population: loc.population || 0,
        priority: loc.priority || 1,
        notes: loc.notes || ''
    }));

    // Create a blob and download
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
  
    const link = document.createElement('a');
    link.href = url;
    link.download = `santa-route-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const getTimezoneOffset = (lat, lng) => {
    // Simple approximation based on longitude
    // More accurate would require a timezone database
    const offset = Math.round(lng / 15);
    return Math.max(-12, Math.min(14, offset));
};
