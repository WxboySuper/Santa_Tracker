import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
  setActiveOutlookType,
  setActiveProbability,
  setOutlookOpacity,
  selectCurrentOutlookOpacity,
  selectCurrentDay,
  selectCurrentOutlooks,
  copyOutlookGeometryBetweenHazards,
} from '../../store/forecastSlice';
import {
  OutlookType,
  Probability
} from '../../types/outlooks';
import { getAvailableProbabilities } from './outlookPanelUtils';
import { getOutlookConstraints } from '../../utils/outlookUtils';
import {
  isOutlookTypeExposed,
  isOutlookGeometryCopyExposed,
  isSignificantThreatsExposed,
} from '../../config/productExposureSelectors';
import {
  countCopyableSourceFeatures,
  countOutlookMapFeatures,
  isProbabilisticHazardType,
  PROBABILISTIC_HAZARD_TYPES,
  type ProbabilisticHazardType,
} from '../../utils/outlookGeometryCopy';

// @codescene(disable:"Large Method", disable:"Complex Method", disable:"Bumpy Road Ahead", disable:"Complex Conditional")
export function useOutlookPanelLogic() {
  const dispatch = useDispatch();
  const drawingState = useSelector((s: RootState) => s.forecast.drawingState);
  const emergencyMode = useSelector((s: RootState) => s.forecast.emergencyMode);
  const currentDay = useSelector(selectCurrentDay);
  const outlooks = useSelector(selectCurrentOutlooks);
  const { activeOutlookType, activeProbability, isSignificant } = drawingState;
  const outlookOpacity = useSelector((s: RootState) => selectCurrentOutlookOpacity(s, activeOutlookType));

  const significantThreatsEnabled = isSignificantThreatsExposed();

  const getOutlookTypeEnabled = useCallback((type: OutlookType) => {
    // Check against current day's constraints
    const constraints = getOutlookConstraints(currentDay);
    const isTypeAllowedForDay = (constraints.outlookTypes as readonly OutlookType[]).includes(type);
    
    if (!isTypeAllowedForDay) {
      return false;
    }
    
    return isOutlookTypeExposed(type);
  }, [currentDay]);

  const handleOutlookTypeChange = useCallback(
    (type: OutlookType) => {
      if (!getOutlookTypeEnabled(type)) {
        return;
      }
      dispatch(setActiveOutlookType(type));
    },
    [dispatch, getOutlookTypeEnabled]
  );

  const handleProbabilityChange = useCallback(
    (probability: string) => {
      dispatch(setActiveProbability(probability as Probability));
    },
    [dispatch]
  );

  const handleToggleSignificant = useCallback(() => {
    // Legacy support removed/disabled
  }, []);

  const handleOutlookOpacityChange = useCallback((opacity: number) => {
    dispatch(setOutlookOpacity({ outlookType: activeOutlookType, opacity }));
  }, [activeOutlookType, dispatch]);

  const probabilities = getAvailableProbabilities(activeOutlookType, currentDay);

  const probabilityHandlers = useMemo(
    () => Object.fromEntries(
      probabilities.map((p) => [p, () => handleProbabilityChange(p)])
    ),
    [probabilities, handleProbabilityChange]
  ) as Record<string, () => void>;

  const outlookTypeHandlers = useMemo(
    () => ({
      tornado: () => handleOutlookTypeChange('tornado'),
      wind: () => handleOutlookTypeChange('wind'),
      hail: () => handleOutlookTypeChange('hail'),
      categorical: () => handleOutlookTypeChange('categorical'),
      totalSevere: () => handleOutlookTypeChange('totalSevere'),
      'day4-8': () => handleOutlookTypeChange('day4-8'),
    }),
    [handleOutlookTypeChange]
  );

  const activeProbabilisticHazard = isProbabilisticHazardType(activeOutlookType)
    ? activeOutlookType
    : null;

  const otherProbabilisticHazards = useMemo(
    () => PROBABILISTIC_HAZARD_TYPES.filter((type) => type !== activeProbabilisticHazard),
    [activeProbabilisticHazard],
  );

  const canCopyAllFrom = useCallback((sourceType: ProbabilisticHazardType) => {
    if (!isOutlookGeometryCopyExposed() || !activeProbabilisticHazard || sourceType === activeProbabilisticHazard) {
      return false;
    }

    return countCopyableSourceFeatures({
      sourceMap: outlooks[sourceType],
      sourceType,
      targetType: activeProbabilisticHazard,
      day: currentDay,
    }) > 0;
  }, [activeProbabilisticHazard, currentDay, outlooks]);

  const canCopyProbabilityFrom = useCallback((sourceType: ProbabilisticHazardType) => {
    if (!isOutlookGeometryCopyExposed() || !activeProbabilisticHazard || sourceType === activeProbabilisticHazard) {
      return false;
    }

    return countCopyableSourceFeatures({
      sourceMap: outlooks[sourceType],
      sourceType,
      targetType: activeProbabilisticHazard,
      day: currentDay,
      probabilityFilter: activeProbability,
    }) > 0;
  }, [activeProbabilisticHazard, activeProbability, currentDay, outlooks]);

  const handleCopyAllGeometryFrom = useCallback((sourceType: ProbabilisticHazardType) => {
    if (!activeProbabilisticHazard) {
      return;
    }

    const targetFeatureCount = countOutlookMapFeatures(outlooks[activeProbabilisticHazard]);
    if (targetFeatureCount > 0) {
      const confirmed = window.confirm(
        `Replace all ${activeProbabilisticHazard} polygons with geometry from ${sourceType}? Existing ${activeProbabilisticHazard} shapes will be removed.`,
      );
      if (!confirmed) {
        return;
      }
    }

    dispatch(copyOutlookGeometryBetweenHazards({
      sourceType,
      targetType: activeProbabilisticHazard,
      mode: 'replace',
    }));
  }, [activeProbabilisticHazard, dispatch, outlooks]);

  const handleCopyProbabilityGeometryFrom = useCallback((sourceType: ProbabilisticHazardType) => {
    if (!activeProbabilisticHazard) {
      return;
    }

    const targetFeatureCount = outlooks[activeProbabilisticHazard]?.get(activeProbability)?.length ?? 0;
    if (targetFeatureCount > 0) {
      const confirmed = window.confirm(
        `Replace ${activeProbabilisticHazard} ${activeProbability} polygons with geometry from ${sourceType}? Existing ${activeProbabilisticHazard} shapes at this level will be removed.`,
      );
      if (!confirmed) {
        return;
      }
    }

    dispatch(copyOutlookGeometryBetweenHazards({
      sourceType,
      targetType: activeProbabilisticHazard,
      mode: 'replace',
      probabilityFilter: activeProbability,
    }));
  }, [activeProbabilisticHazard, activeProbability, dispatch, outlooks]);

  return {
    emergencyMode,
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    handleOutlookTypeChange,
    outlookTypeHandlers,
    handleProbabilityChange,
    handleToggleSignificant,
    probabilities,
    probabilityHandlers,
    outlookOpacity,
    handleOutlookOpacityChange,
    activeProbabilisticHazard,
    otherProbabilisticHazards,
    canCopyAllFrom,
    canCopyProbabilityFrom,
    handleCopyAllGeometryFrom,
    handleCopyProbabilityGeometryFrom,
  } as const;
}

export default useOutlookPanelLogic;
