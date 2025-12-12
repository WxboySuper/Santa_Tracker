/**
 * Export route data to JSON file.
 * Supports both the new RouteData schema and legacy format.
 * 
 * @param {Object|Array} data - Either a RouteData object with meta/route_nodes, or array of locations
 */
export const exportToJSON = (data) => {
    let exportData;
    
    // Check if it's the new RouteData format
    if (data && data.meta && data.route_nodes) {
        // New schema format - export as-is
        exportData = buildRouteDataExport(data);
    } else if (Array.isArray(data)) {
        // Legacy format - transform to old schema
        exportData = data.map(loc => ({
            name: loc.name ?? loc.location?.name ?? '',
            latitude: loc.latitude ?? loc.location?.lat ?? 0,
            longitude: loc.longitude ?? loc.location?.lng ?? 0,
            utc_offset: loc.utc_offset ?? loc.location?.timezone_offset ?? 0,
            country: loc.country ?? loc.location?.region ?? '',
            population: typeof loc.population === 'number' ? loc.population : 0,
            priority: typeof loc.priority === 'number' ? loc.priority : 1,
            notes: loc.notes ?? ''
        }));
    } else {
        console.error('Invalid data format for export');
        return;
    }

    // Create a blob and download
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
  
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = data.meta ? `cinematic-route-${timestamp}.json` : `santa-route-${timestamp}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Build a properly formatted route data export object
 * @param {Object} data - Route data with meta and route_nodes
 * @returns {Object} Formatted export data
 */
export const buildRouteDataExport = (data) => {
    return {
        meta: {
            year: data.meta.year || new Date().getFullYear(),
            route_version: data.meta.route_version || '1.0',
            generated_at: new Date().toISOString(),
        },
        route_nodes: data.route_nodes.map((node, index) => ({
            comment: node.comment || `--- NODE ${index}: ${node.location?.name || 'UNKNOWN'} ---`,
            id: node.id,
            type: node.type || 'DELIVERY',
            location: {
                name: node.location?.name || '',
                region: node.location?.region || '',
                lat: node.location?.lat ?? 0,
                lng: node.location?.lng ?? 0,
                timezone_offset: node.location?.timezone_offset ?? 0,
            },
            stop_experience: {
                duration_seconds: node.stop_experience?.duration_seconds ?? 60,
                camera_zoom: node.stop_experience?.camera_zoom ?? 14,
                weather_condition: node.stop_experience?.weather_condition || 'clear',
                presents_delivered_at_stop: node.stop_experience?.presents_delivered_at_stop ?? 0,
                // Include new fun fact fields if present
                ...(node.stop_experience?.fun_fact && { fun_fact: node.stop_experience.fun_fact }),
                ...(node.stop_experience?.landmark && { landmark: node.stop_experience.landmark }),
                ...(node.stop_experience?.population && { population: node.stop_experience.population }),
            },
            schedule: node.schedule || {},
            transit_to_here: node.transit_to_here || null,
            // Include acknowledgment flag if present
            ...(node.acknowledged_off_peak !== undefined && { acknowledged_off_peak: node.acknowledged_off_peak }),
        })),
    };
};

/**
 * Write route data to a file handle (File System Access API)
 * @param {FileSystemFileHandle} fileHandle - The file handle to write to
 * @param {Object} data - Route data to write
 * @returns {Promise<boolean>} Success status
 */
export const writeToFileHandle = async (fileHandle, data) => {
    try {
        const exportData = buildRouteDataExport(data);
        const dataStr = JSON.stringify(exportData, null, 2);
        
        // Create a writable stream and write the data
        const writable = await fileHandle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        
        return true;
    } catch (error) {
        console.error('Failed to write to file (debug):', error);

        // Throw a sanitized, user-friendly error. Preserve original error in `cause` for internal use.
        const userError = new Error('Unable to save the route file. Check permissions and available storage.');
        // Attach the original error for diagnostics without exposing it in the message
        try {
          userError.cause = error;
        } catch (e) {
          // ignore if environment doesn't support setting cause
          (userError).originalError = error;
        }
        throw userError;
    }
};

/**
 * Open a file picker to select/create a JSON file for linking
 * @returns {Promise<{handle: FileSystemFileHandle, name: string}|null>}
 */
export const pickFileForLinking = async () => {
    try {
        // Check if File System Access API is supported
        if (!('showSaveFilePicker' in window)) {
            throw new Error('File System Access API is not supported in this browser. Try Chrome or Edge.');
        }
        
        const handle = await window.showSaveFilePicker({
            suggestedName: `santa-route-${new Date().toISOString().split('T')[0]}.json`,
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] },
            }],
        });
        
        return {
            handle,
            name: handle.name,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            // User cancelled the picker
            return null;
        }
        throw error;
    }
};

/**
 * Open a file picker to load an existing route file
 * @returns {Promise<{handle: FileSystemFileHandle, name: string, data: Object}|null>}
 */
export const pickFileToOpen = async () => {
    try {
        if (!('showOpenFilePicker' in window)) {
            throw new Error('File System Access API is not supported in this browser. Try Chrome or Edge.');
        }
        
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] },
            }],
        });
        
        const file = await handle.getFile();
        const contents = await file.text();
        const data = JSON.parse(contents);
        
        return {
            handle,
            name: handle.name,
            data,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            return null;
        }
        throw error;
    }
};

export const getTimezoneOffset = (lat, lng) => {
    // Approximate timezone offset based on longitude
    // This is a simple approximation - 15 degrees per hour
    const offset = Math.round(lng / 15);
    return Math.max(-12, Math.min(14, offset));
};
