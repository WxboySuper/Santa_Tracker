import { exportForecastToJson, deserializeForecast, readForecastImportFile, validateForecastData } from '../utils/fileUtils';
import { isWorkflowExportPackage } from '../utils/workflowPackage';
import {
  markAsSaved,
  importForecastCycle,
  setWorkflowMetadata,
  clearWorkflowMetadata,
} from '../store/forecastSlice';
import type { AddToastFn } from '../components/Layout';
import type { Dispatch } from 'redux';
import type { CycleMetadata, ForecastCycle } from '../types/outlooks';

/** Creates save and load file handler functions bound to the given toast notifier, Redux dispatch, and current forecast state. */
export function createFileHandlers({ addToast, dispatch, forecastCycle, cycleMetadata }: {
  addToast: AddToastFn;
  dispatch: Dispatch;
  forecastCycle: ForecastCycle;
  cycleMetadata?: CycleMetadata;
}) {
  const fileInputRef = { current: null as HTMLInputElement | null } as React.MutableRefObject<HTMLInputElement | null>;

  /** Reads a File object, validates the JSON content, deserializes it, and imports it as the active forecast cycle. */
  const handleLoad = async (file: File) => {
    try {
      let data: unknown;
      try {
        data = await readForecastImportFile(file);
      } catch (error) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          addToast('File is not a valid GFC package.', 'error');
        } else if (error instanceof SyntaxError) {
          addToast('File is not valid JSON.', 'error');
        } else {
          addToast('Error reading file.', 'error');
        }
        return;
      }

      if (!validateForecastData(data)) {
        addToast('Invalid forecast data format.', 'error');
        return;
      }

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      const packageMetadata = isWorkflowExportPackage(data) ? data.metadata : data.cycleMetadata;
      if (packageMetadata) {
        dispatch(setWorkflowMetadata(packageMetadata));
      } else if (data.cycleMetadata === null) {
        dispatch(clearWorkflowMetadata());
      }
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  };

  /** Handles file input change events: passes the selected file to handleLoad and resets the input value. */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoad(file).catch(() => undefined);
    }
    e.currentTarget.value = '';
  };

  /** Triggers the hidden file input element to open the OS file picker dialog. */
  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  /** Serializes the current forecast cycle to a JSON file and downloads it, then marks the store as saved. */
  const handleSave = () => {
    try {
      exportForecastToJson(
        forecastCycle,
        {
          center: [39.8283, -98.5795],
          zoom: 4,
        },
        cycleMetadata,
      );
      dispatch(markAsSaved());
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  };

  return {
    fileInputRef,
    handleLoad,
    handleFileSelect,
    handleOpenFilePicker,
    handleSave,
  };
}
