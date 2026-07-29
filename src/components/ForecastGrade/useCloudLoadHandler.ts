import { useCallback, type MutableRefObject } from 'react';
import type { useAppLayout } from '../Layout/AppLayout';
import type { useCloudCycles } from '../../hooks/useCloudCycles';
import { deserializeForecast } from '../../utils/fileUtils';
import type { useForecastGrade } from './useForecastGrade';

type AddToast = ReturnType<typeof useAppLayout>['addToast'];
type Grade = ReturnType<typeof useForecastGrade>;
type LoadCycle = ReturnType<typeof useCloudCycles>['loadCycle'];

/**
 * Returns a stable callback that loads a cloud package into the grade state,
 * guarding against stale loads via the shared sequence ref.
 */
export const useCloudLoadHandler = (
  packageLoadSeqRef: MutableRefObject<number>,
  addToast: AddToast,
  grade: Grade,
  loadCycle: LoadCycle,
) =>
  useCallback(
    async (id: string, label: string) => {
      const loadSeq = ++packageLoadSeqRef.current;
      const payload = await loadCycle(id);
      if (loadSeq !== packageLoadSeqRef.current) {
        return;
      }
      if (!payload) {
        addToast('That cloud package could not be loaded.', 'error');
        return;
      }
      try {
        grade.setForecastPackage(deserializeForecast(payload), 'cloud', `${label} (cloud)`);
        addToast('Cloud package loaded. Choose a report date and grade.', 'success');
      } catch {
        addToast('That cloud package could not be parsed.', 'error');
      }
    },
    [addToast, grade, loadCycle, packageLoadSeqRef],
  );
