import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { selectCanRedo, selectCanUndo, selectForecastCycle, selectOmittedDays, setActiveOutlookType, setForecastDay } from '../../store/forecastSlice';
import { setBaseMapStyle, setGhostOutlookVisibility } from '../../store/overlaysSlice';
import type { BaseMapStyle } from '../../store/overlaysSlice';
import { ForecastMapHandle } from '../Map/ForecastMap';
import type { AddToastFn } from '../Layout';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';
import { isExportMapExposed } from '../../config/productExposureSelectors';
import { useExportMap } from '../DrawingTools/useExportMap';

import { DayType, OutlookType } from '../../types/outlooks';
import { getOutlookColor } from '../../utils/outlookUtils';
import { useForecastWorkspaceActionHandlers } from './forecastWorkspaceActions';

const OUTLOOK_TYPE_ORDER: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'];

/** Helper to create ghost outlook handlers outside the hook to reduce hook length. */
function createGhostOutlookHandlers(
  dispatch: ReturnType<typeof useDispatch>,
  ghostOutlookState: Record<OutlookType, boolean>
): Partial<Record<OutlookType, () => void>> {
  const handlers: Partial<Record<OutlookType, () => void>> = {};
  OUTLOOK_TYPE_ORDER.forEach((type) => {
    const nextVisibility = !ghostOutlookState[type];
    handlers[type] = () => dispatch(setGhostOutlookVisibility({ outlookType: type, visible: nextVisibility }));
  });
  return handlers;
}

/** Factory for completion validation handlers to keep the hook small and focused. */
function createCompletionValidationHandlers(opts: {
  dispatch: ReturnType<typeof useDispatch>;
  addToast: AddToastFn;
}) {
  const { dispatch, addToast } = opts;
  return {
    handleOpenCompletionModal: () => {
      dispatch({ type: 'forecast/validateCompletion' });
    },
    handleCloseCompletionModal: () => {
      dispatch({ type: 'forecast/dismissCompletionModal' });
    },
    handleCompleteCycle: () => {
      dispatch({ type: 'forecast/completeCycle' });
      addToast('Forecast cycle marked as complete', 'success');
    },
    handleCompleteWithOmissions: () => {
      dispatch({ type: 'forecast/completeWithOmissions' });
      addToast('Forecast cycle completed with omissions', 'info');
    },
    handleOmitDay: (day: DayType, reason: string) => {
      dispatch({ type: 'forecast/omitDay', payload: { day, reason } });
    },
    handleNavigateToIssue: (day: DayType, outlookType: OutlookType) => {
      dispatch(setForecastDay(day));
      dispatch(setActiveOutlookType(outlookType));
      dispatch({ type: 'forecast/dismissCompletionModal' });
    },
  };
}

/** Factory for date and modal handlers to keep the hook small and focused. */
function createDateAndModalHandlers(opts: {
  cycleDate: string;
  setShowHistoryModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCopyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowResetConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setTempDate: React.Dispatch<React.SetStateAction<string>>;
  setIsEditingDate: React.Dispatch<React.SetStateAction<boolean>>;
  dispatch: ReturnType<typeof useDispatch>;
}) {
  const { cycleDate, setShowHistoryModal, setShowCopyModal, setShowResetConfirm, setTempDate, setIsEditingDate, dispatch } = opts;
  return {
    handleOpenHistoryModal: () => setShowHistoryModal(true),
    handleOpenCopyModal: () => setShowCopyModal(true),
    handleOpenResetConfirm: () => setShowResetConfirm(true),
    handleCloseHistoryModal: () => setShowHistoryModal(false),
    handleCloseCopyModal: () => setShowCopyModal(false),
    handleCancelReset: () => setShowResetConfirm(false),
    handleTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => setTempDate(e.target.value),
    handleStartDateEdit: () => {
      setTempDate(cycleDate);
      setIsEditingDate(true);
    },
    handleBaseMapStyleSelect: (style: BaseMapStyle) => dispatch(setBaseMapStyle(style)),
  };
}

export interface ForecastWorkspaceController {
  onSave: () => void;
  onLoadClick: () => void;
  onPackageDownload: () => void;
  onWorkflowPackageDownload: () => void;
  onCyclePackageDownload: () => void;
  onOpenHistoryModal: () => void;
  onOpenCopyModal: () => void;
  onOpenResetConfirm: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDateSave: () => void;
  onTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartDateEdit: () => void;
  onDayButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToggleLowProbability: () => void;
  onCloseHistoryModal: () => void;
  onCloseCopyModal: () => void;
  onCancelReset: () => void;
  onReset: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isExporting: boolean;
  isExportModalOpen: boolean;
  onInitiateExport: () => void;
  onConfirmExport: (title: string) => Promise<void>;
  onCancelExport: () => void;
  isPackageDownloading: boolean;
  showHistoryModal: boolean;
  showCopyModal: boolean;
  showResetConfirm: boolean;
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  currentDay: DayType;
  days: ReturnType<typeof selectForecastCycle>['days'];
  availableTypes: OutlookType[];
  ghostTypes: OutlookType[];
  activeOutlookType: OutlookType;
  activeProbability: string;
  isSignificant: boolean;
  significantThreatsEnabled: boolean;
  lowProbabilityOutlooks: OutlookType[];
  visibleGhostOutlooks: OutlookType[];
  ghostVisibility: Record<OutlookType, boolean>;
  outlookTypeHandlers: Record<OutlookType, () => void>;
  ghostOutlookHandlers: Partial<Record<OutlookType, () => void>>;
  probabilities: string[];
  probabilityHandlers: Record<string, () => void>;
  currentColor: string;
  isLowProb: boolean;
  cloudTools: React.ReactNode;
  baseMapStyle: BaseMapStyle;
  onBaseMapStyleSelect: (style: BaseMapStyle) => void;
  // Completion validation (WF-03)
  showCompletionModal: boolean;
  onOpenCompletionModal: () => void;
  onCloseCompletionModal: () => void;
  onCompleteCycle: () => void;
  onCompleteWithOmissions: () => void;
  onOmitDay: (day: DayType, reason: string) => void;
  omittedDays: Partial<Record<DayType, string>>;
  onNavigateToIssue: (day: DayType, outlookType: OutlookType) => void;
}

interface UseForecastWorkspaceControllerOptions {
  onSave: () => void;
  onLoad: (file: File) => void;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  addToast: AddToastFn;
  cloudTools?: React.ReactNode;
}

/* Action handlers moved to forecastWorkspaceActions.tsx */

/** Arguments required to assemble the public ForecastWorkspaceController returned by the hook. */
interface BuildForecastWorkspaceControllerArgs {
  onSave: () => void;
  cloudTools: React.ReactNode;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isExporting: boolean;
  isModalOpen: boolean;
  initiateExport: () => void;
  confirmExport: (title: string) => Promise<void>;
  cancelExport: () => void;
  isPackageDownloading: boolean;
  showHistoryModal: boolean;
  showCopyModal: boolean;
  showResetConfirm: boolean;
  isEditingDate: boolean;
  tempDate: string;
  cycleDate: string;
  currentDay: DayType;
  days: ReturnType<typeof selectForecastCycle>['days'];
  availableTypes: OutlookType[];
  ghostTypes: OutlookType[];
  panel: ReturnType<typeof useOutlookPanelLogic>;
  lowProbabilityOutlooks: OutlookType[];
  ghostOutlookState: Record<OutlookType, boolean>;
  ghostOutlookHandlers: Partial<Record<OutlookType, () => void>>;
  baseMapStyle: BaseMapStyle;
  handleBaseMapStyleSelect: (style: BaseMapStyle) => void;
  handleOpenHistoryModal: () => void;
  handleOpenCopyModal: () => void;
  handleOpenResetConfirm: () => void;
  handleCloseHistoryModal: () => void;
  handleCloseCopyModal: () => void;
  handleCancelReset: () => void;
  handleTempDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleStartDateEdit: () => void;
  handlers: ReturnType<typeof useForecastWorkspaceActionHandlers>;
  // Completion validation (WF-03)
  showCompletionModal: boolean;
  handleOpenCompletionModal: () => void;
  handleCloseCompletionModal: () => void;
  handleCompleteCycle: () => void;
  handleCompleteWithOmissions: () => void;
  handleOmitDay: (day: DayType, reason: string) => void;
  omittedDays: Partial<Record<DayType, string>>;
  handleNavigateToIssue: (day: DayType, outlookType: OutlookType) => void;
}

/** Build the controller object returned by useForecastWorkspaceController.
 * Extracted to keep the hook body small for static analysis tools.
 */
function buildForecastWorkspaceController(args: BuildForecastWorkspaceControllerArgs): ForecastWorkspaceController {
  const {
    onSave,
    cloudTools,
    fileInputRef,
    isSaved,
    canUndo,
    canRedo,
    isExporting,
    isModalOpen,
    initiateExport,
    confirmExport,
    cancelExport,
    isPackageDownloading,
    showHistoryModal,
    showCopyModal,
    showResetConfirm,
    isEditingDate,
    tempDate,
    cycleDate,
    currentDay,
    days,
    availableTypes,
    ghostTypes,
    panel,
    lowProbabilityOutlooks,
    ghostOutlookState,
    ghostOutlookHandlers,
    baseMapStyle,
    handleBaseMapStyleSelect,
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handlers,
    showCompletionModal,
    handleOpenCompletionModal,
    handleCloseCompletionModal,
    handleCompleteCycle,
    handleCompleteWithOmissions,
    handleOmitDay,
    omittedDays,
    handleNavigateToIssue,
  } = args;

  const currentColor = getOutlookColor(panel.activeOutlookType, panel.activeProbability);
  const isLowProb = lowProbabilityOutlooks.includes(panel.activeOutlookType);

  return {
    onSave,
    cloudTools,
    fileInputRef,
    isSaved,
    canUndo,
    canRedo,
    isExporting,
    isExportModalOpen: isModalOpen,
    onInitiateExport: initiateExport,
    onConfirmExport: confirmExport,
    onCancelExport: cancelExport,
    isPackageDownloading,
    showHistoryModal,
    showCopyModal,
    showResetConfirm,
    isEditingDate,
    tempDate,
    cycleDate,
    currentDay,
    days,
    availableTypes,
    ghostTypes,
    activeOutlookType: panel.activeOutlookType,
    activeProbability: panel.activeProbability,
    isSignificant: panel.isSignificant,
    significantThreatsEnabled: panel.significantThreatsEnabled,
    lowProbabilityOutlooks,
    visibleGhostOutlooks: availableTypes.filter((type) => type !== panel.activeOutlookType && ghostOutlookState[type]),
    ghostVisibility: ghostOutlookState,
    outlookTypeHandlers: panel.outlookTypeHandlers,
    ghostOutlookHandlers,
    probabilities: panel.probabilities,
    probabilityHandlers: panel.probabilityHandlers,
    currentColor,
    isLowProb,
    baseMapStyle,
    onBaseMapStyleSelect: handleBaseMapStyleSelect,
    onOpenHistoryModal: handleOpenHistoryModal,
    onOpenCopyModal: handleOpenCopyModal,
    onOpenResetConfirm: handleOpenResetConfirm,
    onCloseHistoryModal: handleCloseHistoryModal,
    onCloseCopyModal: handleCloseCopyModal,
    onCancelReset: handleCancelReset,
    onTempDateChange: handleTempDateChange,
    onStartDateEdit: handleStartDateEdit,
    // Completion validation (WF-03)
    showCompletionModal,
    onOpenCompletionModal: handleOpenCompletionModal,
    onCloseCompletionModal: handleCloseCompletionModal,
    onCompleteCycle: handleCompleteCycle,
    onCompleteWithOmissions: handleCompleteWithOmissions,
    onOmitDay: handleOmitDay,
    omittedDays,
    onNavigateToIssue: handleNavigateToIssue,
    ...handlers,
  };
}


/** Local modal/date state for the forecast workspace controller. */
function useForecastWorkspaceModalState(cycleDate: string, dispatch: ReturnType<typeof useDispatch>) {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isPackageDownloading, setIsPackageDownloading] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState('');

  const {
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handleBaseMapStyleSelect,
  } = useMemo(
    () =>
      createDateAndModalHandlers({
        cycleDate,
        setShowHistoryModal,
        setShowCopyModal,
        setShowResetConfirm,
        setTempDate,
        setIsEditingDate,
        dispatch,
      }),
    [cycleDate, dispatch],
  );

  return {
    showHistoryModal,
    showCopyModal,
    showResetConfirm,
    isPackageDownloading,
    setIsPackageDownloading,
    isEditingDate,
    setIsEditingDate,
    tempDate,
    handleOpenHistoryModal,
    handleOpenCopyModal,
    handleOpenResetConfirm,
    handleCloseHistoryModal,
    handleCloseCopyModal,
    handleCancelReset,
    handleTempDateChange,
    handleStartDateEdit,
    handleBaseMapStyleSelect,
  };
}

/** Completion validation modal state and handlers. */
function useCompletionValidationController(
  dispatch: ReturnType<typeof useDispatch>,
  addToast: AddToastFn,
) {
  const showCompletionModal = useSelector(
    (state: RootState) => state.forecast.completionValidation.showCompletionModal,
  );
  const omittedDays = useSelector(selectOmittedDays);

  return {
    showCompletionModal,
    omittedDays,
    ...useMemo(
      () => createCompletionValidationHandlers({ dispatch, addToast }),
      [dispatch, addToast],
    ),
  };
}

/** Redux-derived forecast workspace state shared by the controller hook. */
function useForecastWorkspaceCoreState(
  mapRef: React.RefObject<ForecastMapHandle | null>,
  addToast: AddToastFn,
) {
  const dispatch = useDispatch();
  const forecastCycle = useSelector(selectForecastCycle);
  const { currentDay, days, cycleDate } = forecastCycle;
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const cycleMetadata = useSelector((state: RootState) => state.forecast.workflowMetadata);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const ghostOutlookState = useSelector((state: RootState) => state.overlays.ghostOutlooks);
  const baseMapStyle = useSelector((state: RootState) => state.overlays.baseMapStyle);
  const lowProbabilityOutlooks = useSelector((state: RootState) =>
    state.forecast.forecastCycle.days[currentDay]?.metadata?.lowProbabilityOutlooks || []
  );
  const outlooks = useSelector((state: RootState) =>
    state.forecast.forecastCycle.days[currentDay]?.data || {}
  );
  const panel = useOutlookPanelLogic();
  const exportState = useExportMap({
    mapRef,
    outlooks,
    isExportDisabled: !isExportMapExposed(),
    addToast,
  });
  const availableTypes = OUTLOOK_TYPE_ORDER.filter((type) => panel.getOutlookTypeEnabled(type));
  const ghostTypes = availableTypes.filter((type) => type !== panel.activeOutlookType);
  const ghostOutlookHandlers = useMemo(
    () => createGhostOutlookHandlers(dispatch, ghostOutlookState),
    [dispatch, ghostOutlookState],
  );

  return {
    dispatch,
    forecastCycle,
    cycleMetadata,
    currentDay,
    days,
    cycleDate,
    isSaved,
    canUndo,
    canRedo,
    ghostOutlookState,
    baseMapStyle,
    lowProbabilityOutlooks,
    panel,
    availableTypes,
    ghostTypes,
    ghostOutlookHandlers,
    ...exportState,
  };
}

/** Shared controller for all Forecast workspace layouts. */
function useForecastWorkspaceControllerArgs({
  onSave,
  onLoad,
  mapRef,
  fileInputRef,
  addToast,
  cloudTools = null,
}: UseForecastWorkspaceControllerOptions): BuildForecastWorkspaceControllerArgs {
  const core = useForecastWorkspaceCoreState(mapRef, addToast);
  const modalState = useForecastWorkspaceModalState(core.cycleDate, core.dispatch);
  const completionState = useCompletionValidationController(core.dispatch, addToast);
  const handlers = useForecastWorkspaceActionHandlers({
    dispatch: core.dispatch,
    onLoad,
    mapRef,
    addToast,
    forecastCycle: core.forecastCycle,
    cycleMetadata: core.cycleMetadata,
    currentDay: core.currentDay,
    canUndo: core.canUndo,
    canRedo: core.canRedo,
    tempDate: modalState.tempDate,
    setIsEditingDate: modalState.setIsEditingDate,
    setIsPackageDownloading: modalState.setIsPackageDownloading,
    fileInputRef,
    handleCancelReset: modalState.handleCancelReset,
  });

  return {
    onSave,
    cloudTools,
    fileInputRef,
    isSaved: core.isSaved,
    canUndo: core.canUndo,
    canRedo: core.canRedo,
    isExporting: core.isExporting,
    isModalOpen: core.isModalOpen,
    initiateExport: core.initiateExport,
    confirmExport: core.confirmExport,
    cancelExport: core.cancelExport,
    isPackageDownloading: modalState.isPackageDownloading,
    showHistoryModal: modalState.showHistoryModal,
    showCopyModal: modalState.showCopyModal,
    showResetConfirm: modalState.showResetConfirm,
    isEditingDate: modalState.isEditingDate,
    tempDate: modalState.tempDate,
    cycleDate: core.cycleDate,
    currentDay: core.currentDay,
    days: core.days,
    availableTypes: core.availableTypes,
    ghostTypes: core.ghostTypes,
    panel: core.panel,
    lowProbabilityOutlooks: core.lowProbabilityOutlooks,
    ghostOutlookState: core.ghostOutlookState,
    ghostOutlookHandlers: core.ghostOutlookHandlers,
    baseMapStyle: core.baseMapStyle,
    handleBaseMapStyleSelect: modalState.handleBaseMapStyleSelect,
    handleOpenHistoryModal: modalState.handleOpenHistoryModal,
    handleOpenCopyModal: modalState.handleOpenCopyModal,
    handleOpenResetConfirm: modalState.handleOpenResetConfirm,
    handleCloseHistoryModal: modalState.handleCloseHistoryModal,
    handleCloseCopyModal: modalState.handleCloseCopyModal,
    handleCancelReset: modalState.handleCancelReset,
    handleTempDateChange: modalState.handleTempDateChange,
    handleStartDateEdit: modalState.handleStartDateEdit,
    handlers,
    showCompletionModal: completionState.showCompletionModal,
    omittedDays: completionState.omittedDays,
    handleOpenCompletionModal: completionState.handleOpenCompletionModal,
    handleCloseCompletionModal: completionState.handleCloseCompletionModal,
    handleCompleteCycle: completionState.handleCompleteCycle,
    handleCompleteWithOmissions: completionState.handleCompleteWithOmissions,
    handleOmitDay: completionState.handleOmitDay,
    handleNavigateToIssue: completionState.handleNavigateToIssue,
  };
}

/** Composes forecast workspace state, handlers, and modal wiring for the editor shell. */
export const useForecastWorkspaceController = (
  options: UseForecastWorkspaceControllerOptions,
): ForecastWorkspaceController => buildForecastWorkspaceController(useForecastWorkspaceControllerArgs(options));
