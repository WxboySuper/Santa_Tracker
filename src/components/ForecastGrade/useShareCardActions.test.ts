import { renderHook, act } from '@testing-library/react';
import { useShareCardActions } from './useShareCardActions';
import { composeShareCard, shareCardFilename } from './shareCard';
import { downloadDataUrl } from '../../utils/exportUtils';
import type { PackageGrade } from '../../utils/verificationV2';

jest.mock('./shareCard', () => ({
  ...jest.requireActual('./shareCard'),
  composeShareCard: jest.fn(),
}));

jest.mock('../../utils/exportUtils', () => ({
  downloadDataUrl: jest.fn(),
}));

const mockComposeShareCard = composeShareCard as jest.MockedFunction<typeof composeShareCard>;
const mockDownloadDataUrl = downloadDataUrl as jest.MockedFunction<typeof downloadDataUrl>;

const pkg: PackageGrade = {
  formulaVersion: 'gfc-ver-1',
  grade: 82.4,
  letter: 'B',
  products: [],
  dataQuality: 'Good',
  dataQualityReason: 'Forecast and reports available.',
  hasReports: true,
  generatedAt: '2026-05-01T12:00:00.000Z',
};

const mockCanvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 630;
  jest.spyOn(c, 'toDataURL').mockReturnValue('data:image/png;base64,mock');
  jest.spyOn(c, 'toBlob').mockImplementation((cb) => {
    cb?.(new Blob(['mock'], { type: 'image/png' }));
  });
  return c;
};

describe('useShareCardActions', () => {
  const addToast = jest.fn();
  const captureMap = jest.fn().mockResolvedValue(null);

  let originalShare: typeof navigator.share | undefined;
  let originalCanShare: typeof navigator.canShare | undefined;
  let originalClipboard: typeof navigator.clipboard;
  let originalUserActivation: typeof navigator.userActivation;

  beforeEach(() => {
    jest.clearAllMocks();
    mockComposeShareCard.mockReturnValue(mockCanvas());
    originalShare = navigator.share;
    originalCanShare = navigator.canShare;
    originalClipboard = navigator.clipboard;
    originalUserActivation = navigator.userActivation;
  });

  afterEach(() => {
    if (originalShare !== undefined) {
      Object.defineProperty(navigator, 'share', { value: originalShare, writable: true, configurable: true });
    } else {
      Reflect.deleteProperty(navigator, 'share');
    }
    if (originalCanShare !== undefined) {
      Object.defineProperty(navigator, 'canShare', { value: originalCanShare, writable: true, configurable: true });
    } else {
      Reflect.deleteProperty(navigator, 'canShare');
    }
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true, configurable: true });
    if (originalUserActivation !== undefined) {
      Object.defineProperty(navigator, 'userActivation', { value: originalUserActivation, writable: true, configurable: true });
    }
  });

  describe('handleDownload', () => {
    test('downloads the composed canvas as PNG', async () => {
      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleDownload();
      });

      expect(captureMap).toHaveBeenCalled();
      expect(mockComposeShareCard).toHaveBeenCalledWith(pkg, null);
      expect(mockDownloadDataUrl).toHaveBeenCalledWith(
        'data:image/png;base64,mock',
        'forecast-grade-2026-05-01.png'
      );
      expect(addToast).not.toHaveBeenCalled();
    });

    test('shows error toast when canvas composition fails', async () => {
      mockComposeShareCard.mockReturnValue(null);
      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleDownload();
      });

      expect(addToast).toHaveBeenCalledWith('Could not compose the share card.', 'error');
      expect(mockDownloadDataUrl).not.toHaveBeenCalled();
    });

    test('resets busy state on success', async () => {
      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      expect(result.current.busy).toBe(false);
      await act(async () => {
        await result.current.handleDownload();
      });
      expect(result.current.busy).toBe(false);
    });
  });

  describe('handleShare', () => {
    test('shares via native share API with image file', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const mockShare = jest.fn().mockResolvedValue(undefined);
      const mockCanShare = jest.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: mockCanShare, writable: true, configurable: true });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Forecast Grade 82.4'),
        })
      );
    });

    test('falls back to text share when file share is unsupported', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const mockShare = jest.fn().mockResolvedValue(undefined);
      const mockCanShare = jest.fn().mockImplementation((data) => {
        return data && 'text' in data;
      });
      Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: mockCanShare, writable: true, configurable: true });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Forecast Grade 82.4'),
        })
      );
    });

    test('shows toast when sharing is completely unavailable', async () => {
      mockComposeShareCard.mockReturnValue(null);
      Reflect.deleteProperty(navigator, 'share');

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(addToast).toHaveBeenCalledWith('Sharing is unavailable; try download.', 'info');
    });

    test('suppresses AbortError from share', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const abortError = new DOMException('User cancelled', 'AbortError');
      const mockShare = jest.fn().mockRejectedValue(abortError);
      const mockCanShare = jest.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: mockCanShare, writable: true, configurable: true });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(addToast).not.toHaveBeenCalled();
    });

    test('reports non-AbortError share failures', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const mockShare = jest.fn().mockRejectedValue(new Error('Not supported'));
      const mockCanShare = jest.fn().mockReturnValue(true);
      Object.defineProperty(navigator, 'share', { value: mockShare, writable: true, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: mockCanShare, writable: true, configurable: true });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleShare();
      });

      expect(addToast).toHaveBeenCalledWith('Share failed; try download.', 'error');
    });

    test('resets busy state after share', async () => {
      mockComposeShareCard.mockReturnValue(null);
      Reflect.deleteProperty(navigator, 'share');
      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      expect(result.current.busy).toBe(false);
      await act(async () => {
        await result.current.handleShare();
      });
      expect(result.current.busy).toBe(false);
    });
  });

  describe('handleCopy', () => {
    test('copies image to clipboard when supported', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const mockWrite = jest.fn().mockResolvedValue(undefined);
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite, writeText: mockWriteText },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'ClipboardItem', {
        value: function (data: Record<string, Blob>) { return data; },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleCopy();
      });

      expect(mockWrite).toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith('Share card copied to clipboard.', 'success');
    });

    test('falls back to text when image clipboard fails', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());

      const mockWrite = jest.fn().mockRejectedValue(new Error('Image not supported'));
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite, writeText: mockWriteText },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'ClipboardItem', {
        value: function (data: Record<string, Blob>) { return data; },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleCopy();
      });

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Forecast Grade 82.4')
      );
      expect(addToast).toHaveBeenCalledWith('Grade summary copied to clipboard.', 'success');
    });

    test('shows toast when clipboard is unavailable', async () => {
      mockComposeShareCard.mockReturnValue(mockCanvas());
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      await act(async () => {
        await result.current.handleCopy();
      });

      expect(addToast).toHaveBeenCalledWith('Copy is not supported here; try download.', 'info');
    });

    test('resets busy state after copy', async () => {
      mockComposeShareCard.mockReturnValue(null);
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useShareCardActions(pkg, captureMap, addToast));

      expect(result.current.busy).toBe(false);
      await act(async () => {
        await result.current.handleCopy();
      });
      expect(result.current.busy).toBe(false);
    });
  });
});
