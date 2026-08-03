import { createFileHandlers } from './useFileLoader';
import { waitFor } from '@testing-library/react';
import { deserializeForecast, exportForecastToJson, readForecastImportFile, validateForecastData } from '../utils/fileUtils';

jest.mock('../utils/fileUtils', () => ({
  deserializeForecast: jest.fn(),
  exportForecastToJson: jest.fn(),
  readForecastImportFile: jest.fn(),
  validateForecastData: jest.fn(),
}));

const mockValidateForecastData = validateForecastData as jest.MockedFunction<typeof validateForecastData>;
const mockDeserializeForecast = deserializeForecast as jest.MockedFunction<typeof deserializeForecast>;
const mockExportForecastToJson = exportForecastToJson as jest.MockedFunction<typeof exportForecastToJson>;
const mockReadForecastImportFile = readForecastImportFile as jest.MockedFunction<typeof readForecastImportFile>;

describe('createFileHandlers', () => {
  const forecastCycle = { id: 'cycle-1' };
  let addToast: jest.Mock;
  let dispatch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    addToast = jest.fn();
    dispatch = jest.fn();
    mockValidateForecastData.mockReturnValue(true);
    mockDeserializeForecast.mockReturnValue({ id: 'loaded-cycle' } as never);
    mockReadForecastImportFile.mockImplementation(async (file) => JSON.parse(await file.text()) as unknown);
  });

  const createTextFile = (text: string, shouldReject = false): File => ({
    name: 'forecast.json',
    text: shouldReject ? jest.fn().mockRejectedValue(new Error('read failed')) : jest.fn().mockResolvedValue(text),
  } as unknown as File);

  it('loads valid forecast JSON and dispatches the imported cycle', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never });
    const file = createTextFile(JSON.stringify({ version: 1 }));

    await handlers.handleLoad(file);

    expect(mockValidateForecastData).toHaveBeenCalledWith({ version: 1 });
    expect(mockDeserializeForecast).toHaveBeenCalledWith({ version: 1 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forecast/importForecastCycle',
      payload: { id: 'loaded-cycle' },
    }));
    expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success');
  });

  it('reports invalid JSON, invalid forecast data, and read errors', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never });

    await handlers.handleLoad(createTextFile('{nope'));
    expect(addToast).toHaveBeenLastCalledWith('File is not valid JSON.', 'error');

    mockValidateForecastData.mockReturnValue(false);
    await handlers.handleLoad(createTextFile('{}'));
    expect(addToast).toHaveBeenLastCalledWith('Invalid forecast data format.', 'error');

    await handlers.handleLoad(createTextFile('', true));
    expect(addToast).toHaveBeenLastCalledWith('Error reading file.', 'error');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('handles file input selection and resets the input', async () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never });
    const input = document.createElement('input');
    const file = createTextFile('{}');
    Object.defineProperty(input, 'files', { value: [file] });

    handlers.handleFileSelect({ target: input, currentTarget: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    await Promise.resolve();

    expect(input.value).toBe('');
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Forecast loaded successfully!', 'success'));
  });

  it('opens the hidden file picker when available', () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never });
    const click = jest.fn();
    handlers.fileInputRef.current = { click } as unknown as HTMLInputElement;

    handlers.handleOpenFilePicker();

    expect(click).toHaveBeenCalled();
  });

  it('exports the current cycle and reports export failures', () => {
    const handlers = createFileHandlers({ addToast, dispatch, forecastCycle: forecastCycle as never });

    handlers.handleSave();

    expect(mockExportForecastToJson).toHaveBeenCalledWith(forecastCycle, {
      center: [39.8283, -98.5795],
      zoom: 4,
    }, undefined);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'forecast/markAsSaved' }));
    expect(addToast).toHaveBeenCalledWith('Forecast exported to JSON!', 'success');

    mockExportForecastToJson.mockImplementationOnce(() => {
      throw new Error('download failed');
    });
    handlers.handleSave();
    expect(addToast).toHaveBeenLastCalledWith('Error exporting forecast.', 'error');
  });
});
