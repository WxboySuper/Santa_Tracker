import React from 'react';
import { Scissors } from 'lucide-react';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import { OUTLOOK_TRIM_STRATEGY_OPTIONS } from '../../utils/outlookPolygonMasking/outlookTrimStrategyLabels';
import type { LandMaskStrategy } from '../../utils/outlookPolygonMasking/types';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/** Compact trim trigger + popover; keeps the layers toolbar row at fixed height. */
const OutlookTrimPopover: React.FC<{ controller: ForecastWorkspaceController }> = ({ controller }) => {
  const trimModesActive = controller.outlookTrimAutoOnDraw || controller.outlookTrimPreviewOnly;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Trim outlooks to land (optional)"
          aria-label="Trim outlooks to land"
          className={cn(
            'tabbed-integrated-toolbar__map-button relative h-10 rounded-xl border px-3 text-xs font-semibold transition-colors',
            trimModesActive
              ? 'is-active border-primary bg-primary/10 text-primary shadow-md shadow-primary/20'
              : 'border-border/80 bg-background text-foreground hover:border-primary/30 hover:bg-accent',
          )}
        >
          <Scissors className="h-4 w-4" aria-hidden="true" />
          <span className="ml-1.5">Trim</span>
          {trimModesActive ? (
            <span
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" side="top">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Trim to land</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Removes outlook fill over oceans and Great Lakes. Off by default — you can still draw anywhere.
            </p>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
            <span>Boundary mask</span>
            <select
              className="h-9 rounded-lg border border-border/80 bg-background px-2 text-xs font-medium text-foreground"
              value={controller.outlookTrimStrategy}
              onChange={(event) =>
                controller.onOutlookTrimStrategyChange(event.target.value as LandMaskStrategy)
              }
              aria-label="Land mask strategy"
            >
              {OUTLOOK_TRIM_STRATEGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
              <span>Auto-trim while drawing</span>
              <input
                type="checkbox"
                checked={controller.outlookTrimAutoOnDraw}
                onChange={controller.onToggleOutlookTrimAutoOnDraw}
                aria-label="Auto-trim while drawing"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
              <span>Preview only</span>
              <input
                type="checkbox"
                checked={controller.outlookTrimPreviewOnly}
                onChange={controller.onToggleOutlookTrimPreviewOnly}
                aria-label="Preview trim only"
              />
            </label>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full rounded-lg text-xs font-semibold"
            onClick={() => void controller.onTrimCurrentDayOutlooks()}
            disabled={controller.isTrimmingOutlooks}
          >
            Trim current day
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default OutlookTrimPopover;
