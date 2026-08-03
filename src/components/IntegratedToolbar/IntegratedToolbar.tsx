import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Archive,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  History,
  Image as ImageIcon,
  Layers,
  PenTool,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  Wrench,
  PackageOpen,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { isFeatureExposed } from '../../config/featureExposure';
import { getCategoricalRiskDisplayName, getOutlookColor } from '../../utils/outlookUtils';
import type { CategoricalRiskLevel, OutlookType } from '../../types/outlooks';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import {
  FORECAST_DAYS,
  FORECAST_BASE_MAP_OPTIONS,
  getContrastTextColor,
  hasDayOutlookData,
  outlookIcons,
  outlookLabels,
  outlookShortcuts,
} from '../ForecastWorkspace/workspaceMeta';
import TabbedToolbarSelectionStrip from './TabbedToolbarSelectionStrip';
import CustomDrawPanel from './CustomDrawPanel';
import CustomProductsDialog from './CustomProductsDialog';
import type { RootState } from '../../store';
import { setCustomEditorMode } from '../../store/forecastSlice';
import './IntegratedToolbar.css';

interface IntegratedToolbarProps {
  controller: ForecastWorkspaceController;
  autoTstmTools?: React.ReactNode;
}

/** Compact icon button wrapped in a Tooltip for use in the integrated toolbar. */
const ToolbarTooltipButton: React.FC<{
  icon: React.ReactNode;
  tooltip: React.ReactNode;
  className: string;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, tooltip, className, ariaLabel, onClick, disabled }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button aria-label={ariaLabel} variant="outline" size="icon" className={className} onClick={onClick} disabled={disabled}>
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

/** Save / load / export / package-download and history/copy/reset action buttons for the toolbar. */
const ToolbarToolsSection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="flex flex-col gap-2 lg:gap-3 border-r border-border pr-2 lg:pr-4">
    <div className="flex items-center gap-2">
      <ToolbarTooltipButton
        icon={<Undo2 className="h-6 w-6" />}
        tooltip={<p>Undo <span className="text-muted-foreground">(Ctrl/Cmd+Z)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-700 dark:!bg-amber-500/20 dark:hover:!bg-amber-500/30 dark:border-amber-500/50 dark:text-amber-400"
        ariaLabel="Undo"
        onClick={controller.onUndo}
        disabled={!controller.canUndo}
      />
      <ToolbarTooltipButton
        icon={<Redo2 className="h-6 w-6" />}
        tooltip={<p>Redo <span className="text-muted-foreground">(Ctrl/Cmd+Y / Shift+Ctrl/Cmd+Z)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-700 dark:!bg-amber-500/20 dark:hover:!bg-amber-500/30 dark:border-amber-500/50 dark:text-amber-400"
        ariaLabel="Redo"
        onClick={controller.onRedo}
        disabled={!controller.canRedo}
      />
      <ToolbarTooltipButton
        icon={<Save className="h-6 w-6" />}
        tooltip={<p>Save to JSON <span className="text-muted-foreground">(⌃S)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-green-500/20 hover:bg-green-500/30 border-green-500/50 text-green-700 dark:!bg-green-500/20 dark:hover:!bg-green-500/30 dark:border-green-500/50 dark:text-green-400"
        onClick={controller.onSave}
        disabled={controller.isSaved}
      />
      <ToolbarTooltipButton
        icon={<Upload className="h-6 w-6" />}
        tooltip={<p>Load from JSON <span className="text-muted-foreground">(⌃L)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-700 dark:!bg-blue-500/20 dark:hover:!bg-blue-500/30 dark:border-blue-500/50 dark:text-blue-400"
        onClick={controller.onLoadClick}
      />
      {controller.cloudTools ?? null}
    </div>
    <div className="flex items-center gap-2">
      <ToolbarTooltipButton
        icon={controller.isExporting ? <span className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" /> : <ImageIcon className="h-6 w-6" />}
        tooltip={<p>{controller.isExporting ? 'Exporting...' : 'Export Image'} <span className="text-muted-foreground">(⌃E)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/50 text-orange-700 dark:!bg-orange-500/20 dark:hover:!bg-orange-500/30 dark:border-orange-500/50 dark:text-orange-400"
        onClick={controller.onInitiateExport}
        disabled={controller.isExporting}
      />
      <ToolbarTooltipButton
        icon={<Archive className="h-6 w-6" />}
        tooltip={<p>Export complete cycle <span className="text-muted-foreground">(JSON + discussions)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/50 text-violet-700 dark:!bg-violet-500/20 dark:hover:!bg-violet-500/30 dark:border-violet-500/50 dark:text-violet-400"
        onClick={controller.onPackageDownload}
        disabled={controller.isPackageDownloading}
      />
      <ToolbarTooltipButton
        icon={<PackageOpen className="h-6 w-6" />}
        tooltip={<p>Export current workflow <span className="text-muted-foreground">(scoped package)</span></p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/50 text-violet-700 dark:!bg-violet-500/20 dark:hover:!bg-violet-500/30 dark:border-violet-500/50 dark:text-violet-400"
        ariaLabel="Export current workflow package"
        onClick={controller.onWorkflowPackageDownload}
        disabled={controller.isPackageDownloading}
      />
      <ToolbarTooltipButton
        icon={<History className="h-6 w-6" />}
        tooltip={<p>Cycle History</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/50 text-cyan-700 dark:!bg-cyan-500/20 dark:hover:!bg-cyan-500/30 dark:border-cyan-500/50 dark:text-cyan-400"
        onClick={controller.onOpenHistoryModal}
      />
      <ToolbarTooltipButton
        icon={<Copy className="h-6 w-6" />}
        tooltip={<p>Copy from Previous</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-teal-500/20 hover:bg-teal-500/30 border-teal-500/50 text-teal-700 dark:!bg-teal-500/20 dark:hover:!bg-teal-500/30 dark:border-teal-500/50 dark:text-teal-400"
        onClick={controller.onOpenCopyModal}
      />
      <ToolbarTooltipButton
        icon={<Trash2 className="h-6 w-6" />}
        tooltip={<p>Reset All</p>}
        className="h-14 w-14 lg:h-16 lg:w-16 bg-red-500/20 hover:bg-red-500/30 border-red-500/50 text-red-700 dark:!bg-red-500/20 dark:hover:!bg-red-500/30 dark:border-red-500/50 dark:text-red-400"
        onClick={controller.onOpenResetConfirm}
      />
    </div>
  </div>
);

/** Button + Tooltip combination for a single outlook type; handles active/low-probability states and the keyboard-shortcut tooltip. */
const OutlookTypeButton: React.FC<{
  controller: ForecastWorkspaceController;
  type: OutlookType;
  className: string;
}> = ({ controller, type, className }) => {
  const isActive = controller.activeOutlookType === type;
  const hasLowProb = controller.lowProbabilityOutlooks.includes(type);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'default' : 'secondary'}
          size="sm"
          className={cn(className, hasLowProb && 'border-success-foreground border-2')}
          onClick={controller.outlookTypeHandlers[type]}
        >
          {outlookIcons[type]}
          <span className="ml-1 text-sm">{outlookLabels[type]}</span>
          {hasLowProb ? (
            <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success-foreground bg-background rounded-full" />
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
      </TooltipContent>
    </Tooltip>
  );
};

/** Forecast day navigator: cycle date display/edit, prev/next arrows, and the 4×2 day button grid. */
const ToolbarForecastDaySection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="border-r border-border pr-2 lg:pr-3">
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cycle</span>
        {controller.isEditingDate ? (
          <div className="flex items-center gap-1">
            <Input type="date" value={controller.tempDate} onChange={controller.onTempDateChange} className="h-6 text-xs w-32" />
            <Button size="icon-sm" variant="ghost" className="h-6 w-6" onClick={controller.onDateSave}>✓</Button>
          </div>
        ) : (
          <button
            onClick={controller.onStartDateEdit}
            className="px-2 py-1 text-xs rounded border border-border bg-secondary hover:bg-accent transition-colors focus:outline-none select-none"
          >
            {new Date(controller.cycleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" className="h-[124px] lg:h-[140px] w-9 lg:w-10" onClick={controller.onPrevDay} disabled={controller.currentDay === 1}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="grid grid-cols-4 grid-rows-2 gap-1.5 lg:gap-2">
          {FORECAST_DAYS.map((day) => {
            const hasData = hasDayOutlookData(controller.days, day);
            const isActive = controller.currentDay === day;
            return (
              <Tooltip key={day}>
                <TooltipTrigger asChild>
                  <button
                    data-day={day}
                    onClick={controller.onDayButtonClick}
                    className={cn(
                      'relative h-16 w-16 text-base font-semibold rounded-md transition-all',
                      'lg:h-16 lg:w-16 h-14 w-14',
                      'hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {day}
                    {hasData ? <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-success rounded-full" /> : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Day {day} (Press {day})</p></TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <Button size="icon" variant="ghost" className="h-[124px] lg:h-[140px] w-9 lg:w-10" onClick={controller.onNextDay} disabled={controller.currentDay === 8}>
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
    </div>
  </div>
);

/** Outlook type selector; adapts layout based on how many types are available. */
const ToolbarOutlookTypeSection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="border-r border-border pr-2 lg:pr-4">
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</label>
      {controller.availableTypes.length === 1 ? (
        <div className="h-[124px] lg:h-[140px]">
          {controller.availableTypes.map((type) => (
            <OutlookTypeButton key={type} controller={controller} type={type} className="h-full w-[96px] lg:w-[110px] relative" />
          ))}
        </div>
      ) : controller.availableTypes.length === 2 ? (
        <div className="flex flex-col gap-2 h-[124px] lg:h-[140px]">
          {controller.availableTypes.map((type) => (
            <OutlookTypeButton key={type} controller={controller} type={type} className="h-[58px] lg:h-[66px] w-[96px] lg:w-[110px] relative" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 grid-rows-2 gap-2">
          {controller.availableTypes.slice(0, 4).map((type) => (
            <OutlookTypeButton key={type} controller={controller} type={type} className="h-14 lg:h-16 w-[96px] lg:w-[110px] relative" />
          ))}
        </div>
      )}
    </div>
  </div>
);

/** Ghost-layer toggle group for non-active hazards on the current forecast day. */
const ToolbarGhostLayersSection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="border-r border-border pr-2 lg:pr-4">
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Ghost Layers</label>
      </div>
      <div className="grid grid-cols-2 gap-2 min-w-[220px]">
        {controller.ghostTypes.length > 0 ? controller.ghostTypes.map((type) => {
          const isVisible = controller.ghostVisibility[type];
          const ghostColor = getOutlookColor(type, type === 'categorical' ? 'SLGT' : type === 'day4-8' ? '15%' : '15%');
          return (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button
                  variant={isVisible ? 'default' : 'outline'}
                  size="sm"
                  className={cn('justify-start gap-2 h-14', !isVisible && 'opacity-60')}
                  onClick={controller.ghostOutlookHandlers[type]}
                  style={isVisible ? { backgroundColor: ghostColor, borderColor: ghostColor, color: getContrastTextColor(ghostColor) } : undefined}
                >
                  {outlookIcons[type]}
                  <span className="text-xs">{outlookLabels[type]}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isVisible ? 'Hide' : 'Show'} ghost {outlookLabels[type]}</p>
              </TooltipContent>
            </Tooltip>
          );
        }) : (
          <div className="col-span-2 h-[60px] rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
            No other hazards for this day
          </div>
        )}
      </div>
    </div>
  </div>
);

/** Probability/Risk grid; column count adapts to the number of available probabilities. */
const ToolbarProbabilitySection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="flex-1 px-2 lg:px-3">
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {controller.activeOutlookType === 'categorical' ? 'Risk' : 'Probability'}
      </label>
      <div
        className="grid gap-2 auto-rows-[60px]"
        style={{
          gridTemplateColumns: `repeat(${Math.ceil(controller.probabilities.length / 2)}, 1fr)`,
          gridTemplateRows: 'repeat(2, 60px)',
        }}
      >
        {controller.probabilities.map((prob, index) => {
          const isActive = controller.activeProbability === prob;
          const color = getOutlookColor(controller.activeOutlookType, prob);
          return (
            <Tooltip key={prob}>
              <TooltipTrigger asChild>
                <button
                  onClick={controller.probabilityHandlers[prob]}
                  className={cn(
                    'px-4 py-3 text-sm font-bold rounded-md transition-all',
                    'border-2 focus:outline-none focus:ring-2 focus:ring-ring h-[60px]',
                    isActive ? 'ring-2 ring-ring ring-offset-2' : 'hover:opacity-80'
                  )}
                  style={{
                    backgroundColor: color,
                    borderColor: isActive ? 'var(--ring)' : 'transparent',
                    color: controller.activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(prob) ? '#000' : '#fff',
                    gridRow: (index % 2) + 1,
                    gridColumn: Math.floor(index / 2) + 1,
                  }}
                >
                  {prob}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {controller.activeOutlookType === 'categorical' ? (
                  <p>{getCategoricalRiskDisplayName(prob as CategoricalRiskLevel)}</p>
                ) : (
                  <p>{prob} probability</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  </div>
);

/** Displays the selected outlook type's color swatch, probability, and low-probability toggle. */
const ToolbarCurrentSelectionInner: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const isDarkText = controller.activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(controller.activeProbability);
  const labelColorClass = isDarkText ? 'text-black' : 'text-white';
  const swatchClass = cn(
    'flex flex-col items-center justify-center px-3 lg:px-4 py-2 rounded-lg w-[190px] lg:w-[220px] h-[64px] lg:h-[72px] transition-all',
    controller.isLowProb && 'opacity-40 grayscale'
  );
  const sigSuffix = controller.isSignificant && controller.significantThreatsEnabled ? ' (Sig)' : '';
  const lowProbLabel = controller.activeOutlookType === 'categorical' ? 'No T-Storms' : 'Low Probability';

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">Current</label>
      <div className="flex flex-col gap-1 justify-center" style={{ height: '124px' }}>
        <div className={swatchClass} style={{ backgroundColor: controller.currentColor }}>
          <span className={cn('text-sm font-bold whitespace-nowrap', labelColorClass)}>{outlookLabels[controller.activeOutlookType]}</span>
          <span className={cn('text-base font-bold whitespace-nowrap', labelColorClass)}>{controller.activeProbability}{sigSuffix}</span>
        </div>
        <Button
          variant={controller.isLowProb ? 'success' : 'outline'}
          size="sm"
          className="w-full h-8 gap-2"
          onClick={controller.onToggleLowProbability}
        >
          <CheckCircle2 className={cn('h-4 w-4', controller.isLowProb ? 'text-white' : 'text-muted-foreground')} />
          <span className="text-xs">{lowProbLabel}</span>
        </Button>
        <div className="text-[10px] text-center text-muted-foreground/50">T/W/H/C • ↑↓</div>
      </div>
    </div>
  );
};

/**
 * Displays the current selection area in the integrated toolbar (color swatch, probability, low-probability toggle).
 */
const ToolbarCurrentSelectionSection: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="border-l border-border pl-2 lg:pl-4">
    <ToolbarCurrentSelectionInner controller={controller} />
  </div>
);

const tabbedToolbarTypeLabels: Partial<Record<OutlookType, string>> = {
  tornado: 'Tor',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Cat',
  totalSevere: 'Severe',
  'day4-8': 'D4-8',
};

type TabbedToolbarTabKey = 'draw' | 'days' | 'layers' | 'tools';

/** Section wrapper used inside tab rows to group related controls. */
const TabbedToolbarStripSection: React.FC<{
  label: string;
  hint?: string;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}> = ({ label, hint, className, contentClassName, children }) => (
  <section className={cn('tabbed-integrated-toolbar__section flex h-full shrink-0 items-center gap-2 border-r border-border/70 pr-2 last:border-r-0 last:pr-0', className)}>
    <div className="flex w-[74px] shrink-0 flex-col justify-center">
      <span className="tabbed-integrated-toolbar__section-label text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80 leading-tight">{label}</span>
      {hint ? (
        <span className="tabbed-integrated-toolbar__section-hint mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
          {hint}
        </span>
      ) : null}
    </div>
    <div className={cn('tabbed-integrated-toolbar__section-content flex min-h-0 min-w-0 flex-1 items-center', contentClassName)}>{children}</div>
  </section>
);

/** Button for selecting an outlook type in the tabbed toolbar. */
const TabbedToolbarTypeButton: React.FC<{
  controller: ForecastWorkspaceController;
  type: OutlookType;
}> = ({ controller, type }) => {
  const isActive = controller.activeOutlookType === type;
  const hasLowProb = controller.lowProbabilityOutlooks.includes(type);

  return (
    <button
      type="button"
      title={outlookLabels[type]}
      onClick={controller.outlookTypeHandlers[type]}
      className={cn(
        'tabbed-integrated-toolbar__type-button relative flex h-10 min-w-[72px] items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-all',
        isActive
          ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
          : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent/60',
        hasLowProb && !isActive && 'border-success/60'
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('shrink-0', isActive ? 'text-primary-foreground' : 'text-primary')}>
          {outlookIcons[type]}
        </span>
        <span className="truncate text-xs font-semibold">
          {tabbedToolbarTypeLabels[type] ?? outlookLabels[type]}
        </span>
      </span>
      {hasLowProb ? (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
      ) : null}
    </button>
  );
};

/** Probability / risk button used within the probability scale. */
const TabbedToolbarProbabilityButton: React.FC<{
  controller: ForecastWorkspaceController;
  probability: string;
}> = ({ controller, probability }) => {
  const isActive = controller.activeProbability === probability;
  const color = getOutlookColor(controller.activeOutlookType, probability);
  const isLightCategorical =
    controller.activeOutlookType === 'categorical' && ['TSTM', 'MRGL', 'SLGT'].includes(probability);
  const tooltipLabel =
    controller.activeOutlookType === 'categorical'
      ? getCategoricalRiskDisplayName(probability as CategoricalRiskLevel)
      : `${probability} probability`;

  return (
    <button
      type="button"
      onClick={controller.probabilityHandlers[probability]}
      title={tooltipLabel}
      className={cn(
        'tabbed-integrated-toolbar__probability-button flex h-9 min-w-[58px] items-center justify-center rounded-xl border px-3 text-sm font-black transition-all',
        isActive ? 'is-active shadow-sm' : 'hover:opacity-90'
      )}
      style={{
        backgroundColor: color,
        borderColor: isActive ? 'rgba(15, 23, 42, 0.24)' : 'transparent',
        color: isLightCategorical ? '#111827' : '#ffffff',
      }}
    >
      <span>{probability}</span>
    </button>
  );
};

/* TabbedToolbarSelectionStrip moved to its own file (TabbedToolbarSelectionStrip.tsx) */

/** Row wrapper for tabbed toolbar sections. */
const TabbedToolbarTabRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /** Translate vertical trackpad wheel deltas into horizontal scroll on the toolbar row. */
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    const canScroll = row.scrollWidth > row.clientWidth;

    if (!canScroll || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      return;
    }

    row.scrollLeft += event.deltaY;
    event.preventDefault();
  };

  return (
    <div
      className="tabbed-integrated-toolbar__row h-full overflow-x-auto overflow-y-hidden"
      onWheel={handleWheel}
      role="group"
      aria-label="Toolbar controls"
    >
      <div className="flex h-full min-w-max items-stretch gap-2">{children}</div>
    </div>
  );
};

/** Small stat pill used to display compact numeric metadata. */
const TabbedToolbarStatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="tabbed-integrated-toolbar__stat-pill rounded-xl border border-border/70 bg-muted/35 px-2.5 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground leading-none">{label}</p>
    <p className="mt-1 text-xs font-black text-foreground">{value}</p>
  </div>
);

/** Existing severe-weather controls, unchanged when custom products are unavailable. */
const SevereDrawControls: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <>
    <TabbedToolbarStripSection label="Outlook Type" hint="T / W / H / C" className="tabbed-integrated-toolbar__section--type w-[316px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {controller.availableTypes.map((type) => (
          <TabbedToolbarTypeButton key={type} controller={controller} type={type} />
        ))}
      </div>
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection
      label={controller.activeOutlookType === 'categorical' ? 'Risk Scale' : 'Probability Scale'}
      hint="Arrow Keys"
      className="tabbed-integrated-toolbar__section--probability min-w-[500px] flex-1"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {controller.probabilities.map((probability) => (
          <TabbedToolbarProbabilityButton
            key={probability}
            controller={controller}
            probability={probability}
          />
        ))}
      </div>
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection label="Current Selection" className="tabbed-integrated-toolbar__section--selection w-[360px]">
      <TabbedToolbarSelectionStrip controller={controller} showShortcuts={false} />
    </TabbedToolbarStripSection>
  </>
);

/** Draw tab with a local-only animated switch between severe and custom layers. */
const TabbedToolbarDrawTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const dispatch = useDispatch();
  const storedMode = useSelector((state: RootState) => state.forecast.customEditor.mode);
  const customExposed = isFeatureExposed('customProducts');

  if (!customExposed) {
    return <TabbedToolbarTabRow><SevereDrawControls controller={controller} /></TabbedToolbarTabRow>;
  }

  return (
    <TabbedToolbarTabRow>
      <TabbedToolbarStripSection label="Draw mode" className="tabbed-integrated-toolbar__section--product-mode w-[226px]">
        <div className="custom-product-toggle" role="radiogroup" aria-label="Drawing product" data-testid="custom-product-toggle">
          <span className="custom-product-toggle__indicator" aria-hidden="true" />
          {(['severe', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={storedMode === mode}
              className={cn('custom-product-toggle__button mode-toggle-btn', storedMode === mode && 'is-active')}
              style={{ backgroundColor: storedMode === mode ? 'var(--button-bg)' : 'transparent' }}
              onClick={() => dispatch(setCustomEditorMode(mode))}
            >
              {mode === 'severe' ? 'Severe' : 'Custom'}
            </button>
          ))}
        </div>
      </TabbedToolbarStripSection>
      <div key={storedMode} className="custom-product-mode-panel">
        {storedMode === 'severe' ? (
          <SevereDrawControls controller={controller} />
        ) : (
          <>
            <TabbedToolbarStripSection label="Library" className="w-[184px]">
              <CustomProductsDialog />
            </TabbedToolbarStripSection>
            <CustomDrawPanel />
          </>
        )}
      </div>
    </TabbedToolbarTabRow>
  );
};

/** Control for cycle date selection/editor used in the Days tab. */
const CycleDateControl: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  if (controller.isEditingDate) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={controller.tempDate}
          onChange={controller.onTempDateChange}
          className="tabbed-integrated-toolbar__input h-10 w-[170px] rounded-xl"
        />
        <Button className="tabbed-integrated-toolbar__primary-action h-10 rounded-xl px-3" onClick={controller.onDateSave}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="tabbed-integrated-toolbar__date-card flex items-baseline gap-2 rounded-xl border border-border/80 bg-background px-3 py-[9px]">
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">
          {new Date(`${controller.cycleDate}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <p className="text-[11px] text-muted-foreground">Cycle {controller.cycleDate}</p>
      </div>
      <Button variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 rounded-xl px-3" onClick={controller.onStartDateEdit}>
        Edit
      </Button>
    </div>
  );
};

/** Cycle date strip wrapper used in the Days tab. */
const CycleDateStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarStripSection label="Cycle Date" className="tabbed-integrated-toolbar__section--date w-[300px]">
    <CycleDateControl controller={controller} />
  </TabbedToolbarStripSection>
);

/** Forecast days strip with prev/next and day buttons. */
const ForecastDaysStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarStripSection label="Forecast Days" hint="1-8" className="tabbed-integrated-toolbar__section--days w-[510px]">
    <div className="flex items-center gap-2">
      <Button size="icon" variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 w-10 shrink-0 rounded-xl" onClick={controller.onPrevDay} disabled={controller.currentDay === 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="tabbed-integrated-toolbar__day-strip flex min-w-max items-center gap-1 rounded-2xl p-1">
          {FORECAST_DAYS.map((day) => {
            const isActive = controller.currentDay === day;
            const hasData = hasDayOutlookData(controller.days, day);

            return (
              <button
                key={day}
                type="button"
                data-day={day}
                onClick={controller.onDayButtonClick}
                className={cn(
                  'tabbed-integrated-toolbar__day-button relative h-10 min-w-[48px] rounded-xl border px-3 text-sm font-semibold transition-all',
                  isActive
                    ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'border-transparent bg-transparent hover:bg-background'
                )}
              >
                {day}
                {hasData ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-success" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <Button size="icon" variant="outline" className="tabbed-integrated-toolbar__ghost-action h-10 w-10 shrink-0 rounded-xl" onClick={controller.onNextDay} disabled={controller.currentDay === 8}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </TabbedToolbarStripSection>
);

/** Day status strip showing current day metadata. */
const DayStatusStrip: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const daysWithData = FORECAST_DAYS.filter((day) => hasDayOutlookData(controller.days, day)).length;
  return (
    <TabbedToolbarStripSection label="Day Status" className="tabbed-integrated-toolbar__section--day-status w-[280px]">
      <div className="flex flex-wrap items-center gap-2">
        <TabbedToolbarStatPill label="Current" value={`Day ${controller.currentDay}`} />
        <TabbedToolbarStatPill label="Data" value={`${daysWithData}/8`} />
        <TabbedToolbarStatPill label="Jump" value="1-8" />
      </div>
    </TabbedToolbarStripSection>
  );
};

/**
 * Days tab for selecting cycle date and forecast day navigation.
 */
const TabbedToolbarDaysTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarTabRow>
    <CycleDateStrip controller={controller} />
    <ForecastDaysStrip controller={controller} />
    <DayStatusStrip controller={controller} />
  </TabbedToolbarTabRow>
);

/** Layers tab exposing ghost layers and base map options. */
const TabbedToolbarLayersTab: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <TabbedToolbarTabRow>
    <TabbedToolbarStripSection label="Ghost Layers" hint={`Day ${controller.currentDay}`} className="tabbed-integrated-toolbar__section--ghost-layers min-w-[560px] flex-1">
      {controller.ghostTypes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {controller.ghostTypes.map((type) => {
            const isVisible = controller.ghostVisibility[type];
            const ghostColor = getOutlookColor(
              type,
              type === 'categorical' ? 'SLGT' : type === 'day4-8' ? '15%' : '15%'
            );

            return (
              <button
                key={type}
                type="button"
                onClick={controller.ghostOutlookHandlers[type]}
                className={cn(
                  'tabbed-integrated-toolbar__ghost-layer-button relative flex h-10 min-w-[148px] items-center justify-start gap-3 rounded-xl border px-3.5 text-left transition-all',
                  isVisible
                    ? 'is-active shadow-md'
                    : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent/60'
                )}
                style={
                  isVisible
                    ? {
                        backgroundColor: ghostColor,
                        borderColor: ghostColor,
                        color: getContrastTextColor(ghostColor),
                      }
                    : undefined
                }
              >
                <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center", !isVisible && "opacity-60")}>
                  {outlookIcons[type]}
                </div>
                <div className="flex flex-row items-center gap-1.5 leading-none py-[2px] mt-[1px]">
                  <span className="text-xs font-bold leading-tight uppercase">{outlookLabels[type]}</span>
                  {!isVisible && (
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 leading-tight">
                      Hidden
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tabbed-integrated-toolbar__empty-state rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
          No ghost layers are available for the current day.
        </div>
      )}
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection label="Base Map" className="tabbed-integrated-toolbar__section--base-map w-[330px]">
      <div className="flex flex-wrap items-center gap-2">
        {FORECAST_BASE_MAP_OPTIONS.map((option) => {
          const isActive = controller.baseMapStyle === option.value;
          return (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              onClick={() => controller.onBaseMapStyleSelect(option.value)}
              className={cn(
                'tabbed-integrated-toolbar__map-button h-10 rounded-xl border px-3 text-xs font-semibold transition-colors',
                isActive
                  ? 'is-active border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent'
              )}
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>
    </TabbedToolbarStripSection>

    <TabbedToolbarStripSection label="Layer Status" className="tabbed-integrated-toolbar__section--layer-status w-[250px]">
      <div className="flex flex-wrap items-center gap-2">
        <TabbedToolbarStatPill label="Visible" value={`${controller.visibleGhostOutlooks.length}`} />
        <TabbedToolbarStatPill label="Editing" value={outlookLabels[controller.activeOutlookType]} />
        <TabbedToolbarStatPill label="Selected" value={controller.activeProbability} />
      </div>
    </TabbedToolbarStripSection>
  </TabbedToolbarTabRow>
);

interface TabbedToolbarActionItem {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'outline' | 'destructive';
  tone: 'utility' | 'primary' | 'danger';
  accentClass: string;
}

/** Helper returning the action items displayed in the Tools tab. */
const getTabbedToolbarActionItems = (
  controller: ForecastWorkspaceController
): TabbedToolbarActionItem[] => [
  {
    key: 'undo',
    label: 'Undo',
    description: 'Ctrl/Cmd+Z',
    icon: <Undo2 className="h-4 w-4" />,
    onClick: controller.onUndo,
    disabled: !controller.canUndo,
    tone: 'utility',
    accentClass: 'bg-amber-500/15 text-amber-700',
  },
  {
    key: 'redo',
    label: 'Redo',
    description: 'Ctrl/Cmd+Y',
    icon: <Redo2 className="h-4 w-4" />,
    onClick: controller.onRedo,
    disabled: !controller.canRedo,
    tone: 'utility',
    accentClass: 'bg-amber-500/15 text-amber-700',
  },
  {
    key: 'save',
    label: 'Save',
    description: 'Export the cycle',
    icon: <Save className="h-4 w-4" />,
    onClick: controller.onSave,
    disabled: controller.isSaved,
    tone: 'primary',
    accentClass: 'bg-emerald-500/15 text-emerald-700',
  },
  {
    key: 'load',
    label: 'Load',
    description: 'Open a saved cycle',
    icon: <Upload className="h-4 w-4" />,
    onClick: controller.onLoadClick,
    tone: 'utility',
    accentClass: 'bg-blue-500/15 text-blue-700',
  },
  {
    key: 'export',
    label: 'Export',
    description: 'Ctrl/Cmd+E',
    icon: <ImageIcon className="h-4 w-4" />,
    onClick: controller.onInitiateExport,
    disabled: controller.isExporting,
    tone: 'primary',
    accentClass: 'bg-orange-500/15 text-orange-700',
  },
  {
    key: 'package',
    label: 'Package',
    description: 'JSON plus discussion bundle',
    icon: <Archive className="h-4 w-4" />,
    onClick: controller.onPackageDownload,
    disabled: controller.isPackageDownloading,
    tone: 'primary',
    accentClass: 'bg-violet-500/15 text-violet-700',
  },
  {
    key: 'workflow-package',
    label: 'Workflow package',
    description: 'Export the current workflow only',
    icon: <PackageOpen className="h-4 w-4" />,
    onClick: controller.onWorkflowPackageDownload,
    disabled: controller.isPackageDownloading,
    tone: 'primary',
    accentClass: 'bg-violet-500/15 text-violet-700',
  },
  {
    key: 'history',
    label: 'History',
    description: 'Reopen saved sessions',
    icon: <History className="h-4 w-4" />,
    onClick: controller.onOpenHistoryModal,
    tone: 'utility',
    accentClass: 'bg-cyan-500/15 text-cyan-700',
  },
  {
    key: 'copy',
    label: 'Copy',
    description: 'Pull from another day',
    icon: <Copy className="h-4 w-4" />,
    onClick: controller.onOpenCopyModal,
    tone: 'utility',
    accentClass: 'bg-teal-500/15 text-teal-700',
  },
  ...(isFeatureExposed('forecastWorkflowV2')
    ? [{
        key: 'complete',
        label: 'Complete',
        description: 'Validate and complete cycle',
        icon: <CheckCircle className="h-4 w-4" />,
        onClick: controller.onOpenCompletionModal,
        tone: 'primary' as const,
        accentClass: 'bg-emerald-500/15 text-emerald-700',
      }]
    : []),
  {
    key: 'reset',
    label: 'Reset All',
    description: 'Clear every polygon',
    icon: <Trash2 className="h-4 w-4" />,
    onClick: controller.onOpenResetConfirm,
    variant: 'destructive',
    tone: 'danger',
    accentClass: 'bg-red-500/15 text-red-700',
  },
];

/** Action tile used to render a single workspace/tool action in the Tools tab. */
const TabbedToolbarActionTile: React.FC<{ item: TabbedToolbarActionItem }> = ({ item }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={item.variant ?? 'outline'}
        className={cn(
          'tabbed-integrated-toolbar__action-tile h-10 shrink-0 justify-start rounded-xl px-2.5 text-left text-xs',
          item.variant !== 'destructive' && 'bg-background',
          item.tone === 'utility' && 'tabbed-integrated-toolbar__action-tile--utility',
          item.tone === 'primary' && 'tabbed-integrated-toolbar__action-tile--primary',
          item.tone === 'danger' && 'tabbed-integrated-toolbar__action-tile--danger'
        )}
        onClick={item.onClick}
        disabled={item.disabled}
      >
        <span className={cn('tabbed-integrated-toolbar__action-icon rounded-lg p-1.5', item.accentClass)}>{item.icon}</span>
        <span className="font-semibold">{item.label}</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{item.description}</p>
    </TooltipContent>
  </Tooltip>
);

/** Group of action tiles sharing a label, used to cluster related Tools actions. */
const TabbedToolbarActionGroup: React.FC<{
  label: string;
  items: TabbedToolbarActionItem[];
  tone?: 'default' | 'danger';
}> = ({ label, items, tone = 'default' }) => {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'tabbed-integrated-toolbar__action-group flex items-center gap-2',
        tone === 'danger' && 'tabbed-integrated-toolbar__action-group--danger'
      )}
    >
      <span className="tabbed-integrated-toolbar__action-group-label">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <TabbedToolbarActionTile key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
};

/** Tools tab exposing workspace actions, file actions, and cloud context. */
const TabbedToolbarToolsTab: React.FC<{
  controller: ForecastWorkspaceController;
  autoTstmTools?: React.ReactNode;
}> = ({ controller, autoTstmTools = null }) => {
  const actionItems = getTabbedToolbarActionItems(controller);
  const historyItems = actionItems.filter((item) => ['undo', 'redo', 'history', 'copy'].includes(item.key));
  const fileItems = actionItems.filter((item) => ['save', 'load', 'export', 'package', 'workflow-package'].includes(item.key));
  const completionItems = actionItems.filter((item) => item.key === 'complete');
  const destructiveItems = actionItems.filter((item) => item.key === 'reset');

  return (
    <TabbedToolbarTabRow>
      <TabbedToolbarStripSection label="Workspace Actions" className="tabbed-integrated-toolbar__section--workspace-actions min-w-[760px] flex-1">
        <div className="tabbed-integrated-toolbar__action-groups flex flex-wrap items-center gap-2">
          <TabbedToolbarActionGroup label="History" items={historyItems} />
          <TabbedToolbarActionGroup label="File" items={fileItems} />
          <TabbedToolbarActionGroup label="Complete" items={completionItems} />
          <TabbedToolbarActionGroup label="Danger" items={destructiveItems} tone="danger" />
        </div>
      </TabbedToolbarStripSection>

      <TabbedToolbarStripSection label="Cloud & Context" className="tabbed-integrated-toolbar__section--cloud-context w-[260px]">
        <div className="flex flex-wrap items-center gap-2">
          <TabbedToolbarStatPill label="State" value={controller.isSaved ? 'Saved' : 'Unsaved'} />
          {autoTstmTools}
          {controller.cloudTools ?? (
            <span className="text-xs font-medium text-muted-foreground">Local session only</span>
          )}
        </div>
      </TabbedToolbarStripSection>
    </TabbedToolbarTabRow>
  );
};

/** Toolbar tabs list (extracted to reduce nesting depth in the header). */
const TabbedIntegratedToolbarTabsList: React.FC<{
  activeTab: TabbedToolbarTabKey;
  onTabChange: (value: TabbedToolbarTabKey) => void;
}> = ({ activeTab, onTabChange }) => {
  const tabsListRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRefs = React.useRef<Record<TabbedToolbarTabKey, HTMLButtonElement | null>>({
    draw: null,
    days: null,
    layers: null,
    tools: null,
  });
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    /** Re-measure the active trigger and update the sliding indicator position. */
    const measure = () => {
      const tabsList = tabsListRef.current;
      const trigger = triggerRefs.current[activeTab];

      if (!tabsList || !trigger) {
        return;
      }

      const tabsRect = tabsList.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();

      setIndicatorStyle({
        width: triggerRect.width,
        transform: `translateX(${triggerRect.left - tabsRect.left}px)`,
      });
    };

    measure();
  }, [activeTab]);

  React.useEffect(function setupTabIndicatorObserver() {
    const tabsList = tabsListRef.current;
    if (!tabsList || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      const trigger = triggerRefs.current[activeTab];
      if (!tabsList.isConnected || !trigger) {
        return;
      }

      const tabsRect = tabsList.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();

      setIndicatorStyle({
        width: triggerRect.width,
        transform: `translateX(${triggerRect.left - tabsRect.left}px)`,
      });
    });
    observer.observe(tabsList);
    Object.values(triggerRefs.current).forEach((trigger) => {
      if (trigger) observer.observe(trigger);
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanup() {
      observer.disconnect();
    };
  }, [activeTab]);

  return (
    <TabsList
      ref={tabsListRef}
      className="tabbed-integrated-toolbar__tabs-list relative z-10 mb-[-1px] h-auto gap-1 bg-transparent p-0"
      aria-label="Forecast toolbar sections"
    >
      <span
        className="tabbed-integrated-toolbar__tab-indicator pointer-events-none absolute inset-y-0 left-0"
        style={indicatorStyle}
        aria-hidden="true"
      />
      <TabsTrigger
        value="draw"
        ref={(node) => {
          triggerRefs.current.draw = node;
        }}
        onClick={() => onTabChange('draw')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <PenTool className="h-4 w-4" />
        Draw
      </TabsTrigger>
      <TabsTrigger
        value="days"
        ref={(node) => {
          triggerRefs.current.days = node;
        }}
        onClick={() => onTabChange('days')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <CalendarDays className="h-4 w-4" />
        Days
      </TabsTrigger>
      <TabsTrigger
        value="layers"
        ref={(node) => {
          triggerRefs.current.layers = node;
        }}
        onClick={() => onTabChange('layers')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <Layers className="h-4 w-4" />
        Layers
      </TabsTrigger>
      <TabsTrigger
        value="tools"
        ref={(node) => {
          triggerRefs.current.tools = node;
        }}
        onClick={() => onTabChange('tools')}
        className="tabbed-integrated-toolbar__trigger gap-2 rounded-t-xl rounded-b-none border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold shadow-none sm:text-sm"
      >
        <Wrench className="h-4 w-4" />
        Tools
      </TabsTrigger>
    </TabsList>
  );
};

/** Status bar for the tabbed integrated toolbar header. */
const TabbedIntegratedToolbarStatusBar: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => (
  <div className="tabbed-integrated-toolbar__status-bar flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
    <span className="tabbed-integrated-toolbar__context-label text-[10px] font-bold uppercase tracking-[0.18em]">
      Context
      <span className="sr-only">: </span>
    </span>
    <span className="tabbed-integrated-toolbar__context-value text-foreground">
      Day {controller.currentDay}
    </span>
    <span className="tabbed-integrated-toolbar__context-separator" aria-hidden="true"> · </span>
    <span className="tabbed-integrated-toolbar__context-value text-foreground">
      {new Date(`${controller.cycleDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} Cycle
    </span>
  </div>
);

/** Header area for the tabbed integrated toolbar. */
const TabbedIntegratedToolbarHeader: React.FC<{
  controller: ForecastWorkspaceController;
  activeTab: TabbedToolbarTabKey;
  onTabChange: (value: TabbedToolbarTabKey) => void;
}> = ({ controller, activeTab, onTabChange }) => (
  <div className="tabbed-integrated-toolbar__header px-3 pt-3 lg:px-4">
    <div className="mb-[0px] flex flex-wrap items-end justify-between gap-3">
      <TabbedIntegratedToolbarTabsList activeTab={activeTab} onTabChange={onTabChange} />

      <TabbedIntegratedToolbarStatusBar controller={controller} />
    </div>
  </div>
);

/** Tray area containing the tab panels. */
const TabbedIntegratedToolbarTray: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => (
  <div className="tabbed-integrated-toolbar__tray min-h-0 flex-1 overflow-hidden bg-background px-3 py-2 lg:px-4">
    <TabsContent value="draw" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarDrawTab controller={controller} />
    </TabsContent>

    <TabsContent value="days" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarDaysTab controller={controller} />
    </TabsContent>

    <TabsContent value="layers" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarLayersTab controller={controller} />
    </TabsContent>

    <TabsContent value="tools" className="tabbed-integrated-toolbar__panel mt-0 h-full">
      <TabbedToolbarToolsTab controller={controller} autoTstmTools={autoTstmTools} />
    </TabsContent>
  </div>
);

/** Toolbar variant that keeps the original integrated-bar footprint but moves secondary controls behind tabs. */
const TabbedIntegratedToolbarBody: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => {
  const [activeTab, setActiveTab] = React.useState<TabbedToolbarTabKey>('draw');

  return (
    <div className="tabbed-integrated-toolbar shrink-0 border-t border-border/80 bg-background/95 shadow-lg h-[168px] overflow-hidden backdrop-blur">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabbedToolbarTabKey)} className="flex h-full flex-col">
        <TabbedIntegratedToolbarHeader controller={controller} activeTab={activeTab} onTabChange={setActiveTab} />
        <TabbedIntegratedToolbarTray controller={controller} autoTstmTools={autoTstmTools} />
      </Tabs>
    </div>
  );
};

/**
 * Tabbed variant of the integrated toolbar — keeps primary footprint and moves secondary controls behind tabs.
 */
export const TabbedIntegratedToolbar: React.FC<IntegratedToolbarProps> = ({ controller, autoTstmTools }) => (
  <TooltipProvider>
    <TabbedIntegratedToolbarBody controller={controller} autoTstmTools={autoTstmTools} />
  </TooltipProvider>
);


/** Pure presentational view layer for the integrated bottom toolbar. */
export const IntegratedToolbar: React.FC<IntegratedToolbarProps> = ({ controller }) => (
  <TooltipProvider>
    <div className="shrink-0 bg-background border-t border-border shadow-lg h-[200px] overflow-hidden">
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="flex items-center justify-center gap-2 lg:gap-3 px-2 sm:px-3 lg:px-4 h-full min-w-max">
          <ToolbarToolsSection controller={controller} />
          <ToolbarForecastDaySection controller={controller} />
          <CustomProductsDialog />
          <ToolbarOutlookTypeSection controller={controller} />
          <ToolbarGhostLayersSection controller={controller} />
          <ToolbarProbabilitySection controller={controller} />
          <ToolbarCurrentSelectionSection controller={controller} />
        </div>
      </div>
    </div>
  </TooltipProvider>
);

export default IntegratedToolbar;
