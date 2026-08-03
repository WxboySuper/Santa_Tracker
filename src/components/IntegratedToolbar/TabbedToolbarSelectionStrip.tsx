import React from 'react';
import { Button } from '../ui/button';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import { outlookLabels } from '../ForecastWorkspace/workspaceMeta';

/** Small presentational swatch showing outlook label and probability */
const SelectionSwatch: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const isDarkText =
    controller.activeOutlookType === 'categorical' &&
    ['TSTM', 'MRGL', 'SLGT'].includes(controller.activeProbability);
  const sigSuffix = controller.isSignificant && controller.significantThreatsEnabled ? ' (Sig)' : '';

  return (
    <div
      className={cn(
        'tabbed-integrated-toolbar__selection-swatch flex min-w-[162px] items-center justify-between gap-4 rounded-xl px-4 py-2 shadow-sm transition-opacity',
        controller.isLowProb && 'opacity-45 grayscale'
      )}
      style={{ backgroundColor: controller.currentColor }}
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <div className={cn('truncate text-base font-bold leading-tight', isDarkText ? 'text-black' : 'text-white')}>
          {outlookLabels[controller.activeOutlookType]}
        </div>
        <div className={cn('truncate text-lg font-black leading-tight tabular-nums', isDarkText ? 'text-black' : 'text-white')}>
          {controller.activeProbability}
          {sigSuffix}
        </div>
      </div>
    </div>
  );
};

/** Low probability toggle button */
const LowProbToggle: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const lowProbLabel = controller.activeOutlookType === 'categorical' ? 'No T-Storms' : 'Low Probability';
  return (
    <Button
      aria-label={lowProbLabel}
      variant={controller.isLowProb ? 'success' : 'outline'}
      title={lowProbLabel}
      className={cn(
        'tabbed-integrated-toolbar__selection-toggle h-10 shrink-0 rounded-xl px-2.5 text-xs',
        controller.isLowProb && 'is-active'
      )}
      onClick={controller.onToggleLowProbability}
    >
      <CheckCircle2 className={cn('h-4 w-4', controller.isLowProb ? 'text-white' : 'text-muted-foreground')} />
      Low Prob
    </Button>
  );
};

/** Small shortcuts pills */
const ShortcutsPills: React.FC = () => (
  <div className="hidden flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:flex">
    <span className="tabbed-integrated-toolbar__shortcut-pill rounded-full bg-muted px-2 py-1">T/W/H/C</span>
    <span className="tabbed-integrated-toolbar__shortcut-pill rounded-full bg-muted px-2 py-1">Arrow Keys</span>
  </div>
);

/** Selection strip showing the current outlook/probability and quick toggles. */
const TabbedToolbarSelectionStrip: React.FC<{
  controller: ForecastWorkspaceController;
  showToggle?: boolean;
  showShortcuts?: boolean;
}> = ({ controller, showToggle = true, showShortcuts = true }) => {
  return (
    <div className="tabbed-integrated-toolbar__selection-strip flex min-w-0 items-center gap-2">
      <SelectionSwatch controller={controller} />
      {showToggle ? <LowProbToggle controller={controller} /> : null}
      {showShortcuts ? <ShortcutsPills /> : null}
    </div>
  );
};

export default TabbedToolbarSelectionStrip;
