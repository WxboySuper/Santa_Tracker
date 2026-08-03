import React from 'react';
import type { TstmGenerationResponse } from '../../types/tstmGeneration';
import type { AutoTstmStatus } from '../../hooks/useAutoTstm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';

/** Formats an ISO timestamp for display in the preview panel. */
function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Summarizes source metadata from a cached Auto-TSTM response. */
function formatSourceSummary(response: TstmGenerationResponse): string {
  const entries = Object.values(response.sources).filter(Boolean);
  if (entries.length === 0) {
    return 'SPC HREF calibrated thunder';
  }
  return entries
    .map((source) => [source?.product, source?.run, source?.period].filter(Boolean).join(' · '))
    .join('; ');
}

/** Modal for reviewing cached Auto-TSTM guidance before applying it to the forecast. */
export const AutoTstmPanel: React.FC<{
  open: boolean;
  status: AutoTstmStatus;
  previewResponse: TstmGenerationResponse | null;
  errorMessage: string | null;
  onClose: () => void;
  onRetry: () => void;
  onApply: () => void;
  onCancel: () => void;
}> = ({
  open,
  status,
  previewResponse,
  errorMessage,
  onClose,
  onRetry,
  onApply,
  onCancel,
}) => {
  const canApply = status === 'preview' && Boolean(previewResponse?.features.length);
  const isLoading = status === 'loading';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent>
        <DialogHeader className="pr-8 sm:pr-10">
          <DialogTitle>Auto-TSTM Preview</DialogTitle>
          <DialogDescription>
            Review cached SPC calibrated thunder guidance before replacing the current TSTM outlook.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading cached guidance for the current day…</p>
        )}

        {status === 'error' && (
          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{errorMessage ?? 'Auto-TSTM guidance is unavailable.'}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {previewResponse && (
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="font-medium text-foreground">Run</dt>
              <dd className="break-words leading-snug text-muted-foreground">{formatTimestamp(previewResponse.run)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Valid</dt>
              <dd className="break-words leading-snug text-muted-foreground">
                {formatTimestamp(previewResponse.effectiveStart)}
                {' '}
                –
                {' '}
                {formatTimestamp(previewResponse.effectiveEnd)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Source</dt>
              <dd className="break-words leading-snug text-muted-foreground">{formatSourceSummary(previewResponse)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Polygons</dt>
              <dd className="text-muted-foreground">{previewResponse.features.length}</dd>
            </div>
            {previewResponse.warnings.length > 0 && (
              <div>
                <dt className="font-medium text-foreground">Warnings</dt>
                <dd className="break-words leading-snug text-muted-foreground">{previewResponse.warnings.join(' ')}</dd>
              </div>
            )}
          </dl>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply} disabled={!canApply}>
            Apply TSTM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AutoTstmPanel;
