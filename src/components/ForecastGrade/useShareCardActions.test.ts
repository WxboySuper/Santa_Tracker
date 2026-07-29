import { renderHook, act } from '@testing-library/react';
import { useShareCardActions } from './useShareCardActions';
import { composeShareCard } from './shareCard';
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

const fakeCanvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 630;
  jest.spyOn(c, 'toDataURL').mockReturnValue('data:image/png;base64,mock');
  jest.spyOn(c, 'toBlob').mockImplementation((cb) => {
    cb?.(new Blob(['mock'], { type: 'image/png' }));
  });
  return c;
};

const addToast = jest.fn();
const captureMap = jest.fn().mockResolvedValue(null);

type NavOverrides = {
  share?: jest.Mock;
  canShare?: jest.Mock;
  clipboard?: object;
};

const render = (nav?: NavOverrides) => {
  if (nav?.share !== undefined) {
    Object.defineProperty(navigator, 'share', { value: nav.share, writable: true, configurable: true });
  }
  if (nav?.canShare !== undefined) {
    Object.defineProperty(navigator, 'canShare', { value: nav.canShare, writable: true, configurable: true });
  }
  if (nav?.clipboard !== undefined) {
    Object.defineProperty(navigator, 'clipboard', { value: nav.clipboard, writable: true, configurable: true });
  }
  return renderHook(() => useShareCardActions(pkg, captureMap, addToast));
};

describe('useShareCardActions', () => {
  let origShare: typeof navigator.share;
  let origCanShare: typeof navigator.canShare;
  let origClipboard: typeof navigator.clipboard;
  let origUA: typeof navigator.userActivation;

  beforeEach(() => {
    jest.clearAllMocks();
    captureMap.mockResolvedValue(null);
    origShare = navigator.share;
    origCanShare = navigator.canShare;
    origClipboard = navigator.clipboard;
    origUA = navigator.userActivation;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: origShare, writable: true, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: origCanShare, writable: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: origClipboard, writable: true, configurable: true });
    Object.defineProperty(navigator, 'userActivation', { value: origUA, writable: true, configurable: true });
  });

  describe('handleDownload', () => {
    test('downloads the composed canvas as PNG', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const { result } = render();
      await act(async () => { await result.current.handleDownload(); });
      expect(captureMap).toHaveBeenCalled();
      expect(mockDownloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,mock', 'forecast-grade-2026-05-01.png');
    });

    test('shows error toast when canvas composition fails', async () => {
      mockComposeShareCard.mockReturnValue(null);
      const { result } = render();
      await act(async () => { await result.current.handleDownload(); });
      expect(addToast).toHaveBeenCalledWith('Could not compose the share card.', 'error');
      expect(mockDownloadDataUrl).not.toHaveBeenCalled();
    });

    test('resets busy state', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const { result } = render();
      expect(result.current.busy).toBe(false);
      await act(async () => { await result.current.handleDownload(); });
      expect(result.current.busy).toBe(false);
    });
  });

  describe('handleShare', () => {
    test('shares via native share API with image file', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const mockShare = jest.fn().mockResolvedValue(undefined);
      const { result } = render({ share: mockShare, canShare: jest.fn().mockReturnValue(true) });
      await act(async () => { await result.current.handleShare(); });
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Forecast Grade 82.4') }));
    });

    test('falls back to text share when file share is unsupported', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const mockShare = jest.fn().mockResolvedValue(undefined);
      const { result } = render({ share: mockShare, canShare: jest.fn().mockImplementation((d) => d && 'text' in d) });
      await act(async () => { await result.current.handleShare(); });
      expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Forecast Grade 82.4') }));
    });

    test('shows toast when sharing is completely unavailable', async () => {
      mockComposeShareCard.mockReturnValue(null);
      Reflect.deleteProperty(navigator, 'share');
      const { result } = render();
      await act(async () => { await result.current.handleShare(); });
      expect(addToast).toHaveBeenCalledWith('Sharing is unavailable; try download.', 'info');
    });

    test('suppresses AbortError from share', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const mockShare = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
      const { result } = render({ share: mockShare, canShare: jest.fn().mockReturnValue(true) });
      await act(async () => { await result.current.handleShare(); });
      expect(addToast).not.toHaveBeenCalled();
    });

    test('reports non-AbortError share failures', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      const mockShare = jest.fn().mockRejectedValue(new Error('Not supported'));
      const { result } = render({ share: mockShare, canShare: jest.fn().mockReturnValue(true) });
      await act(async () => { await result.current.handleShare(); });
      expect(addToast).toHaveBeenCalledWith('An action failed; try download.', 'error');
    });

    test('resets busy state after share', async () => {
      mockComposeShareCard.mockReturnValue(null);
      Reflect.deleteProperty(navigator, 'share');
      const { result } = render();
      expect(result.current.busy).toBe(false);
      await act(async () => { await result.current.handleShare(); });
      expect(result.current.busy).toBe(false);
    });
  });

  describe('handleCopy', () => {
    test('falls back to text when clipboard image write is unsupported', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      // Simulate a browser that has clipboard but rejects image writes
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      const clipObj = { writeText: mockWriteText };
      Object.defineProperty(navigator, 'clipboard', { value: clipObj, writable: true, configurable: true });
      const { result } = render();
      await act(async () => { await result.current.handleCopy(); });
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('Forecast Grade 82.4'));
    });

    test('shows toast when clipboard is unavailable', async () => {
      mockComposeShareCard.mockReturnValue(fakeCanvas());
      Object.defineProperty(navigator, 'clipboard', { value: undefined, writable: true, configurable: true });
      const { result } = render();
      await act(async () => { await result.current.handleCopy(); });
      expect(addToast).toHaveBeenCalledWith('Copy is not supported here; try download.', 'info');
    });

    test('resets busy state after copy', async () => {
      mockComposeShareCard.mockReturnValue(null);
      const { result } = render({ clipboard: undefined });
      expect(result.current.busy).toBe(false);
      await act(async () => { await result.current.handleCopy(); });
      expect(result.current.busy).toBe(false);
    });
  });
});
