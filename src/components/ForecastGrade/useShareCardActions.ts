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

export const useShareCardActions = (
  pkg: PackageGrade,
  captureMap: () => Promise<HTMLImageElement | null>,
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void
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

      if (blob && activationLive && nav.share) {
        const file = new File([blob], shareCardFilename(pkg), { type: 'image/png' });
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], text: summary });
          return;
        }
      }

      if (nav.share && nav.canShare?.({ text: summary })) {
        await nav.share({ text: summary });
        addToast('Shared grade summary; download the image card if needed.', 'info');
        return;
      }

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
      if (activationLive && blob && typeof ClipboardItem !== 'undefined' && clip.write) {
        try {
          await clip.write([new ClipboardItem({ 'image/png': blob })]);
          addToast('Share card copied to clipboard.', 'success');
          return;
        } catch {
          // Fall back to text when image clipboard is unsupported.
        }
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
