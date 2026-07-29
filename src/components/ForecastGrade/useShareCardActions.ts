import { useCallback, useState } from 'react';
import type { PackageGrade } from '../../utils/verificationV2';
import { downloadDataUrl } from '../../utils/exportUtils';
import { composeShareCard, shareCardFilename, shareSummaryText } from './shareCard';

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } else {
      resolve(null);
    }
  });

type ToastFn = (message: string, type?: 'info' | 'success' | 'error') => void;

const buildShareCard = async (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>
): Promise<{ canvas: HTMLCanvasElement; blob: Blob | null } | null> => {
  const mapImage = await captureMap();
  const canvas = composeShareCard(pkg, mapImage);
  if (!canvas) return null;
  return { canvas, blob: await canvasToBlob(canvas) };
};

const shareWithImage = async (
  blob: Blob,
  pkg: PackageGrade,
  nav: Navigator & { canShare?: (data?: ShareData) => boolean },
  summary: string
): Promise<boolean> => {
  if (!nav.share) return false;
  const file = new File([blob], shareCardFilename(pkg), { type: 'image/png' });
  if (!nav.canShare?.({ files: [file] })) return false;
  await nav.share({ files: [file], text: summary });
  return true;
};

const shareWithText = async (
  nav: Navigator & { canShare?: (data?: ShareData) => boolean },
  summary: string,
  addToast: ToastFn
): Promise<boolean> => {
  if (!nav.share || !nav.canShare?.({ text: summary })) return false;
  await nav.share({ text: summary });
  addToast('Shared grade summary; download the image card if needed.', 'info');
  return true;
};

const copyImageToClipboard = async (
  blob: Blob,
  clip: Clipboard,
  activationLive: boolean
): Promise<boolean> => {
  if (!activationLive) return false;
  if (!blob) return false;
  if (typeof ClipboardItem === 'undefined') return false;
  if (!clip.write) return false;
  try {
    await clip.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
};

const download = async (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: ToastFn
) => {
  const result = await buildShareCard(pkg, captureMap);
  if (!result) {
    addToast('Could not compose the share card.', 'error');
    return;
  }
  downloadDataUrl(result.canvas.toDataURL('image/png'), shareCardFilename(pkg));
};

const share = async (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: ToastFn
) => {
  const result = await buildShareCard(pkg, captureMap);
  if (!result || !result.blob) {
    addToast('Sharing is unavailable; try download.', 'info');
    return;
  }
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  const summary = shareSummaryText(pkg);
  const activationLive = !navigator.userActivation || navigator.userActivation.isActive;

  if (activationLive && (await shareWithImage(result.blob, pkg, nav, summary))) return;
  if (await shareWithText(nav, summary, addToast)) return;

  addToast('Sharing is unavailable; try download.', 'info');
};

const copy = async (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: ToastFn
) => {
  const result = await buildShareCard(pkg, captureMap);
  const clip = navigator.clipboard;
  if (!clip) {
    addToast('Copy is not supported here; try download.', 'info');
    return;
  }
  const activationLive = !navigator.userActivation || navigator.userActivation.isActive;
  if (result?.blob && (await copyImageToClipboard(result.blob, clip, activationLive))) {
    addToast('Share card copied to clipboard.', 'success');
    return;
  }
  if (clip.writeText) {
    await clip.writeText(shareSummaryText(pkg));
    addToast('Grade summary copied to clipboard.', 'success');
  } else {
    addToast('Copy is not supported here; try download.', 'info');
  }
};

const withBusy = async (
  setBusy: (v: boolean) => void,
  fn: () => Promise<void>,
  addToast: ToastFn
) => {
  setBusy(true);
  try {
    await fn();
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      addToast('An action failed; try download.', 'error');
    }
  } finally {
    setBusy(false);
  }
};

export const useShareCardActions = (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: ToastFn
) => {
  const [busy, setBusy] = useState(false);

  const handleDownload = useCallback(
    () => withBusy(setBusy, () => download(pkg, captureMap, addToast), addToast),
    [addToast, captureMap, pkg]
  );

  const handleShare = useCallback(
    () => withBusy(setBusy, () => share(pkg, captureMap, addToast), addToast),
    [addToast, captureMap, pkg]
  );

  const handleCopy = useCallback(
    () => withBusy(setBusy, () => copy(pkg, captureMap, addToast), addToast),
    [addToast, captureMap, pkg]
  );

  return { busy, handleDownload, handleShare, handleCopy };
};
