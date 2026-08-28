import React from 'react';
import { Calculator, Loader2, Users } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { RootState } from '../../store';
import type { DayType, OutlookData, OutlookType } from '../../types/outlooks';
import type { Feature } from 'geojson';
import { outlookLabels } from '../ForecastWorkspace/workspaceMeta';
import { estimatePopulation, unionForecastPolygons, type WorldPopEstimate } from '../../utils/worldpop';

const formatPopulation = (value: number): string => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(Math.round(value));

type EstimateContext = {
  currentDay: DayType;
  activeOutlookType: OutlookType;
  currentDayData: OutlookData | undefined;
};

type EstimateRequestContext = Pick<EstimateContext, 'currentDay' | 'activeOutlookType'>;

const getPolygonCount = (features: Feature[]): number => features.filter(
  (feature) => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon',
).length;

const getGeometryError = (
  polygonCount: number,
  context: EstimateRequestContext,
): string => polygonCount > 0
  ? 'The outlook polygons could not be combined into a valid request.'
  : `Draw at least one ${outlookLabels[context.activeOutlookType]} polygon on Day ${context.currentDay} first.`;

const usePopulationEstimate = ({ currentDay, activeOutlookType, currentDayData }: EstimateContext) => {
  const [open, setOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [estimate, setEstimate] = React.useState<WorldPopEstimate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [requestContext, setRequestContext] = React.useState<EstimateRequestContext | null>(null);
  const requestController = React.useRef<AbortController | null>(null);

  const cancelActiveRequest = React.useCallback((message?: string) => {
    const controller = requestController.current;
    requestController.current = null;
    controller?.abort();
    if (message) {
      setIsLoading(false);
      setError(message);
    }
  }, []);

  React.useEffect(() => () => {
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  React.useEffect(() => {
    if (!isLoading || !requestContext) return;
    const contextChanged = requestContext.currentDay !== currentDay
      || requestContext.activeOutlookType !== activeOutlookType;
    if (contextChanged) {
      cancelActiveRequest('Estimate cancelled because the forecast day or outlook changed.');
    }
  }, [activeOutlookType, cancelActiveRequest, currentDay, isLoading, requestContext]);

  const runEstimate = async (geometry: NonNullable<ReturnType<typeof unionForecastPolygons>>, controller: AbortController) => {
    try {
      setEstimate(await estimatePopulation(geometry, { signal: controller.signal }));
    } catch (caught) {
      if (requestController.current !== controller) return;
      setError(caught instanceof Error ? caught.message : 'WorldPop could not calculate this estimate.');
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setIsLoading(false);
      }
    }
  };

  const handleEstimate = async () => {
    const capturedContext = { currentDay, activeOutlookType };
    const outlookMap = currentDayData?.[activeOutlookType];
    const features: Feature[] = outlookMap ? Array.from(outlookMap.values()).flat() : [];
    const polygonCount = getPolygonCount(features);
    const geometry = unionForecastPolygons(features);
    const controller = new AbortController();

    cancelActiveRequest();
    requestController.current = controller;
    setRequestContext(capturedContext);
    setOpen(true);
    setEstimate(null);
    setError(null);
    if (!geometry) {
      setError(getGeometryError(polygonCount, capturedContext));
      requestController.current = null;
      return;
    }

    setIsLoading(true);
    await runEstimate(geometry, controller);
  };

  return { open, setOpen, isLoading, estimate, error, requestContext, handleEstimate };
};

const EstimateContent: React.FC<Pick<ReturnType<typeof usePopulationEstimate>, 'isLoading' | 'estimate' | 'error'>> = ({
  isLoading,
  estimate,
  error,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <Loader2 className="h-5 w-5 animate-spin" />
        WorldPop is calculating the population inside your outlook...
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>;
  }

  if (!estimate) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-5 text-center">
        <p className="text-sm text-muted-foreground">Estimated residents inside the outlook</p>
        <p className="mt-1 text-4xl font-bold tracking-tight">{formatPopulation(estimate.totalPopulation)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border border-border p-2"><dt className="text-muted-foreground">Population grid</dt><dd className="font-medium">{estimate.resolution}</dd></div>
        <div className="rounded border border-border p-2"><dt className="text-muted-foreground">Data year</dt><dd className="font-medium">{estimate.dataYear}</dd></div>
        {estimate.areaKm2 !== undefined ? <div className="rounded border border-border p-2"><dt className="text-muted-foreground">Outlook area</dt><dd className="font-medium">{estimate.areaKm2.toFixed(1)} km²</dd></div> : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        WorldPop is a modeled estimate, not an official impact or warning product. This beta uses the public WorldPop API at {estimate.resolution} resolution.{' '}
        <a href="https://www.worldpop.org/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Source and attribution</a>.
      </p>
    </div>
  );
};

/** Beta-only on-demand population estimate for the active day's active hazard. */
const PopulationEstimateBeta: React.FC = () => {
  const currentDay = useSelector((state: RootState) => state.forecast.forecastCycle.currentDay);
  const activeOutlookType = useSelector((state: RootState) => state.forecast.drawingState.activeOutlookType);
  const currentDayData = useSelector((state: RootState) => state.forecast.forecastCycle.days[currentDay]?.data);
  const { open, setOpen, isLoading, estimate, error, requestContext, handleEstimate } = usePopulationEstimate({
    currentDay,
    activeOutlookType,
    currentDayData,
  });
  const dialogContext = requestContext ?? { currentDay, activeOutlookType };

  return (
    <>
      <div className="flex min-w-[250px] flex-1 flex-col justify-between rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-700 dark:text-violet-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">Population beta</p>
            <p className="text-[11px] text-muted-foreground">Day {currentDay} {outlookLabels[activeOutlookType]}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 h-8 justify-start gap-2 border-violet-500/40 bg-background"
          onClick={handleEstimate}
          disabled={isLoading}
        >
          <Calculator className="h-4 w-4" />
          Estimate affected population
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => { if (!isLoading) setOpen(nextOpen); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Affected population estimate</DialogTitle>
            <DialogDescription>
              Day {dialogContext.currentDay} {outlookLabels[dialogContext.activeOutlookType]} polygons, merged before the request.
            </DialogDescription>
          </DialogHeader>

          <EstimateContent isLoading={isLoading} estimate={estimate} error={error} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PopulationEstimateBeta;
