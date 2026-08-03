import React from 'react';
import type { Feature } from 'geojson';
import ForecastMap, { ForecastMapHandle } from '../Map/ForecastMap';
import { TabbedIntegratedToolbar } from '../IntegratedToolbar/IntegratedToolbar';
import { TooltipProvider } from '../ui/tooltip';
import type { ForecastWorkspaceController } from './useForecastWorkspaceController';
import ForecastWorkflowPanel from '../ForecastWorkflow/ForecastWorkflowPanel';

export interface ForecastWorkspaceLayoutProps {
  controller: ForecastWorkspaceController;
  mapRef: React.RefObject<ForecastMapHandle | null>;
  autoTstmTools?: React.ReactNode;
  tstmPreviewFeatures?: Feature[];
}

/** ForecastTabbedToolbarLayout renders the Forecast map and the tabbed integrated toolbar. */
export const ForecastTabbedToolbarLayout: React.FC<ForecastWorkspaceLayoutProps> = ({
  controller,
  mapRef,
  autoTstmTools = null,
  tstmPreviewFeatures = [],
}) => (
  <TooltipProvider>
    <div className="forecast-workspace-layout flex h-full min-h-0 flex-col bg-gradient-to-b from-background via-background to-muted/10">
      <ForecastWorkflowPanel controller={controller} />
      <div className="forecast-workspace-layout__map relative min-h-0 flex-1">
        <ForecastMap ref={mapRef} tstmPreviewFeatures={tstmPreviewFeatures} />
      </div>
      <TabbedIntegratedToolbar controller={controller} autoTstmTools={autoTstmTools} />
    </div>
  </TooltipProvider>
);

export default ForecastTabbedToolbarLayout;
