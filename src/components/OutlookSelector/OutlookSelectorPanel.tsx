import React, { memo } from 'react';
import { 
  Tornado, 
  Wind, 
  CloudHail, 
  LayoutGrid, 
  CloudSun,
  Calendar
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { OutlookType, CategoricalRiskLevel } from '../../types/outlooks';
import { getCategoricalRiskDisplayName, getOutlookColor } from '../../utils/outlookUtils';
import useOutlookPanelLogic from '../OutlookPanel/useOutlookPanelLogic';
import { cn } from '../../lib/utils';

const outlookIcons: Record<OutlookType, React.ReactNode> = {
  tornado: <Tornado className="h-4 w-4" />,
  wind: <Wind className="h-4 w-4" />,
  hail: <CloudHail className="h-4 w-4" />,
  categorical: <LayoutGrid className="h-4 w-4" />,
  totalSevere: <CloudSun className="h-4 w-4" />,
  'day4-8': <Calendar className="h-4 w-4" />,
};

const outlookLabels: Record<OutlookType, string> = {
  tornado: 'Tornado',
  wind: 'Wind',
  hail: 'Hail',
  categorical: 'Categorical',
  totalSevere: 'Total Severe',
  'day4-8': 'Day 4-8',
};

const outlookShortcuts: Record<OutlookType, string> = {
  tornado: 'T',
  wind: 'W',
  hail: 'L',
  categorical: 'C',
  totalSevere: 'S',
  'day4-8': 'D',
};

// @codescene(disable:"Complex Method", disable:"Large Method")
export const OutlookSelectorPanel: React.FC = memo(() => {
  const {
    activeOutlookType,
    activeProbability,
    isSignificant,
    significantThreatsEnabled,
    getOutlookTypeEnabled,
    outlookTypeHandlers,
    probabilities,
    probabilityHandlers,
    outlookOpacity,
    handleOutlookOpacityChange,
  } = useOutlookPanelLogic();

  // Get available outlook types
  const availableTypes = (['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'] as OutlookType[])
    .filter(type => getOutlookTypeEnabled(type));

  // Get current color for preview
  const currentColor = getOutlookColor({ outlookType: activeOutlookType, probability: activeProbability });

  return (
    <TooltipProvider>
      <div className="fixed bottom-0 left-0 right-0 z-panel bg-background border-t border-border shadow-lg">
        <div className="flex items-start gap-4 px-4 py-3">
          {/* Outlook Type Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Type
            </label>
            <div className="grid grid-cols-2 grid-rows-2 gap-1">
              {availableTypes.slice(0, 4).map((type) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeOutlookType === type ? 'default' : 'secondary'}
                      size="sm"
                      className="h-[36px] w-[110px]"
                      onClick={outlookTypeHandlers[type]}
                    >
                      {outlookIcons[type]}
                      <span className="ml-1 text-xs">{outlookLabels[type]}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{outlookLabels[type]} <span className="text-muted-foreground">({outlookShortcuts[type]})</span></p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          <label className="flex min-w-[150px] flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Opacity
            <span className="flex items-center gap-2 normal-case tracking-normal">
              <input aria-label={`${outlookLabels[activeOutlookType]} opacity`} type="range" min="0" max="1" step="0.05" value={outlookOpacity} onChange={(event) => handleOutlookOpacityChange(Number(event.target.value))} />
              <span>{Math.round(outlookOpacity * 100)}%</span>
            </span>
          </label>

          {/* Probability/Risk Level Selection - Flexible */}
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {activeOutlookType === 'categorical' ? 'Risk' : 'Probability'}
            </label>
            <div className="grid gap-1 auto-rows-[36px]" style={{
              gridTemplateColumns: `repeat(${Math.ceil(probabilities.length / 2)}, 1fr)`,
              gridTemplateRows: 'repeat(2, 36px)'
            }}>
              {probabilities.map((prob, index) => {
                const isActive = activeProbability === prob;
                const color = getOutlookColor({ outlookType: activeOutlookType, probability: prob });
                // Alternate between row 1 and row 2
                const row = (index % 2) + 1;
                const col = Math.floor(index / 2) + 1;
                
                return (
                  <Tooltip key={prob}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={probabilityHandlers[prob]}
                        className={cn(
                          'px-3 py-2 text-xs font-semibold rounded-md transition-all',
                          'border-2 focus:outline-none focus:ring-2 focus:ring-ring',
                          'h-[36px]',
                          isActive 
                            ? 'ring-2 ring-ring ring-offset-2' 
                            : 'hover:opacity-80'
                        )}
                        style={{
                          backgroundColor: color,
                          borderColor: isActive ? 'var(--ring)' : 'transparent',
                          color: activeOutlookType === 'categorical' && 
                            ['TSTM', 'MRGL', 'SLGT'].includes(prob) 
                            ? '#000' 
                            : '#fff',
                          gridRow: row,
                          gridColumn: col,
                        }}
                      >
                        {prob}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {activeOutlookType === 'categorical' ? (
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

          {/* Current Selection Preview + Shortcuts */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              Current
            </label>
            <div className="flex flex-col gap-1">
              <div 
                className="flex items-center justify-center px-4 py-2 rounded-md w-[240px] h-[36px]"
                style={{ backgroundColor: currentColor }}
              >
                <span 
                  className={cn(
                    "text-xs font-semibold whitespace-nowrap",
                    activeOutlookType === 'categorical' && 
                      ['TSTM', 'MRGL', 'SLGT'].includes(activeProbability)
                      ? 'text-black'
                      : 'text-white'
                  )}
                >
                  {outlookLabels[activeOutlookType]} - {activeProbability}
                  {isSignificant && significantThreatsEnabled && ' (Sig)'}
                </span>
              </div>
              <div className="text-[10px] text-center text-muted-foreground/70">
                T/W/L/C • ↑↓
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});

OutlookSelectorPanel.displayName = 'OutlookSelectorPanel';

export default OutlookSelectorPanel;
