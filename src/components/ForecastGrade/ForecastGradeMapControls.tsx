import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MAP_OUTLOOK_LAYERS, type MapOutlookLayer } from '../../utils/verificationV2';

interface ForecastGradeMapControlsProps {
  activeMapLayer: MapOutlookLayer;
  onSelectMapLayer: (layer: MapOutlookLayer) => void;
  availableDays: number[];
  selectedDay: number;
  onSelectDay: (day: never) => void;
  reportsVisible: boolean;
  onToggleEvidence: () => void;
}

/** Always-reachable map controls: outlook layer, day, and evidence. */
const ForecastGradeMapControls: React.FC<ForecastGradeMapControlsProps> = ({
  activeMapLayer,
  onSelectMapLayer,
  availableDays,
  selectedDay,
  onSelectDay,
  reportsVisible,
  onToggleEvidence,
}) => (
  <div className="absolute left-2 top-2 z-[5] flex flex-wrap items-center gap-1 rounded-lg bg-slate-900/75 p-1 text-xs text-white">
    <div className="flex gap-1" role="group" aria-label="Outlook layer">
      {MAP_OUTLOOK_LAYERS.map((layer) => (
        <button
          key={layer}
          type="button"
          className={`fg-touch rounded px-2 py-1 capitalize ${
            activeMapLayer === layer ? 'bg-blue-500' : 'bg-white/10'
          }`}
          onClick={() => onSelectMapLayer(layer)}
        >
          {layer === 'categorical' ? 'Cat' : layer}
        </button>
      ))}
    </div>
    {availableDays.length > 1 && (
      <select
        className="fg-touch rounded bg-white/10 px-2 py-1"
        value={selectedDay}
        aria-label="Forecast day"
        onChange={(event) => onSelectDay(Number(event.target.value) as never)}
      >
        {availableDays.map((day) => (
          <option key={day} value={day} className="text-black">
            Day {day}
          </option>
        ))}
      </select>
    )}
    <button
      type="button"
      className="fg-touch inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1"
      onClick={onToggleEvidence}
      aria-pressed={reportsVisible}
    >
      {reportsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      Evidence
    </button>
  </div>
);

export default ForecastGradeMapControls;
