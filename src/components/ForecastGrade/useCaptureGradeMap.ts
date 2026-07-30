import { useCallback, type RefObject } from 'react';
import type { VerificationMapHandle } from '../Map/VerificationMap';

export const useCaptureGradeMap = (mapRef: RefObject<VerificationMapHandle>) =>
  useCallback(async (): Promise<HTMLImageElement | null> => {
    const mapElement = mapRef.current?.getMap()?.getTargetElement() as HTMLElement | undefined;
    if (!mapElement) {
      return null;
    }
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(mapElement, { useCORS: true, logging: false });
      const image = new Image();
      image.src = canvas.toDataURL('image/png');
      if (image.decode) {
        await image.decode().catch(() => undefined);
      }
      return image;
    } catch {
      return null;
    }
  }, [mapRef]);
