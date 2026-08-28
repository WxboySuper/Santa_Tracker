import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import type { DayType, ForecastCycle, OutlookType } from '../../types/outlooks';
import type { CycleMetadata } from '../../types/workflow';
import {
  exportForecastTransfer,
  importForecastTransfer,
  type ForecastTransferFormat,
  type ForecastTransferScope,
  type KmlArchiveStrategy,
} from '../../utils/forecastTransfer';
import { isFeatureExposed } from '../../config/featureExposure';

export type ForecastTransferDirection = 'import' | 'export';

export interface ForecastTransferModalProps {
  open: boolean;
  direction: ForecastTransferDirection;
  onDirectionChange: (direction: ForecastTransferDirection) => void;
  onClose: () => void;
  forecastCycle: ForecastCycle;
  mapView: { center: [number, number]; zoom: number };
  cycleMetadata?: CycleMetadata;
  isWorkflowActive: boolean;
  isBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  onImported: (result: Awaited<ReturnType<typeof importForecastTransfer>>) => void;
  onExported: (format: ForecastTransferFormat, scope: ForecastTransferScope) => void;
  onError?: (message: string) => void;
  onExportImage?: () => void;
}

const FORMAT_OPTIONS: Array<{ value: ForecastTransferFormat; label: string; description: string }> = [
  { value: 'json', label: 'JSON', description: 'Native GFC forecast file' },
  { value: 'package', label: 'Package (ZIP)', description: 'Forecast JSON plus discussions' },
  { value: 'kml', label: 'KML', description: 'Outlook geometry for GIS tools' },
  { value: 'kmz', label: 'KMZ', description: 'Compressed KML archive' },
];

const SCOPE_OPTIONS: Array<{ value: ForecastTransferScope; label: string }> = [
  { value: 'current-day', label: 'Current day' },
  { value: 'cycle', label: 'Full cycle' },
  { value: 'workflow', label: 'Workflow package' },
];

const OUTLOOK_OPTIONS: Array<{ value: OutlookType; label: string }> = [
  { value: 'categorical', label: 'Categorical' },
  { value: 'tornado', label: 'Tornado' },
  { value: 'wind', label: 'Wind' },
  { value: 'hail', label: 'Hail' },
  { value: 'totalSevere', label: 'Total severe' },
  { value: 'day4-8', label: 'Day 4-8' },
];

const KML_LIMITATIONS = [
  'CIG hatch patterns are stored as metadata only.',
  'Significant (#) hatch overlays are not imported or exported.',
  'Custom product layers are not included in KML/KMZ transfers.',
];

/** Unified import/export dialog for forecast transfer formats. */
// @codescene(disable:"Complex Method", disable:"Large Method")
export const ForecastTransferModal: React.FC<ForecastTransferModalProps> = ({
  open,
  direction,
  onDirectionChange,
  onClose,
  forecastCycle,
  mapView,
  cycleMetadata,
  isWorkflowActive,
  isBusy,
  onBusyChange,
  onImported,
  onExported,
  onError,
  onExportImage,
}) => {
  const kmzEnabled = isFeatureExposed('kmzExport');
  const [format, setFormat] = useState<ForecastTransferFormat>('json');
  const [scope, setScope] = useState<ForecastTransferScope>('cycle');
  const [kmlStrategy, setKmlStrategy] = useState<KmlArchiveStrategy>('structured');
  const [outlookType, setOutlookType] = useState<OutlookType | 'all'>('all');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const availableFormats = useMemo(
    () => FORMAT_OPTIONS.filter((option) => (
      option.value === 'json'
      || option.value === 'package'
      || (kmzEnabled && (option.value === 'kml' || option.value === 'kmz'))
    )),
    [kmzEnabled],
  );

  const availableScopes = useMemo(() => {
    if (format === 'json') {
      return SCOPE_OPTIONS.filter((option) => option.value === 'cycle');
    }
    if (format === 'package') {
      return SCOPE_OPTIONS.filter((option) => option.value === 'cycle' || (isWorkflowActive && option.value === 'workflow'));
    }
    return SCOPE_OPTIONS.filter((option) => option.value !== 'workflow');
  }, [format, isWorkflowActive]);

  useEffect(() => {
    if (!open) {
      setImportWarnings([]);
      return;
    }

    if (!availableFormats.some((option) => option.value === format)) {
      setFormat(availableFormats[0]?.value ?? 'json');
    }
  }, [open, availableFormats, format]);

  useEffect(() => {
    if (!availableScopes.some((option) => option.value === scope)) {
      setScope(availableScopes[0]?.value ?? 'cycle');
    }
  }, [availableScopes, scope]);

  const handleExport = useCallback(async () => {
    onBusyChange(true);
    try {
      await exportForecastTransfer({
        format,
        scope,
        forecastCycle,
        mapView,
        cycleMetadata,
        day: forecastCycle.currentDay,
        kmlStrategy,
        outlookTypes: outlookType === 'all' ? undefined : [outlookType],
      });
      onExported(format, scope);
      onClose();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      onBusyChange(false);
    }
  }, [
    onBusyChange,
    format,
    scope,
    forecastCycle,
    mapView,
    cycleMetadata,
    kmlStrategy,
    outlookType,
    onExported,
    onError,
    onClose,
  ]);

  const handleImportFile = useCallback(async (file: File) => {
    onBusyChange(true);
    setImportWarnings([]);
    try {
      const result = await importForecastTransfer(file, {
        baseCycle: forecastCycle,
        defaultDay: forecastCycle.currentDay as DayType,
      });
      setImportWarnings(result.warnings);
      onImported(result);
      onClose();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      onBusyChange(false);
    }
  }, [onBusyChange, forecastCycle, onImported, onError, onClose]);

  const onFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleImportFile(file);
    }
    event.target.value = '';
  }, [handleImportFile]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import / Export Forecast</DialogTitle>
          <DialogDescription>
            Transfer outlook geometry and forecast data using GFC-native or GIS-compatible formats.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={direction} onValueChange={(value) => onDirectionChange(value as ForecastTransferDirection)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Supported formats: JSON, workflow ZIP package, KML, and KMZ. KML/KMZ imports merge outlook polygons into your active forecast using GFC metadata when available.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-center hover:bg-muted/40">
              <span className="text-sm font-medium">Choose a forecast file</span>
              <span className="mt-1 text-xs text-muted-foreground">.json, .zip, .kml, .kmz</span>
              <input
                type="file"
                accept=".json,.zip,.kml,.kmz,application/json,application/zip,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                className="sr-only"
                onChange={onFileInputChange}
                disabled={isBusy}
              />
            </label>
            {importWarnings.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-medium">Import notes</p>
                <ul className="mt-1 list-disc pl-4">
                  {importWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="export" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="transfer-format">Format</label>
              <select
                id="transfer-format"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={format}
                onChange={(event) => setFormat(event.target.value as ForecastTransferFormat)}
                disabled={isBusy}
              >
                {availableFormats.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {availableFormats.find((option) => option.value === format)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="transfer-scope">Scope</label>
              <select
                id="transfer-scope"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={scope}
                onChange={(event) => setScope(event.target.value as ForecastTransferScope)}
                disabled={isBusy}
              >
                {availableScopes.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {kmzEnabled && (format === 'kmz') ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="transfer-kml-strategy">KMZ layout</label>
                <select
                  id="transfer-kml-strategy"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={kmlStrategy}
                  onChange={(event) => setKmlStrategy(event.target.value as KmlArchiveStrategy)}
                  disabled={isBusy}
                >
                  <option value="structured">Single structured KML</option>
                  <option value="split">Split per day/outlook files</option>
                </select>
              </div>
            ) : null}

            {(format === 'kml' || format === 'kmz') ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="transfer-outlook">Outlook</label>
                <select
                  id="transfer-outlook"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={outlookType}
                  onChange={(event) => setOutlookType(event.target.value as OutlookType | 'all')}
                  disabled={isBusy}
                >
                  <option value="all">All outlooks</option>
                  {OUTLOOK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {(format === 'kml' || format === 'kmz') ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">KML/KMZ limitations</p>
                <ul className="mt-1 list-disc pl-4">
                  {KML_LIMITATIONS.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}

            {onExportImage ? (
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">Map image</p>
                <p className="mt-1 text-xs text-muted-foreground">Export the current map view as a JPEG snapshot.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onExportImage} disabled={isBusy}>
                  Export map image
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>Cancel</Button>
          {direction === 'export' ? (
            <Button type="button" onClick={() => { void handleExport(); }} disabled={isBusy}>
              {isBusy ? 'Exporting…' : 'Download'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ForecastTransferModal;
