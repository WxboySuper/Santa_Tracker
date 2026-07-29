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

const tryShareImage = async (
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

const tryShareText = async (
  nav: Navigator & { canShare?: (data?: ShareData) => boolean },
  summary: string,
  addToast: ToastFn
): Promise<boolean> => {
  if (!nav.share || !nav.canShare?.({ text: summary })) return false;
  await nav.share({ text: summary });
  addToast('Shared grade summary; download the image card if needed.', 'info');
  return true;
};

const tryCopyImage = async (
  blob: Blob,
  clip: Clipboard,
  activationLive: boolean
): Promise<boolean> => {
  if (!activationLive || !blob || typeof ClipboardItem === 'undefined' || !clip.write) return false;
  try {
    await clip.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
};

export const useShareCardActions = (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: ToastFn
) => {
  const [busy, setBusy] = useState(false);

  const build = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const mapImage = await captureMap();
    return composeShareCard(pkg, mapImage);
  }, [captureMap, pkg]);

  const handleDownload = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      if (!canvas) {
        addToast('Could not compose the share card.', 'error');
        return;
      }
      downloadDataUrl(canvas.toDataURL('image/png'), shareCardFilename(pkg));
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  const handleShare = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      const blob = canvas ? await canvasToBlob(canvas) : null;
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      const summary = shareSummaryText(pkg);
      const activationLive = !navigator.userActivation || navigator.userActivation.isActive;

      if (blob && activationLive && (await tryShareImage(blob, pkg, nav, summary))) return;
      if (await tryShareText(nav, summary, addToast)) return;

      addToast('Sharing is unavailable; try download.', 'info');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        addToast('Share failed; try download.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  const handleCopy = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      const blob = canvas ? await canvasToBlob(canvas) : null;
      const clip = navigator.clipboard;
      if (!clip) {
        addToast('Copy is not supported here; try download.', 'info');
        return;
      }
      const activationLive = !navigator.userActivation || navigator.userActivation.isActive;
      if (await tryCopyImage(blob!, clip, activationLive)) {
        addToast('Share card copied to clipboard.', 'success');
        return;
      }
      if (clip.writeText) {
        await clip.writeText(shareSummaryText(pkg));
        addToast('Grade summary copied to clipboard.', 'success');
      } else {
        addToast('Copy is not supported here; try download.', 'info');
      }
    } catch {
      addToast('Copy failed; try download.', 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  return { busy, handleDownload, handleShare, handleCopy };
};
