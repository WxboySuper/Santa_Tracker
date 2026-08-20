/** Pan-mode map toolbar help — keep brief; tier scope comes from the outlook panel. */
export const PAN_MODE_VERTEX_EDIT_HELP =
  'Pan mode: drag map to move, scroll to zoom. Alt or Shift+click a vertex to remove it.';

/** Returns whether an OpenLayers feature belongs to the selected editable outlook tier. */
export const matchesPrecisionEditTier = (
  feature: { get: (key: string) => unknown },
  outlookType: string,
  probability: string,
): boolean =>
  feature.get('outlookType') === outlookType && feature.get('probability') === probability;
