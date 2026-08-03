import { useState, useCallback } from 'react';
import { exportMapAsImage, downloadDataUrl, getFormattedDate } from '../../utils/exportUtils';
import { OutlookData } from '../../types/outlooks';
import { ForecastMapHandle } from '../Map/ForecastMap';
import type React from 'react';
import type { MapAdapterHandle } from '../../maps/contracts';

interface UseExportMapParams {
  mapRef: React.RefObject<ForecastMapHandle | null>;
  outlooks: OutlookData;
  isExportDisabled: boolean;
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * Perform the actual export (generate image, download, and toast result).
 * Extracted to reduce complexity inside the hook and keep side-effects isolated.
 */
async function performExport(
  map: unknown,
  outlooks: OutlookData,
  title: string | undefined,
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<void> {
  try {
    const dataUrl = await exportMapAsImage(map, outlooks, {
      title: title || undefined,
      format: 'jpeg',
      quality: 0.92,
      includeLegendAndStatus: true
    });

    const filename = `forecast-outlook-${getFormattedDate()}.jpg`;
    downloadDataUrl(dataUrl, filename);
    addToast('Forecast exported successfully!', 'success');
  } catch (err) {
    addToast('Failed to export the map. Please try again.', 'error');
    throw err;
  }
}

/**
 * Validate common preconditions for running an export. Shows user-facing toasts
 * when a precondition fails. Kept as a top-level function to reduce hook complexity
 * and keep branching out of the hook body for easier testing.
 */
const validateExportPreconditions = (
  current: MapAdapterHandle<unknown> | null,
  isExportDisabled: boolean,
  addToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): boolean => {
  if (isExportDisabled) {
    addToast('The export feature is currently unavailable due to an issue. Please check back later or visit the GitHub repository for more information.', 'warning');
    return false;
  }

  if (!current) {
    addToast('Map reference not available. Cannot export.', 'error');
    return false;
  }

  const map = current.getMap();
  if (!map) {
    addToast('Map not fully loaded. Please try again.', 'error');
    return false;
  }

  return true;
};

/**
 * Hook to manage map export actions (open modal, generate image, download).
 *
 * @param param0 - mapRef, outlooks, isExportDisabled, addToast
 * @returns { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport }
 */
export const useExportMap = ({ mapRef, outlooks, isExportDisabled, addToast }: UseExportMapParams) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const initiateExport = useCallback(() => {
    if (!validateExportPreconditions(mapRef.current, isExportDisabled, addToast)) return;
    // Open modal to get title
    setIsModalOpen(true);
  }, [mapRef, isExportDisabled, addToast]);

  const confirmExport = useCallback(async (title: string) => {
    setIsModalOpen(false); // Close modal

    const current = mapRef.current;
    if (!validateExportPreconditions(current, isExportDisabled, addToast)) return;
    if (!current) return;

    const map = current.getMap();
    if (!map) return;

    try {
      setIsExporting(true);
      await performExport(map, outlooks, title || undefined, addToast);
    } catch {
      // performExport already handles user-facing error toasts
    } finally {
      setIsExporting(false);
    }
  }, [mapRef, isExportDisabled, outlooks, addToast]);

  const cancelExport = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return { isExporting, isModalOpen, initiateExport, confirmExport, cancelExport };
};
