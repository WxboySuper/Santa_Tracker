import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { setVisibility } from '../../store/stormReportsSlice';
import type { StormReport } from '../../types/stormReports';
import type { GradeCard } from '../../types/forecastGrade';
import type { ComponentKey, MapOutlookLayer, ProductKind } from '../../utils/verificationV2';
import { useCloudLoadHandler } from './useCloudLoadHandler';
import type { useAppLayout } from '../Layout/AppLayout';
import type { useForecastGrade } from './useForecastGrade';

type GradeController = ReturnType<typeof useForecastGrade>;
type Toast = ReturnType<typeof useAppLayout>['addToast'];

interface UseForecastGradeDashboardActionsArgs {
  addToast: Toast;
  grade: GradeController;
  loadCycle: ReturnType<typeof import('../../hooks/useCloudCycles').useCloudCycles>['loadCycle'];
  packageLoadSeqRef: React.MutableRefObject<number>;
  reportsVisible: boolean;
  setActiveComponent: React.Dispatch<React.SetStateAction<ComponentKey | null>>;
  setSelectedReportId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useForecastGradeDashboardActions = ({
  addToast,
  grade,
  loadCycle,
  packageLoadSeqRef,
  reportsVisible,
  setActiveComponent,
  setSelectedReportId,
}: UseForecastGradeDashboardActionsArgs) => {
  const dispatch = useDispatch();
  const handleCloudLoad = useCloudLoadHandler(packageLoadSeqRef, addToast, grade, loadCycle);

  const handleFileLoad = useCallback((file: File) => {
    packageLoadSeqRef.current += 1;
    void grade.loadFromFile(file);
  }, [grade, packageLoadSeqRef]);

  const handleReset = useCallback(() => {
    packageLoadSeqRef.current += 1;
    grade.reset();
  }, [grade, packageLoadSeqRef]);

  const handleSelectProduct = useCallback((product: ProductKind) => {
    grade.setActiveProduct(product);
    grade.setActiveMapLayer(product);
    setActiveComponent(null);
  }, [grade, setActiveComponent]);

  const handleSelectMapLayer = useCallback((layer: MapOutlookLayer) => {
    grade.setActiveMapLayer(layer);
    if (layer !== 'categorical') {
      grade.setActiveProduct(layer);
      setActiveComponent(null);
    }
  }, [grade, setActiveComponent]);

  const handleToggleEvidence = useCallback(() => {
    dispatch(setVisibility(!reportsVisible));
  }, [dispatch, reportsVisible]);

  const handleSelectReport = useCallback((report: StormReport | null) => {
    setSelectedReportId(report?.id ?? null);
  }, [setSelectedReportId]);

  const handleSelectHistoryCard = useCallback((card: GradeCard) => {
    packageLoadSeqRef.current += 1;
    const snapshot = grade.restoreCard(card);
    if (snapshot) {
      grade.applyGradeSnapshot(snapshot);
      addToast('Restored grade package from history.', 'success');
    } else {
      addToast('This grade card is trend-only and cannot reopen a full package.', 'info');
    }
  }, [addToast, grade, packageLoadSeqRef]);

  return {
    handleCloudLoad,
    handleFileLoad,
    handleReset,
    handleSelectProduct,
    handleSelectMapLayer,
    handleToggleEvidence,
    handleSelectReport,
    handleSelectHistoryCard,
  };
};
