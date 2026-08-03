import React from 'react';
import { CloudLightning } from 'lucide-react';
import { ServerBackedFeatureBoundary } from '../../features/ServerBackedFeatureBoundary';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { UseAutoTstmResult } from '../../hooks/useAutoTstm';
import AutoTstmPanel from './AutoTstmPanel';

/** Gated forecast-editor entry point for cached Auto-TSTM preview and apply. */
export const AutoTstmWorkspaceTools: React.FC<{
  autoTstm: UseAutoTstmResult;
}> = ({ autoTstm }) => (
  <ServerBackedFeatureBoundary feature="autoTstm">
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          onClick={autoTstm.openPanel}
          disabled={!autoTstm.isDaySupported}
        >
          <CloudLightning className="h-4 w-4" />
          Auto-TSTM
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {autoTstm.isDaySupported
            ? 'Preview cached SPC calibrated thunder guidance'
            : 'Auto-TSTM is only available on Day 1 and Day 2'}
        </p>
      </TooltipContent>
    </Tooltip>
    <AutoTstmPanel
      open={autoTstm.isPanelOpen}
      status={autoTstm.status}
      previewResponse={autoTstm.previewResponse}
      errorMessage={autoTstm.errorMessage}
      onClose={autoTstm.closePanel}
      onRetry={() => {
        autoTstm.fetchPreview().catch(() => undefined);
      }}
      onApply={autoTstm.applyPreview}
      onCancel={autoTstm.cancelPreview}
    />
  </ServerBackedFeatureBoundary>
);

export default AutoTstmWorkspaceTools;
