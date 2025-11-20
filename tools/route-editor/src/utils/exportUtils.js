export const exportToJSON = (locations) => {
    // Transform locations to match the required schema with proper validation
    const exportData = locations.map(loc => ({
        name: loc.name ?? '',
        latitude: typeof loc.latitude === 'number' ? loc.latitude : (Number(loc.latitude) || 0),
        longitude: typeof loc.longitude === 'number' ? loc.longitude : (Number(loc.longitude) || 0),
        utc_offset: typeof loc.utc_offset === 'number' ? loc.utc_offset : (Number(loc.utc_offset) || 0),
        country: loc.country ?? '',
        population: typeof loc.population === 'number' ? loc.population : (Number(loc.population) || 0),
        priority: typeof loc.priority === 'number' ? loc.priority : (Number(loc.priority) || 1),
        notes: loc.notes ?? ''
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
