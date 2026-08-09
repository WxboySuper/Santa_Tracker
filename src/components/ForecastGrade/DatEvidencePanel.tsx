import React, { useMemo } from 'react';
import type { DatEvidence } from '../../utils/dat';

interface DatEvidencePanelProps {
  evidence: DatEvidence | null;
  error: string | null;
  open?: boolean;
  onToggle?: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Compact, source-separated view of preliminary NOAA damage-survey evidence. */
const DatEvidencePanel: React.FC<DatEvidencePanelProps> = ({ evidence, error, open, onToggle }) => {
  const tornadoPoints = useMemo(
    () => evidence?.damagePoints.filter((point) => /^EF(?:[0-5]|U)$/i.test(point.efScale ?? '')) ?? [],
    [evidence],
  );
  const preview = tornadoPoints.slice(0, 10);

  return (
    <details className="fg-section" open={open}>
      <summary onClick={onToggle ? (event) => { event.preventDefault(); onToggle(); } : undefined}>
        <span>NOAA DAT damage surveys</span>
        <span className="text-sm text-slate-500">{tornadoPoints.length}</span>
      </summary>
      <div className="fg-section-body">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700">
            Preliminary source
          </span>
          <span className="text-slate-500">Used for tornado significant-threat evidence and map context.</span>
        </div>
        {error && <p className="mt-2 text-sm text-amber-700">{error} SPC grading remains available.</p>}
        {!evidence && !error && <p className="mt-2 text-sm text-slate-500">No DAT survey response was loaded for this run.</p>}
        {evidence && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
              <span><b className="block text-base text-slate-800 dark:text-slate-200">{evidence.tracks.length}</b>tracks</span>
              <span><b className="block text-base text-slate-800 dark:text-slate-200">{evidence.damagePoints.length}</b>points</span>
              <span><b className="block text-base text-slate-800 dark:text-slate-200">{evidence.damagePolygons.length}</b>polygons</span>
            </div>
            {preview.length > 0 ? (
              <table className="mt-3 w-full text-sm" aria-label="NOAA DAT tornado damage survey preview">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-1">EF</th>
                    <th className="py-1">Damage indicator</th>
                    <th className="py-1">Surveyed</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((point) => (
                    <tr key={point.objectId} className="border-t border-slate-200/30 align-top">
                      <td className="py-1.5 font-semibold">{point.efScale ?? '—'}</td>
                      <td className="py-1.5">{point.damageText ?? point.degreeOfDamageText ?? 'Damage indicator unavailable'}</td>
                      <td className="py-1.5 tabular-nums">{formatDate(point.surveyDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No EF-coded tornado survey points were returned.</p>
            )}
            {tornadoPoints.length > preview.length && (
              <p className="mt-2 text-xs text-slate-500">Showing {preview.length} of {tornadoPoints.length} tornado survey points; all points remain on the map.</p>
            )}
          </>
        )}
      </div>
    </details>
  );
};

export default DatEvidencePanel;
