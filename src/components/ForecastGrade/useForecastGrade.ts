import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useAuth } from '../../auth/AuthProvider';
import { useEntitlement } from '../../billing/EntitlementProvider';
import { loadVerificationForecast, clearVerificationForecast } from '../../store/verificationSlice';
import { setReports, clearReports, setDate, setVisibility } from '../../store/stormReportsSlice';
import type { ForecastCycle, DayType } from '../../types/outlooks';
import type { StormReport } from '../../types/stormReports';
import type { GradeAccountTier, GradeCard, GradeSnapshot, PackageSourceKind } from '../../types/forecastGrade';
import { serializeForecast, deserializeForecast } from '../../utils/fileUtils';
import {
  FORECAST_GRADE_FORMULA_VERSION,
  isReachedArchiveDate,
  runForecastGrade,
  validateGradeInputs,
  type MapOutlookLayer,
  type PackageGrade,
  type ProductKind,
  type GradeProgress,
} from '../../utils/verificationV2';
import {
  buildGradeCard,
  loadForecastFromFile,
  loadReportsForDate,
  resolveAccountTier,
  SourceLoadError,
  tierHasSnapshots,
} from '../../utils/verificationV2/sources';
import {
  accountScope,
  loadGradeCards,
  loadGradeSnapshot,
  recordGradeResult,
} from '../../utils/verificationV2/gradeHistory';

/**
 * Central state for the Forecast Grade dashboard (PR 06/07).
 *
 * Owns explicit source selection, the staged run lifecycle, redux sync so the
 * shared verification map renders the evidence, and capability-aware history.
 */

type RunPhase = 'idle' | 'running' | 'complete';

const hasReachedReportDate = (useToday: boolean, reportDate: string): boolean =>
  useToday || isReachedArchiveDate(reportDate);

const daysWithData = (forecast: ForecastCycle | null): DayType[] => {
  if (!forecast?.days) {
    return [];
  }
  return (Object.keys(forecast.days) as unknown as DayType[])
    .filter((day) => Boolean(forecast.days[day]))
    .sort((a, b) => a - b);
};

const parseReportDate = (candidate?: string): string | null => {
  const match = candidate?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/);
  if (!match) {
    return null;
  }

  const value = match[0];
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};

/**
 * Use the outlook's documented verification date before falling back to its
 * cycle date. This deliberately avoids treating an imported historic outlook
 * as though it were issued today.
 */
export const resolvePackageReportDate = (forecast: ForecastCycle, day: DayType): string | null => {
  return parseReportDate(forecast.days[day]?.metadata?.validDate) ?? parseReportDate(forecast.cycleDate);
};

export interface ForecastGradeState {
  tier: GradeAccountTier;
  forecast: ForecastCycle | null;
  packageSource: PackageSourceKind | null;
  sourceLabel: string;
  availableDays: DayType[];
  selectedDay: DayType;
  reportDate: string;
  useToday: boolean;
  activeMapLayer: MapOutlookLayer;
  activeProduct: ProductKind;
  phase: RunPhase;
  progress: GradeProgress | null;
  result: PackageGrade | null;
  error: string | null;
  cards: GradeCard[];
  reports: StormReport[];
}

export interface UseForecastGrade extends ForecastGradeState {
  setForecastPackage: (forecast: ForecastCycle, source: PackageSourceKind, label: string) => void;
  loadFromFile: (file: File) => Promise<void>;
  setReportDate: (value: string) => void;
  setUseToday: (value: boolean) => void;
  setSelectedDay: (day: DayType) => void;
  setActiveMapLayer: (layer: MapOutlookLayer) => void;
  setActiveProduct: (product: ProductKind) => void;
  run: () => Promise<void>;
  reset: () => void;
  restoreCard: (card: GradeCard) => GradeSnapshot | null;
  applyGradeSnapshot: (snapshot: GradeSnapshot) => void;
  canRun: boolean;
}

export const useForecastGrade = (addToast: (message: string, type?: 'info' | 'success' | 'error') => void): UseForecastGrade => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();

  const tier = resolveAccountTier(Boolean(user), premiumActive);
  const scope = useMemo(() => accountScope(tier, user?.uid), [tier, user?.uid]);

  const [forecast, setForecast] = useState<ForecastCycle | null>(null);
  const [packageSource, setPackageSource] = useState<PackageSourceKind | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [availableDays, setAvailableDays] = useState<DayType[]>([]);
  const [selectedDay, setSelectedDayState] = useState<DayType>(1);
  const [reportDate, setReportDateState] = useState('');
  const [useToday, setUseTodayState] = useState(true);
  const [activeMapLayer, setActiveMapLayer] = useState<MapOutlookLayer>('categorical');
  const [activeProduct, setActiveProduct] = useState<ProductKind>('tornado');
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [progress, setProgress] = useState<GradeProgress | null>(null);
  const [result, setResult] = useState<PackageGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<GradeCard[]>([]);
  const [reports, setReportsState] = useState<StormReport[]>([]);
  const restoreSeqRef = useRef(0);
  const reportDateWasEditedRef = useRef(false);

  const runGeneration = useRef(0);

  useEffect(() => {
    setCards(loadGradeCards(scope));
  }, [scope]);

  const setForecastPackage = useCallback(
    (nextForecast: ForecastCycle, source: PackageSourceKind, label: string) => {
      runGeneration.current += 1;
      const days = daysWithData(nextForecast);
      setForecast(nextForecast);
      setPackageSource(source);
      setSourceLabel(label);
      setAvailableDays(days);
      const initialDay = days[0] ?? 1;
      const packageDate = resolvePackageReportDate(nextForecast, initialDay);
      reportDateWasEditedRef.current = false;
      setSelectedDayState(initialDay);
      setReportDateState(packageDate ?? '');
      setUseTodayState(!packageDate);
      setResult(null);
      setPhase('idle');
      setError(null);
      dispatch(loadVerificationForecast(nextForecast));
    },
    [dispatch]
  );

  const loadFromFile = useCallback(
    async (file: File) => {
      try {
        const loaded = await loadForecastFromFile(file);
        setForecastPackage(loaded, 'file', file.name);
        addToast('Forecast package loaded. Its outlook date is ready for grading.', 'success');
      } catch (loadError) {
        const message = loadError instanceof SourceLoadError ? loadError.message : 'Failed to load that file.';
        setError(message);
        addToast(message, 'error');
      }
    },
    [addToast, setForecastPackage]
  );

  const setReportDate = useCallback((value: string) => {
    reportDateWasEditedRef.current = true;
    setReportDateState(value);
  }, []);
  const setUseToday = useCallback((value: boolean) => {
    reportDateWasEditedRef.current = true;
    setUseTodayState(value);
  }, []);
  const setSelectedDay = useCallback((day: DayType) => {
    setSelectedDayState(day);
    if (forecast && !reportDateWasEditedRef.current) {
      const packageDate = resolvePackageReportDate(forecast, day);
      setReportDateState(packageDate ?? '');
      setUseTodayState(!packageDate);
    }
    setResult(null);
    setPhase('idle');
  }, [forecast]);

  const canRun =
    Boolean(forecast) &&
    phase !== 'running' &&
    hasReachedReportDate(useToday, reportDate);

  const run = useCallback(async () => {
    if (!forecast) {
      addToast('Load a forecast package first.', 'error');
      return;
    }
    if (!hasReachedReportDate(useToday, reportDate)) {
      const message = useToday
        ? 'Choose a report date or enable "use today" before grading.'
        : 'Choose a real, reached report date before grading.';
      setError(message);
      addToast(message, 'error');
      return;
    }
    const day = forecast.days[selectedDay];
    const outlooks = day?.data ?? { tornado: new Map(), wind: new Map(), hail: new Map(), categorical: new Map() };
    const effectiveDate = useToday ? null : reportDate;

    const generation = ++runGeneration.current;
    restoreSeqRef.current += 1; // invalidate any in-flight snapshot restore
    setPhase('running');
    setError(null);
    setProgress({ fraction: 0, label: 'Loading storm reports…' });

    let loadedReports: StormReport[] = [];
    try {
      loadedReports = await loadReportsForDate(effectiveDate);
    } catch (loadError) {
      if (generation !== runGeneration.current) {
        return;
      }
      const message = loadError instanceof SourceLoadError ? loadError.message : 'Reports could not be loaded.';
      setError(message);
      setPhase('idle');
      setProgress(null);
      addToast(message, 'error');
      return;
    }

    if (generation !== runGeneration.current) {
      return;
    }

    setReportsState(loadedReports);
    dispatch(setReports(loadedReports));
    dispatch(setVisibility(true));
    dispatch(setDate(effectiveDate ?? 'today'));

    const validation = validateGradeInputs({ outlooks, reports: loadedReports });
    if (!validation.valid) {
      if (generation !== runGeneration.current) {
        return;
      }
      setError(validation.reason ?? 'Inputs are invalid.');
      setPhase('idle');
      setProgress(null);
      addToast(validation.reason ?? 'Inputs are invalid for grading.', 'error');
      return;
    }

    const pkg = await runForecastGrade({ outlooks, reports: loadedReports }, setProgress);
    if (generation !== runGeneration.current) {
      return;
    }
    setResult(pkg);
    setPhase('complete');

    const firstProduct = pkg.products.find((product) => product.applicable)?.product ?? 'tornado';
    setActiveProduct(firstProduct);
    setActiveMapLayer('categorical');

    if (scope) {
      const hasSnapshot = tierHasSnapshots(tier);
      const card = buildGradeCard(pkg, {
        reportDate: effectiveDate,
        sourceLabel: sourceLabel || (packageSource === 'cloud' ? 'Cloud + SPC' : 'File + SPC'),
        hasSnapshot,
      });
      let snapshot: GradeSnapshot | undefined;
      if (hasSnapshot) {
        try {
          snapshot = {
            card,
            package: pkg,
            forecast: serializeForecast(forecast, { center: [-98, 39], zoom: 4 }),
            reportDate: effectiveDate,
          };
        } catch {
          snapshot = undefined;
        }
      }
      setCards(recordGradeResult({ scope, card, snapshot }));
    }
  }, [addToast, dispatch, forecast, packageSource, reportDate, scope, selectedDay, sourceLabel, tier, useToday]);

  const reset = useCallback(() => {
    restoreSeqRef.current += 1;
    runGeneration.current += 1;
    setForecast(null);
    setPackageSource(null);
    setSourceLabel('');
    setAvailableDays([]);
    setSelectedDayState(1);
    setResult(null);
    setPhase('idle');
    setProgress(null);
    setError(null);
    setReportsState([]);
    dispatch(clearVerificationForecast());
    dispatch(clearReports());
  }, [dispatch]);

  const restoreCard = useCallback(
    (card: GradeCard): GradeSnapshot | null => {
      const snapshot = loadGradeSnapshot({ scope, cardId: card.id });
      if (!snapshot) {
        addToast('This grade card is trend-only and cannot reopen a full package.', 'info');
      }
      return snapshot;
    },
    [addToast, scope]
  );

  const applyGradeSnapshot = useCallback(
    (snapshot: GradeSnapshot) => {
      const restoreSeq = ++restoreSeqRef.current;
      runGeneration.current += 1; // invalidate any in-flight run()
      const restoredForecast = deserializeForecast(snapshot.forecast);
      const days = daysWithData(restoredForecast);
      setForecast(restoredForecast);
      setPackageSource('file');
      setSourceLabel(snapshot.card.sourceLabel);
      setAvailableDays(days);
      setSelectedDayState(days[0] ?? 1);
      setResult(snapshot.package);
      setPhase('complete');
      setError(null);
      setProgress(null);
      if (snapshot.reportDate) {
        setUseTodayState(false);
        setReportDateState(snapshot.reportDate);
      } else {
        setUseTodayState(true);
        setReportDateState('');
      }
      const firstProduct =
        snapshot.package.products.find((product) => product.applicable)?.product ?? 'tornado';
      setActiveProduct(firstProduct);
      setActiveMapLayer('categorical');
      dispatch(loadVerificationForecast(restoredForecast));
      void loadReportsForDate(snapshot.reportDate)
        .then((loadedReports) => {
          if (restoreSeq !== restoreSeqRef.current) {
            return;
          }
          setReportsState(loadedReports);
          dispatch(setReports(loadedReports));
          dispatch(setDate(snapshot.reportDate ?? 'today'));
        })
        .catch(() => {
          if (restoreSeq !== restoreSeqRef.current) {
            return;
          }
          setReportsState([]);
          dispatch(clearReports());
        });
    },
    [dispatch]
  );

  return useMemo<UseForecastGrade>(() => ({
    tier,
    forecast,
    packageSource,
    sourceLabel,
    availableDays,
    selectedDay,
    reportDate,
    useToday,
    activeMapLayer,
    activeProduct,
    phase,
    progress,
    result,
    error,
    cards,
    reports,
    setForecastPackage,
    loadFromFile,
    setReportDate,
    setUseToday,
    setSelectedDay,
    setActiveMapLayer,
    setActiveProduct,
    run,
    reset,
    restoreCard,
    applyGradeSnapshot,
    canRun,
  }), [
    tier,
    forecast,
    packageSource,
    sourceLabel,
    availableDays,
    selectedDay,
    reportDate,
    useToday,
    activeMapLayer,
    activeProduct,
    phase,
    progress,
    result,
    error,
    cards,
    reports,
    setForecastPackage,
    loadFromFile,
    setReportDate,
    setUseToday,
    setSelectedDay,
    setActiveMapLayer,
    setActiveProduct,
    run,
    reset,
    restoreCard,
    applyGradeSnapshot,
    canRun,
  ]);
};

export { FORECAST_GRADE_FORMULA_VERSION };
