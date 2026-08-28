# Forecast import / export

Issue: [#621](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/621)

GFC uses a single **Import / Export** dialog for transferring forecast data between GFC and external tools. JSON, workflow ZIP packages, and (on local/beta) KML/KMZ are supported through one API and UI.

## UI entry points

- Forecast toolbar **Import / Export** button
- Keyboard shortcuts:
  - `Ctrl/Cmd+S` — open export tab
  - `Ctrl/Cmd+L` / `Ctrl/Cmd+O` — open import tab
  - `Ctrl/Cmd+E` — map image export (unchanged)

Map image export remains separate via the existing export-image flow and is linked from the transfer modal.

## Supported formats

| Format | Import | Export | Notes |
| --- | --- | --- | --- |
| JSON | Yes | Yes | Native GFC forecast file |
| Package (ZIP) | Yes | Yes | Forecast JSON plus discussions; workflow-scoped export when a workflow is active |
| KML | Yes (local/beta) | Yes (local/beta) | Outlook geometry for GIS tools |
| KMZ | Yes (local/beta) | Yes (local/beta) | Compressed KML archive |

KML/KMZ are gated behind the `kmzExport` feature flag during prototype validation.

## KML/KMZ behavior

### Export strategies

| Strategy | Output shape | Best for |
| --- | --- | --- |
| `structured` | One `doc.kml` with `Day > Outlook > Placemark` folders | Simple sharing, single-file import |
| `split` | KMZ with `days/day-N/<outlook>.kml` plus root network links | Large cycles, toggling layers independently |

### GFC schema adaptation on import

KML/KMZ imports merge outlook polygons into the active forecast cycle:

- Reads `gfc_day`, `gfc_outlook_type`, `gfc_probability_key`, `gfc_significant`, and `gfc_cig` from KML `ExtendedData` when present
- Falls back to `Day N > Outlook > Placemark` folder/name structure when metadata is missing
- Merges by day into the existing cycle instead of replacing untouched days

### Known limitations

| GFC feature | KML behavior |
| --- | --- |
| CIG hatch patterns (`CIG1`–`CIG3`) | Light fill only; hatch pattern is not exported. `gfc_cig` ExtendedData records the level. |
| Significant (`#`) hatch overlay | Fill color preserved; black hatch overlay is not exported. Border width is increased instead. |
| Custom product layers | Excluded from KML/KMZ transfers. |
| Map labels / legend / status badges | Not exported (geometry export only). |
| Line-only or point geometries | Skipped; only polygon/multipolygon features transfer. |

## Code locations

- `src/utils/forecastTransfer/` — unified import/export API
- `src/utils/kmzExport/` — KML/KMZ conversion utilities
- `src/components/ForecastWorkspace/ForecastTransferModal.tsx` — shared import/export dialog
- `src/components/IntegratedToolbar/IntegratedToolbar.tsx` — toolbar entry point
