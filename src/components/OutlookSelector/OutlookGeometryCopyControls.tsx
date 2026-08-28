import React, { memo } from 'react';
import { Copy } from 'lucide-react';
import type { ProbabilisticHazardType } from '../../utils/outlookGeometryCopy';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

const hazardLabels: Record<ProbabilisticHazardType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
};

interface OutlookGeometryCopyControlsProps {
  activeHazard: ProbabilisticHazardType;
  activeProbability: string;
  otherHazards: ProbabilisticHazardType[];
  canCopyAllFrom: (sourceType: ProbabilisticHazardType) => boolean;
  canCopyProbabilityFrom: (sourceType: ProbabilisticHazardType) => boolean;
  onCopyAllFrom: (sourceType: ProbabilisticHazardType) => void;
  onCopyProbabilityFrom: (sourceType: ProbabilisticHazardType) => void;
}

export const OutlookGeometryCopyControls: React.FC<OutlookGeometryCopyControlsProps> = memo(({
  activeHazard,
  activeProbability,
  otherHazards,
  canCopyAllFrom,
  canCopyProbabilityFrom,
  onCopyAllFrom,
  onCopyProbabilityFrom,
}) => {
  const availableSources = otherHazards.filter(
    (sourceType) => canCopyAllFrom(sourceType) || canCopyProbabilityFrom(sourceType),
  );

  if (availableSources.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="tabbed-integrated-toolbar__selection-toggle h-10 w-10 shrink-0 rounded-xl"
                aria-label="Match geometry from another hazard"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Match geometry from another hazard</p>
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-semibold text-foreground">
              Match to {hazardLabels[activeHazard]}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Copy shapes from another hazard ({activeProbability} selected)
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {availableSources.map((sourceType) => (
            <React.Fragment key={sourceType}>
              <DropdownMenuLabel className="pb-1 pt-2 text-xs font-semibold text-muted-foreground">
                From {hazardLabels[sourceType]}
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canCopyAllFrom(sourceType)}
                onSelect={() => onCopyAllFrom(sourceType)}
              >
                All levels
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canCopyProbabilityFrom(sourceType)}
                onSelect={() => onCopyProbabilityFrom(sourceType)}
              >
                {activeProbability} only
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
});

OutlookGeometryCopyControls.displayName = 'OutlookGeometryCopyControls';

export default OutlookGeometryCopyControls;
