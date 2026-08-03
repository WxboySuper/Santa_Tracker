// skipcq: JS-C1003
import * as L from 'leaflet';
import html2canvas from 'html2canvas';
import { OutlookData, OutlookType } from '../types/outlooks';
import { colorMappings } from './outlookUtils';
import { store } from '../store';

type ExportMapLike = {
  getContainer?: () => HTMLElement;
  getTargetElement?: () => HTMLElement;
};

// Type guard to check if the map object is a Leaflet map instance (has getContainer and getBounds methods)
const isLeafletMap = (map: unknown): map is L.Map => {
  return Boolean(map && typeof (map as L.Map).getContainer === 'function' && typeof (map as L.Map).getBounds === 'function');
};


// Helper: get the export container element from the map-like object,
// trying multiple methods for compatibility with different map libraries
export const getExportContainer = (map: ExportMapLike): HTMLElement | null => {
  if (map.getContainer) {
    return map.getContainer();
  }

  if (map.getTargetElement) {
    return map.getTargetElement();
  }

  return null;
};

export type ExportImageFormat = 'png' | 'jpeg';

export interface ExportImageOptions {
  title?: string;
  format?: ExportImageFormat;
  quality?: number;
  includeLegendAndStatus?: boolean;
}

/**
 * Get the style for a feature based on outlook type and probability
 */
const getFeatureStyle = (outlookType: OutlookType, probability: string): L.PathOptions => {
  // Use a lookup to avoid branching and reduce cyclomatic complexity
  const palettes: Record<string, Record<string, string>> = {
    categorical: colorMappings.categorical as Record<string, string>,
    tornado: colorMappings.tornado as Record<string, string>,
    wind: colorMappings.wind as Record<string, string>,
    hail: colorMappings.hail as Record<string, string>,
    totalSevere: colorMappings.totalSevere as Record<string, string>,
    'day4-8': colorMappings['day4-8'] as Record<string, string>
  };

  // Default to white if no match found, but this should not happen if data is valid
  const color = palettes[outlookType]?.[probability] ?? '#FFFFFF';
  
  // Check for CIG (Hatching)
  if (probability.startsWith('CIG')) {
      // In export, we might just use transparency or a placeholder if patterns aren't supported.
      // But we should try to support them if possible.
      // Since html2canvas captures the DOM, if we use the same URL patterns, they might work
      // if the definitions are available in the document.
      const patternUrl = colorMappings.hatching[probability as keyof typeof colorMappings.hatching];
      return {
          color: '#000000',
          weight: 1,
          opacity: 1,
          fillColor: patternUrl || 'none',
          fillOpacity: 1,
          className: 'hatching-layer'
      };
  }

  // Legacy significance check removed
  return {
    color: '#000000',
    fillColor: color,
    fillOpacity: 0.4,
    weight: 2,
    opacity: 1
  };
};

/**
 * Helper function to get the current date formatted as YYYY-MM-DD HH:MM
 */
export const getFormattedDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

/**
 * Exports the current map view as a PNG image.
 * 
 * Uses the ORIGINAL approach that was working: fitBounds instead of setView.
 * The key is using fitBounds with the EXACT bounds from the original map.
 * 
 * @param map The Leaflet map instance to export
 * @param outlooks The outlook data from Redux store  
 * @param title Optional title to add to the image
 */
// Helper: create offscreen container sized like the original
export const createTempContainer = (width: number, height: number): HTMLDivElement => {
  const temp = document.createElement('div');
  temp.style.cssText = `position:absolute;left:-9999px;width:${width}px;height:${height}px;`;
  document.body.appendChild(temp);
  return temp;
};

// Helper: create a temporary Leaflet map instance
const createTempMap = (container: HTMLElement, center: L.LatLng, zoom: number, crs: L.CRS): L.Map => {
  return L.map(container, {
    center,
    zoom,
    crs: crs || L.CRS.EPSG3857,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
  });
};

// Helper: add tiles to map and wait for load or timeout
export const addTilesAndWait = (mapInstance: L.Map, sourceMap: L.Map, timeout = 5000): Promise<{ timedOut: boolean; remaining: number }> => {
  // We want to replicate the active tile layers from the source map onto the temp map to ensure they are captured in the export.
  return new Promise((resolve) => {
    const activeTileLayers: L.TileLayer[] = [];
    // We look for active tile layers in the source map to replicate, but if we can't find any,
    // we'll add a default OSM layer to ensure we have some basemap tiles in the export.
    sourceMap.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        activeTileLayers.push(layer as L.TileLayer);
      }
    });

    // Fallback to a default single OSM layer if none found
    const layersToAdd = activeTileLayers.length > 0 ? activeTileLayers : [L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { crossOrigin: 'anonymous' })];

    let resolved = false;
    let pendingTiles = 0;

    // Listen for tile load events to track pending tiles and resolve when done or on timeout
    const finish = (fromTimeout = false) => {
      if (!resolved) {
        resolved = true;
        resolve({ timedOut: fromTimeout, remaining: pendingTiles });
      }
    };

    // Helper to add a tile layer and set up event listeners to track loading
    const addAndWatch = (srcLayer: L.TileLayer & { _url?: string }) => {
      // Derive a best-effort URL and options for a tile layer
      const deriveConfig = (layerSrc: L.TileLayer & { _url?: string }) => {
        const srcAny = layerSrc as L.TileLayer & { options: L.TileLayerOptions & { url?: string }; _url?: string };
        const url = srcAny.options?.url ?? (typeof srcAny.getTileUrl === 'function' ? srcAny.getTileUrl({ x: 0, y: 0, z: (srcAny.options?.maxZoom as number) ?? 0 } as L.Coords) : undefined) ?? srcAny._url;
        const attribution = (layerSrc.options?.attribution as string | undefined) ?? '© OpenStreetMap contributors';
        const maxZoom = layerSrc.options?.maxZoom ?? 19;
        return { url, attribution, maxZoom };
      };

      // Create a new tile layer for the export map using the derived config, ensuring CORS is enabled
      const { url: derivedUrl, attribution, maxZoom } = deriveConfig(srcLayer);
      // Note: We use the derived URL directly in the tile layer,
      // which should allow html2canvas to capture the tiles if they load successfully,
      // and we track loading via events to know when to capture.
      const layer = L.tileLayer(derivedUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution,
        maxZoom,
        crossOrigin: 'anonymous'
      });

      // Listen for tile load events to track pending tiles and resolve when done or on timeout
      const onTileStart = () => { pendingTiles += 1; };
      // We listen for both 'tileload' and 'tileerror' to ensure we account for all tiles, even if some fail to load.
      const onTileFinish = () => {
        pendingTiles = Math.max(0, pendingTiles - 1);
        if (pendingTiles === 0) finish(false);
      };

      layer.on('tileloadstart', onTileStart);
      layer.on('tileload', onTileFinish);
      layer.on('tileerror', onTileFinish);
      // In case the layer has no tiles to load (e.g. a single-tile layer or already cached),
      // we also listen for the 'load' event on the layer itself as a fallback to resolve when it's done.
      layer.on('load', () => finish(false));
      layer.addTo(mapInstance);
    };

    // Add and watch all derived layers
    layersToAdd.forEach(addAndWatch);

    // Safety timeout
    setTimeout(() => finish(true), timeout);
  });
};

// Helper to sort probabilities (extracted)
export const sortProbabilities = (entries: [string, GeoJSON.Feature[]][]): [string, GeoJSON.Feature[]][] => {
  // We want to sort probabilities in a specific order for rendering:
  return entries.sort((a, b) => {
    const [probA, probB] = [a[0], b[0]];

    // CIG levels come after numeric probabilities (render on top)
    const isCigA = probA.startsWith('CIG');
    // We want to sort CIG levels alphabetically among themselves, but all after numeric and TSTM/MRGL/SLGT/ENH/MDT/HIGH
    const isCigB = probB.startsWith('CIG');
    
    if (isCigA !== isCigB) {
      return isCigA ? 1 : -1;
    }
    
    if (isCigA && isCigB) {
      return probA.localeCompare(probB);
    }

    if (probA === 'TSTM') return -1;
    if (probB === 'TSTM') return 1;

    // For categorical outlooks, we want to sort by the predefined risk order rather than numeric value,
    // since they are not strictly numeric and have a specific hierarchy. For other outlooks with numeric probabilities,
    // we can sort by numeric value.
    const riskOrder: Record<string, number> = { 'TSTM': 0, 'MRGL': 1, 'SLGT': 2, 'ENH': 3, 'MDT': 4, 'HIGH': 5 };
    if (riskOrder[probA] !== undefined && riskOrder[probB] !== undefined) return riskOrder[probA] - riskOrder[probB];
    // Extract numeric value for sorting, ignoring non-numeric characters (e.g. '%') and defaulting to 0 if not a number
    const getPercentValue = (prob: string) => parseInt(prob.replace(/[^0-9]/g, '')) || 0;
    return getPercentValue(probA) - getPercentValue(probB);  });
};

// Helper: render outlooks onto a map instance
export const renderOutlooksToMap = (mapInstance: L.Map, outlooks: OutlookData) => {
  /** Returns export-time style options that match the released opaque map rendering mode. */
  const getExportFeatureStyle = (outlookType: OutlookType, probability: string) =>
    getFeatureStyle(outlookType, probability);

  // We want to render in a specific order to ensure proper layering
  // (e.g. categorical at bottom, then tornado/wind/hail, then totalSevere, then day4-8 on top)
  const outlookOrder: OutlookType[] = ['categorical', 'tornado', 'wind', 'hail', 'totalSevere', 'day4-8'];
  // We loop through each outlook type in the defined order, and for each one, we get the corresponding features,
  outlookOrder.forEach((outlookType) => {
    // Use a lookup to avoid branching and reduce cyclomatic complexity
    const outlookMap = outlooks[outlookType];
    if (!outlookMap) return;
    const entries = Array.from(outlookMap.entries()) as [string, GeoJSON.Feature[]][];
    const sortedEntries = sortProbabilities(entries);
    // Then we loop through the sorted probabilities and render the features with styles based on the outlook type and probability.
    sortedEntries.forEach(([probability, features]) => {
      const styleOptions = getExportFeatureStyle(outlookType, probability);
      // We add each feature as a GeoJSON layer to the map with the appropriate style.
      // This ensures that the exported image will have the same outlook layers rendered as seen in the live map.
      features.forEach(feature => {
        // Note: We use L.geoJSON to render the features,
        // which should work with html2canvas as long as the styles are applied correctly.
        L.geoJSON(feature, { style: () => styleOptions }).addTo(mapInstance);
      });
    });
  });
};

// Helper: add title/footer/status and unofficial overlays
export const addOverlays = (container: HTMLElement, title?: string, statusText?: string, unofficialText?: string) => {
  const doc = container.ownerDocument;
  const isDarkMode = store.getState().theme.darkMode;

  // Status overlay recreated from text so html2canvas does not reflow flex styles.
  if (statusText) {
    const wrapperDiv = doc.createElement('div');
    wrapperDiv.style.cssText = 'position:absolute;top:12px;left:0;width:100%;text-align:center;z-index:1400;pointer-events:none;';
    const badgeBg = isDarkMode ? '#3a3a3a' : 'rgba(34,34,34,0.85)';
    const badgeColor = isDarkMode ? '#e4e4e4' : '#ffffff';
    const badgeBorder = isDarkMode ? 'border:1px solid #404040;' : '';
    const badgeDiv = doc.createElement('div');
    // Keep badge (shape) in normal position; move text up by 10px only for export
    badgeDiv.style.cssText = `display:inline-block;background-color:${badgeBg};color:${badgeColor};padding:0 18px;height:34px;line-height:28px;border-radius:17px;font-weight:bold;font-size:14px;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5);${badgeBorder}`;
    // create inner span for text so we can nudge text without moving the pill shape
    const badgeTextSpan = doc.createElement('span');
    badgeTextSpan.textContent = statusText;
    badgeTextSpan.style.cssText = 'display:inline-block;position:relative;top:-5px;';
    badgeDiv.appendChild(badgeTextSpan);
    wrapperDiv.appendChild(badgeDiv);
    container.appendChild(wrapperDiv);
  }

  // Unofficial badge recreated from text to avoid html2canvas baseline drift.
  if (unofficialText) {
    const unofficialWrapper = doc.createElement('div');
    unofficialWrapper.style.cssText = 'position:absolute;bottom:8px;left:0;right:0;text-align:center;z-index:1300;pointer-events:none;';

    const innerBg = 'rgba(20,20,20,0.62)';
    const innerColor = '#f0f0f0';
    const innerDiv = doc.createElement('div');
    innerDiv.style.cssText = `display:inline-block;background:${innerBg};color:${innerColor};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:0 10px;height:22px;line-height:16px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);white-space:nowrap;`;

    const dot = doc.createElement('span');
    dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;margin-right:6px;vertical-align:middle;';

    const text = doc.createElement('span');
    text.textContent = unofficialText;
    // Move bottom badge text up by 1px for exported image alignment
    text.style.cssText = 'display:inline-block;vertical-align:middle;position:relative;top:-7px;';

    innerDiv.appendChild(dot);
    innerDiv.appendChild(text);
    unofficialWrapper.appendChild(innerDiv);
    container.appendChild(unofficialWrapper);
  }

  if (title) {
    const titleDiv = doc.createElement('div');
    const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
    const text = isDarkMode ? '#e4e4e4' : '#212529';
    titleDiv.style.cssText = `position:absolute;top:20px;left:20px;z-index:1000;background-color:${bg};color:${text};padding:10px 20px;border-radius:4px;font-weight:bold;font-size:18px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
    titleDiv.textContent = title;
    container.appendChild(titleDiv);
  }

  const footerDiv = doc.createElement('div');
  const bg = isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)';
  const text = isDarkMode ? '#e4e4e4' : '#212529';
  footerDiv.style.cssText = `position:absolute;bottom:20px;right:20px;z-index:1000;background-color:${bg};color:${text};padding:8px 12px;border-radius:4px;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.2);`;
  footerDiv.innerHTML = `Created with Graphical Forecast Creator | ${getFormattedDate()} | © OpenStreetMap contributors`;
  container.appendChild(footerDiv);
};

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
export const cloneLegendAndStatusOverlays = (sourceMap: L.Map, exportContainer: HTMLElement) => {
  const sourceContainer = sourceMap.getContainer();
  const sourceRoot = sourceContainer.closest('.map-container, .forecast-map-container') || sourceContainer;

  // Only clone the legend — status overlay is recreated fresh via addOverlays to avoid
  // html2canvas issues with CSS transforms and color inheritance on cloned elements.
  const legend = sourceRoot.querySelector('.map-legend');
  if (legend) {
    const clone = legend.cloneNode(true) as HTMLElement;
    clone.style.pointerEvents = 'none';
    exportContainer.appendChild(clone);
  }
};

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
const readStatusText = (root: HTMLElement): string =>
  root.querySelector('.gfc-status-badge')?.getAttribute('aria-label') ??
  root.querySelector('.gfc-status-badge')?.textContent?.trim() ??
  '';

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
const readUnofficialText = (root: HTMLElement): string =>
  root.querySelector('.unofficial-badge-inner')?.textContent?.trim() ??
  '';

// Helper: capture container to data URL
export const captureContainer = async (
  container: HTMLElement,
  width: number,
  height: number,
  format: ExportImageFormat,
  quality: number,
  onClone?: (clonedContainer: HTMLElement) => void
): Promise<string> => {
  const captureId = `gfc-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  container.setAttribute('data-gfc-export-capture-id', captureId);

  // Important: we must set useCORS: true and ensure all images in the cloned document have crossOrigin='anonymous'
  const canvas = await html2canvas(container, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: store.getState().theme.darkMode ? '#000000' : '#ffffff',
    scale: 2,
    imageTimeout: 8000,
    logging: false,
    width,
    height,
    onclone: (clonedDocument) => {
      const clonedContainer = clonedDocument.querySelector(`[data-gfc-export-capture-id="${captureId}"]`) as HTMLElement | null;
      if (clonedContainer) {
        // Ensure cloned container has explicit background matching current theme so dark tiles aren't lost
        clonedContainer.style.backgroundColor = store.getState().theme.darkMode ? '#000000' : '#ffffff';
        // Ensure cloned images request CORS so html2canvas can load external tiles
        Array.from(clonedContainer.querySelectorAll('img')).forEach((img) => {
          try { (img as HTMLImageElement).crossOrigin = 'anonymous'; } catch {
            // ignore errors but log to console for visibility
            console.warn('GFC export: Failed to set crossOrigin on cloned image; some tiles may not render in export.', img);
          }
        });
        // Copy any <defs> from SVGs in the source document into the cloned document so patterns/hatching render
        try {
          const srcDefs = Array.from(document.querySelectorAll('svg defs')) as Element[];
          if (srcDefs.length > 0) {
            let svgHolder = clonedDocument.querySelector('#gfc-export-svg-defs-holder') as Element | null;
            if (!svgHolder) {
              svgHolder = clonedDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svgHolder.setAttribute('id', 'gfc-export-svg-defs-holder');
              svgHolder.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
              clonedDocument.body.appendChild(svgHolder as unknown as HTMLElement);
            }
            srcDefs.forEach((d) => {
              try {
                const clonedDefs = d.cloneNode(true) as Node;
                if (svgHolder) {
                  svgHolder.appendChild(clonedDefs as unknown as Node);
                }
              } catch {
                // ignore cloning errors for defs, but log to console for visibility
                console.warn('GFC export: Failed to clone SVG defs for export; some patterns may not render correctly.', d);
              }
            });
          }
        } catch {
          // ignore errors but log to console for visibility
          console.warn('GFC export: Error occurred while cloning SVG defs for export; some patterns may not render correctly.');
        }

        if (onClone) {
          onClone(clonedContainer);
        }
      }
    }
  });

  container.removeAttribute('data-gfc-export-capture-id');

  if (format === 'jpeg') {
    return canvas.toDataURL('image/jpeg', quality);
  }

  return canvas.toDataURL('image/png');
};

// Helper: wait for Leaflet map to finish moving/zooming and tiles to load before capture, with a timeout fallback
const waitForMapSettle = (map: L.Map, timeout = 1200): Promise<void> => {
  return new Promise((resolve) => {
    let resolved = false;

    // We listen for 'moveend' which indicates the map has finished moving/zooming and should have triggered tile loading.
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    map.once('moveend', finish);
    setTimeout(finish, timeout);
  });
};

// For non-Leaflet maps, we can only wait for a fixed time and hope for the best,
// but for Leaflet maps we can listen for moveend to ensure tiles have loaded and map has settled before capture.
export const waitForMapSettleGeneric = async (map: unknown, timeout = 1200): Promise<void> => {
  if (isLeafletMap(map)) {
    await waitForMapSettle(map, timeout);
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    // Listen for a generic 'rendercomplete' event if available (e.g. OpenLayers),
    // but don't rely on it since it's not standard across all map libraries
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    if (map && typeof (map as L.Evented).once === 'function') {
      try {
        (map as L.Evented).once('rendercomplete', finish);
      } catch (err) {
        // Fallback
        console.warn('GFC export: Failed to attach rendercomplete listener to map; falling back to timeout. This may cause exports to capture before the map has fully rendered.', err);
      }
    }

    setTimeout(finish, timeout);
  });
};

// Wait for all images within the export root to finish loading, with a timeout fallback.
export const waitForImagesLoaded = (root: HTMLElement, timeout = 1200): Promise<{ timedOut: boolean; remaining: number }> => {
  return new Promise((resolve) => {
    try {
      const imgs = Array.from(root.querySelectorAll('img'));
      if (imgs.length === 0) {
        // no images to wait for; short delay to allow backgrounds to settle
        setTimeout(() => resolve({ timedOut: false, remaining: 0 }), 50);
        return;
      }

      let remaining = imgs.length;
      let resolved = false;

      // Listen for load/error events on each image to track when all have finished loading or errored,
      // and resolve accordingly. This helps ensure that all tiles/images are accounted for before capture,
      // even if they load after the initial map settle.
      const finishOne = () => {
        remaining = Math.max(0, remaining - 1);
        if (remaining === 0 && !resolved) {
          resolved = true;
          resolve({ timedOut: false, remaining: 0 });
        }
      };

      imgs.forEach((i) => {
        const img = i as HTMLImageElement;
        if (img.complete) {
          finishOne();
        } else {
          img.addEventListener('load', finishOne, { once: true });
          img.addEventListener('error', finishOne, { once: true });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ timedOut: true, remaining });
        }
      }, timeout);
    } catch (err) {
      setTimeout(() => resolve({ timedOut: true, remaining: -1 }), timeout);
      console.warn('GFC export: Error occurred while waiting for images to load; proceeding with export. This may cause some tiles/images to be missing in the export.', err);
    }
  });
};

// Helper: hide elements in the cloned export DOM that shouldn't appear in the export, based on selectors
export const hideElementsInClone = (root: HTMLElement, selectors: string[]) => {
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  });
};

// Main export function: handles both Leaflet and non-Leaflet maps,
// with best-effort approaches for each to ensure tiles and overlays are captured properly.
const exportLiveMapAsImage = async (
  map: ExportMapLike,
  options: ExportImageOptions
): Promise<string> => {
  const {
    title,
    format = 'png',
    quality = 0.92,
    includeLegendAndStatus = false
  } = options;

  const { exportRoot, width, height } = getExportRootAndSize(map);

  // Read overlays from live DOM before html2canvas clones/reflows styles
  const statusText = includeLegendAndStatus ? readStatusText(exportRoot) : '';
  const unofficialText = includeLegendAndStatus ? readUnofficialText(exportRoot) : '';

  await waitForMapSettleGeneric(map, 400);
  const imgResult = await waitForImagesLoaded(exportRoot, 1200);
  maybeShowTileTimeoutWarning(exportRoot, imgResult);

  return captureContainer(exportRoot, width, height, format, quality,
    buildCloneCallback(title, includeLegendAndStatus, statusText, unofficialText)
  );
};

// If the map is a Leaflet map, we can create a temporary offscreen map,
// replicate the view and layers, and render outlooks onto it before capture.
const addTempMapWarning = (container: HTMLElement) => {
  console.warn('GFC export: temp map tiles did not finish loading before capture; this may be due to a slow internet connection and could cause blank or incomplete export.');
  try {
    const warnDiv = document.createElement('div');
    warnDiv.style.cssText = 'position:absolute;top:12px;left:12px;z-index:2000;background:rgba(255,69,58,0.95);color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:600;pointer-events:none;';
    warnDiv.textContent = 'Warning: Map tiles timed out loading — export may be incomplete.';
    container.appendChild(warnDiv);
  } catch (err) {
    console.warn('GFC export: Failed to display warning about tile load timeout in temp map export.', err);
  }
};

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
const getSourceRoot = (map: L.Map): HTMLElement =>
  (map.getContainer().closest('.map-container, .forecast-map-container') as HTMLElement | null) || map.getContainer();

// Helper: prepare a temporary map and container for export
const prepareTempMapAndContainer = (map: L.Map): { tempContainer: HTMLDivElement; tempMap: L.Map; container: HTMLElement } => {
  const container = map.getContainer();
  const tempContainer = createTempContainer(container.clientWidth, container.clientHeight);
  const tempMap = createTempMap(tempContainer, map.getCenter(), map.getZoom(), map.options.crs || L.CRS.EPSG3857);
  tempMap.fitBounds(map.getBounds(), { animate: false, padding: [0, 0] });
  tempMap.invalidateSize({ animate: false });
  return { tempContainer, tempMap, container };
};

// Helper: cleanup temporary resources
const cleanupTempMapResources = (tempContainer: HTMLDivElement | null, tempMap: L.Map | null) => {
  try {
    if (tempContainer?.parentNode) document.body.removeChild(tempContainer);
  } catch (err) {
    console.warn('GFC export: Failed to remove temporary container.', tempContainer, err);
  }

  try {
    if (tempMap?.remove) tempMap.remove();
  } catch (err) {
    console.warn('GFC export: Failed to remove temporary map instance.', tempMap, err);
  }
};

// Helper: perform capture flow on the prepared temp map
const captureFromTempMap = async (
  tempContainer: HTMLDivElement,
  tempMap: L.Map,
  sourceMap: L.Map,
  outlooks: OutlookData,
  options: ExportImageOptions
): Promise<string> => {
  const { title, format = 'png', quality = 0.92, includeLegendAndStatus = false } = options;

  // Wait for map settle, add tiles, and render outlooks (returns tile wait result)
  const waitAndRender = async () => {
    await waitForMapSettle(tempMap);
    const tileResult = await addTilesAndWait(tempMap, sourceMap);
    renderOutlooksToMap(tempMap, outlooks);
    await new Promise((r) => setTimeout(r, 300));
    return tileResult;
  };

  // Prepare overlays (status, unofficial, legend) on the temp container
  const prepareOverlays = () => {
    const sourceRoot = getSourceRoot(sourceMap);
    const statusText = includeLegendAndStatus ? readStatusText(sourceRoot) : '';
    const unofficialText = includeLegendAndStatus ? readUnofficialText(sourceRoot) : '';
    if (includeLegendAndStatus) cloneLegendAndStatusOverlays(sourceMap, tempContainer);
    addOverlays(tempContainer, title, statusText || undefined, unofficialText || undefined);
  };

  const tileResult = await waitAndRender();

  if (tileResult?.timedOut && tileResult.remaining > 0) {
    addTempMapWarning(tempContainer);
  }

  prepareOverlays();

  return captureContainer(tempContainer, sourceMap.getContainer().clientWidth, sourceMap.getContainer().clientHeight, format, quality);
};


// If the map is not a Leaflet map,
// we fall back to cloning the existing DOM and hope for the best with tile loading and rendering,
// but we can still add overlays and hide controls for a cleaner export.
const exportViaTempMapAsImage = async (
  map: L.Map,
  outlooks: OutlookData,
  options: ExportImageOptions
): Promise<string> => {
  let tempContainer: HTMLDivElement | null = null;
  let tempMap: L.Map | null = null;

  try {
    const prepared = prepareTempMapAndContainer(map);
    tempContainer = prepared.tempContainer;
    tempMap = prepared.tempMap;
    return await captureFromTempMap(tempContainer, tempMap, map, outlooks, options);
  } finally {
    cleanupTempMapResources(tempContainer, tempMap);
  }
};

// Main export function: attempts live export first, and if it fails (e.g. not a Leaflet map), falls back to temp map approach
export const exportMapAsImage = async (
  map: unknown,
  outlooks: OutlookData,
  options: ExportImageOptions = {}
): Promise<string> => {
  try {
    const exportMap = map as ExportMapLike;
    return await exportLiveMapAsImage(exportMap, options);
  } catch (error) {
    if (!isLeafletMap(map)) {
      throw error;
    }

    return exportViaTempMapAsImage(map, outlooks, options);
  }
};

/**
 * Downloads a data URL as a file
 * @param dataUrl The data URL to download
 * @param filename The filename to save as
 */
export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

// Helper: determine export root and dimensions for a map-like object
export function getExportRootAndSize(map: ExportMapLike) {
  const mapContainer = getExportContainer(map);
  if (!mapContainer) {
    throw new Error('Map container not available for export.');
  }

  const exportRoot = (mapContainer.closest('.map-container, .forecast-map-container') as HTMLElement | null) || mapContainer;
  // OpenLayers renders into this viewport, while the export root also contains
  // map controls and status overlays. Capture using the viewport dimensions so
  // html2canvas does not extend the JPEG into unused wrapper space below the map.
  const viewport = mapContainer.querySelector<HTMLElement>('.ol-viewport');
  const width = viewport?.clientWidth || mapContainer.clientWidth;
  const height = viewport?.clientHeight || mapContainer.clientHeight;
  return { mapContainer, exportRoot, width, height };
}

// Helper: show the existing timeout warning banner when images timed out
export function maybeShowTileTimeoutWarning(exportRoot: HTMLElement, imgResult?: { timedOut: boolean; remaining: number } | null) {
  if (imgResult?.timedOut && imgResult.remaining > 0) {
    console.warn('GFC export: Some map tiles/images did not finish loading before capture; this is usually caused by a slow internet connection. Export may be incomplete.');
    try {
      const warningBanner = document.createElement('div');
      warningBanner.setAttribute('data-gfc-export-warning', '1');
      warningBanner.style.cssText = 'position:absolute;top:12px;left:12px;z-index:1600;background:rgba(255,69,58,0.95);color:#fff;padding:8px 12px;border-radius:6px;font-weight:600;font-size:12px;pointer-events:none;';
      warningBanner.textContent = 'Warning: Map tiles timed out loading — check your internet connection. Export may be incomplete.';
      exportRoot.appendChild(warningBanner);
      setTimeout(() => { try { warningBanner.remove(); } catch {
        console.warn('GFC export: Failed to remove on-screen warning about tile load timeout.', warningBanner);
      } }, 6000);
    } catch {
      console.warn('GFC export: Failed to display on-screen warning about tile load timeout.', exportRoot);
    }
  }
}

// Helper: build the clone callback to hide controls and add overlays (reduces branching in main function)
export function buildCloneCallback(title?: string, includeLegendAndStatus = false, statusText?: string, unofficialText?: string) {
  return function (clonedRoot: HTMLElement) {
    hideElementsInClone(clonedRoot, [
      '.leaflet-control-container',
      '.ol-control',
      '.map-toolbar-bottom-right',
      // Hide original overlays; recreated below with export-safe styles.
      '.gfc-status-overlay',
      '.unofficial-badge',
    ]);

    if (!includeLegendAndStatus) {
      hideElementsInClone(clonedRoot, ['.map-legend']);
    }

    addOverlays(clonedRoot, title, statusText || undefined, unofficialText || undefined);
  };
}
