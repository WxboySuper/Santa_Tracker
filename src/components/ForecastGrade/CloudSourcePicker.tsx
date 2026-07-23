import React from 'react';
import { useAppLayout } from '../Layout/AppLayout';
import { useCloudCycles } from '../../hooks/useCloudCycles';

/** Premium cloud package picker rendered inside the source panel. */
const CloudSourcePicker: React.FC<{ onLoad: (id: string, label: string) => void }> = ({ onLoad }) => {
  const { addToast } = useAppLayout();
  const { cycles, loading } = useCloudCycles();
  if (loading) {
    return <p className="text-sm text-slate-500">Loading cloud packages…</p>;
  }
  if (cycles.length === 0) {
    return <p className="text-sm text-slate-500">No cloud packages saved yet.</p>;
  }
  return (
    <label className="block text-sm">
      <span className="font-medium">Cloud package</span>
      <select
        className="fg-touch mt-1 w-full rounded border border-slate-300/40 bg-transparent px-2 py-1"
        defaultValue=""
        onChange={(event) => {
          const value = event.target.value;
          const cycle = cycles.find((item) => item.id === value);
          if (cycle) {
            onLoad(cycle.id, cycle.label ?? 'Cloud package');
            return;
          }
          if (value) {
            addToast('That cloud package is no longer available. Choose another package.', 'error');
            event.target.value = '';
          }
        }}
      >
        <option value="" disabled>
          Choose a saved package…
        </option>
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.label ?? cycle.id}
          </option>
        ))}
      </select>
    </label>
  );
};

export default CloudSourcePicker;
