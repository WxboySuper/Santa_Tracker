// skipcq: JS-W1028
import React from 'react';
import { colorMappings } from '../../utils/outlookUtils';

// Helper: table cell with faded categorical color
const CatCell: React.FC<{ v: string }> = ({ v }) => {
  const cls =
    v === 'MRGL' ? 'cat-mrgl' :
    v === 'SLGT' ? 'cat-slgt' :
    v === 'ENH'  ? 'cat-enh'  :
    v === 'MDT'  ? 'cat-mdt'  :
    v === 'HIGH' ? 'cat-high' : '';
  return <td className={cls}>{v}</td>;
};

interface ColorExampleItem {
  label: string;
  color: string;
  darkText?: boolean;
}

/** Shared color-swatch row that keeps documentation palette examples tied to the live map colors. */
const ColorExamples: React.FC<{ items: ColorExampleItem[] }> = ({ items }) => (
  <div className="color-examples">
    {items.map(({ label, color, darkText = false }) => (
      <div key={label} className="color-item" style={{ backgroundColor: color, color: darkText ? '#333' : undefined }}>
        <span>{label}</span>
      </div>
    ))}
  </div>
);

const tornadoColorExamples: ColorExampleItem[] = [
  { label: '2%', color: colorMappings.tornado['2%'] },
  { label: '5%', color: colorMappings.tornado['5%'] },
  { label: '10%', color: colorMappings.tornado['10%'], darkText: true },
  { label: '15%', color: colorMappings.tornado['15%'] },
  { label: '30%', color: colorMappings.tornado['30%'] },
  { label: '45%', color: colorMappings.tornado['45%'] },
  { label: '60%', color: colorMappings.tornado['60%'] },
];

const windColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.wind['5%'] },
  { label: '15%', color: colorMappings.wind['15%'], darkText: true },
  { label: '30%', color: colorMappings.wind['30%'] },
  { label: '45%', color: colorMappings.wind['45%'] },
  { label: '60%', color: colorMappings.wind['60%'] },
  { label: '75%', color: colorMappings.wind['75%'] },
  { label: '90%', color: colorMappings.wind['90%'], darkText: true },
];

const hailColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.hail['5%'] },
  { label: '15%', color: colorMappings.hail['15%'], darkText: true },
  { label: '30%', color: colorMappings.hail['30%'] },
  { label: '45%', color: colorMappings.hail['45%'] },
  { label: '60%', color: colorMappings.hail['60%'] },
];

const categoricalColorExamples: ColorExampleItem[] = [
  { label: 'TSTM', color: colorMappings.categorical.TSTM, darkText: true },
  { label: 'MRGL', color: colorMappings.categorical.MRGL, darkText: true },
  { label: 'SLGT', color: colorMappings.categorical.SLGT, darkText: true },
  { label: 'ENH', color: colorMappings.categorical.ENH, darkText: true },
  { label: 'MDT', color: colorMappings.categorical.MDT },
  { label: 'HIGH', color: colorMappings.categorical.HIGH },
];

const totalSevereColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.totalSevere['5%'] },
  { label: '15%', color: colorMappings.totalSevere['15%'], darkText: true },
  { label: '30%', color: colorMappings.totalSevere['30%'] },
  { label: '45%', color: colorMappings.totalSevere['45%'] },
  { label: '60%', color: colorMappings.totalSevere['60%'] },
];

const dayFourToEightColorExamples: ColorExampleItem[] = [
  { label: '15%', color: colorMappings['day4-8']['15%'], darkText: true },
  { label: '30%', color: colorMappings['day4-8']['30%'] },
];

/** Overview tab content for the in-app documentation panel. */
export const OverviewSection: React.FC = () => (
  <div className="doc-section">
    <h3>Graphical Forecast Creator</h3>
    <p>
      GFC is a tool for creating professional severe weather outlook graphics.
      Draw probabilistic forecast areas on an interactive CONUS map, then export or share your work.
    </p>

    <h4>Pages</h4>
    <ul>
      <li><strong>Forecast</strong> — Draw and manage outlook polygons across Days 1–8</li>
      <li><strong>Discussion</strong> — Write a companion forecast discussion (DIY or guided mode)</li>
      <li><strong>Verification</strong> — Load storm reports and score your forecasts</li>
    </ul>

    <h4>Key Features</h4>
    <ul>
      <li>Multi-day forecast cycles with Day 1–8 support</li>
      <li>Tornado, Wind, Hail, Categorical, Day 3 Total Severe, and Day 4–8 outlook types</li>
      <li>CIG hatching system (CIG1–CIG3) for significant-threat overlays</li>
      <li>Auto-generated categorical outlook from probabilistic inputs</li>
      <li>Cycle Manager — save, load, and copy forecasts between cycles</li>
      <li>Export as JSON (for reloading) or PNG image snapshot</li>
      <li>Blank (Weather) map style — classic weather-style cream/blue basemap</li>
      <li>Full dark mode support</li>
    </ul>

    <h4>Map Styles</h4>
    <ul>
      <li><strong>Street</strong> — Standard OpenStreetMap tiles</li>
      <li><strong>Satellite</strong> — Esri World Imagery</li>
      <li><strong>Dark</strong> — CartoDB Dark Matter (auto-activates in dark mode)</li>
      <li><strong>Blank (Weather)</strong> — Flat map: cream CONUS, gray neighbors, blue ocean</li>
    </ul>
  </div>
);

/** Usage tab content covering the basic workflow and shortcuts. */
export const UsageSection: React.FC = () => (
  <div className="doc-section">
    <h3>How to Use GFC</h3>

    <h4>Basic Workflow</h4>
    <ol>
      <li>
        <span className="item-title">Select a day:</span> Use the day buttons (1–8) in the toolbar or press the corresponding number key.
      </li>
      <li>
        <span className="item-title">Select an outlook type:</span> Choose Tornado, Wind, Hail, or Categorical (Days 1–2), Total Severe (Day 3), or Day 4–8.
      </li>
      <li>
        <span className="item-title">Select a probability:</span> Click the desired probability level in the panel.
      </li>
      <li>
        <span className="item-title">Set CIG hatching (optional):</span> Choose CIG1, CIG2, or CIG3 to overlay a hatch pattern that boosts the categorical risk level for that area.
      </li>
      <li>
        <span className="item-title">Draw on the map:</span> Use the polygon or rectangle drawing tools in the upper-right corner of the map.
      </li>
      <li>
        <span className="item-title">Review categorical:</span> The categorical outlook is auto-generated — you do not draw it directly (except for TSTM, which must be added manually with <kbd>G</kbd>).
      </li>
      <li>
        <span className="item-title">Save your cycle:</span> Use Cycle Manager to save with an optional label, or export to JSON / PNG from the toolbar.
      </li>
    </ol>

    <h4>Tips</h4>
    <ul>
      <li>Work outward from the highest risk areas to lower risk, not the reverse</li>
      <li>Copy yesterday&apos;s Day 2 into today&apos;s Day 1 via Cycle Manager → Copy from Previous</li>
      <li>Categorical risk is read-only — to change it, modify the underlying probabilistic outlooks</li>
      <li>Auto-save runs every 60 seconds to local storage as a backup</li>
    </ul>

    <h4>Keyboard Shortcuts</h4>
    <ul>
      <li><kbd>1</kbd>–<kbd>8</kbd> — Switch forecast day</li>
      <li><kbd>T</kbd> — Switch to Tornado outlook</li>
      <li><kbd>W</kbd> — Switch to Wind outlook</li>
      <li><kbd>H</kbd> — Switch to Hail outlook</li>
      <li><kbd>C</kbd> — Switch to Categorical outlook</li>
      <li><kbd>G</kbd> — Add General Thunderstorm (Categorical mode only)</li>
      <li><kbd>Ctrl+S</kbd> — Save forecast to JSON</li>
      <li><kbd>Ctrl+D</kbd> — Toggle dark mode</li>
      <li><kbd>Esc</kbd> — Cancel current drawing / close this panel</li>
      <li><kbd>Ctrl+H</kbd> — Go to Home</li>
      <li><kbd>Ctrl+1</kbd> — Go to Forecast</li>
      <li><kbd>Ctrl+2</kbd> — Go to Discussion</li>
      <li><kbd>Ctrl+3</kbd> — Go to Verification</li>
    </ul>
  </div>
);

/** Outlook reference tab content describing supported outlook types and colors. */
export const OutlooksSection: React.FC = () => (
  <div className="doc-section">
    <h3>Outlook Types &amp; Colors</h3>

    <h4>Tornado Outlook (Days 1–2)</h4>
    <p>Probability of a tornado within 25 miles of a point.</p>
    <ColorExamples items={tornadoColorExamples} />
    <p>Supports CIG1, CIG2, and CIG3 hatching. CIG level boosts categorical risk — see the Conversion tab for the full table.</p>

    <h4>Wind Outlook (Days 1–2)</h4>
    <p>Probability of damaging winds (&ge;58 mph) within 25 miles of a point.</p>
    <ColorExamples items={windColorExamples} />
    <p>Supports CIG1, CIG2, and CIG3 hatching.</p>

    <h4>Hail Outlook (Days 1–2)</h4>
    <p>Probability of hail &ge;1&quot; within 25 miles of a point.</p>
    <ColorExamples items={hailColorExamples} />
    <p>Supports CIG1 and CIG2 hatching only (no CIG3).</p>

    <h4>Categorical Outlook (Days 1–2)</h4>
    <p>Auto-derived from Tornado, Wind, and Hail. Only TSTM is drawn manually.</p>
    <ColorExamples items={categoricalColorExamples} />
    <p>Risk hierarchy: TSTM &lt; MRGL &lt; SLGT &lt; ENH &lt; MDT &lt; HIGH. The highest risk from any probabilistic outlook wins in overlapping areas.</p>

    <h4>Total Severe Outlook (Day 3 only)</h4>
    <p>Combined severe weather probability — no separate tornado/wind/hail breakdown.</p>
    <ColorExamples items={totalSevereColorExamples} />
    <p>Supports CIG1 and CIG2 hatching. No HIGH categorical on Day 3.</p>

    <h4>Day 4–8 Outlook</h4>
    <p>Extended-range probabilistic outlook — two levels only, no categorical conversion.</p>
    <ColorExamples items={dayFourToEightColorExamples} />

    <h4>CIG Hatching Levels</h4>
    <p>
      CIG overlays visualize significant threat areas and <strong>directly affect the derived categorical risk level</strong> — a higher CIG applied to a probability will raise its categorical output.
    </p>
    <ul>
      <li><strong>CIG1</strong> — Broken diagonal lines</li>
      <li><strong>CIG2</strong> — Solid diagonal line</li>
      <li><strong>CIG3</strong> — Crosshatch (Tornado and Wind only)</li>
    </ul>
  </div>
);

/** Conversion tab content documenting probabilistic-to-categorical mappings. */
export const CategoricalSection: React.FC = () => (
  <div className="doc-section">
    <h3>Probabilistic → Categorical Conversion</h3>
    <p>
      The categorical risk is computed from each probability + CIG level combination. The highest result
      from any outlook (Tornado, Wind, or Hail) wins for a given area.
    </p>

    <h4>Tornado Conversion</h4>
    <table className="conversion-table">
      <thead>
        <tr><th>Probability</th><th>CIG0</th><th>CIG1</th><th>CIG2</th><th>CIG3</th></tr>
      </thead>
      <tbody>
        <tr><td>2%</td><CatCell v="MRGL"/><CatCell v="MRGL"/><CatCell v="SLGT"/><td>—</td></tr>
        <tr><td>5%</td><CatCell v="SLGT"/><CatCell v="SLGT"/><CatCell v="ENH"/><td>—</td></tr>
        <tr><td>10%</td><CatCell v="SLGT"/><CatCell v="ENH"/><CatCell v="ENH"/><CatCell v="ENH"/></tr>
        <tr><td>15%</td><CatCell v="ENH"/><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="MDT"/></tr>
        <tr><td>30%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
        <tr><td>45%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
        <tr><td>60%</td><CatCell v="ENH"/><CatCell v="HIGH"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
      </tbody>
    </table>

    <h4>Wind Conversion</h4>
    <table className="conversion-table">
      <thead>
        <tr><th>Probability</th><th>CIG0</th><th>CIG1</th><th>CIG2</th><th>CIG3</th></tr>
      </thead>
      <tbody>
        <tr><td>5%</td><CatCell v="MRGL"/><CatCell v="MRGL"/><CatCell v="SLGT"/><td>—</td></tr>
        <tr><td>15%</td><CatCell v="SLGT"/><CatCell v="SLGT"/><CatCell v="ENH"/><td>—</td></tr>
        <tr><td>30%</td><CatCell v="SLGT"/><CatCell v="ENH"/><CatCell v="ENH"/><td>—</td></tr>
        <tr><td>45%</td><CatCell v="ENH"/><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/></tr>
        <tr><td>60%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
        <tr><td>75%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
        <tr><td>90%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="HIGH"/><CatCell v="HIGH"/></tr>
      </tbody>
    </table>

    <h4>Hail Conversion</h4>
    <table className="conversion-table">
      <thead>
        <tr><th>Probability</th><th>CIG0</th><th>CIG1</th><th>CIG2</th></tr>
      </thead>
      <tbody>
        <tr><td>5%</td><CatCell v="MRGL"/><CatCell v="MRGL"/><CatCell v="SLGT"/></tr>
        <tr><td>15%</td><CatCell v="SLGT"/><CatCell v="SLGT"/><CatCell v="ENH"/></tr>
        <tr><td>30%</td><CatCell v="SLGT"/><CatCell v="ENH"/><CatCell v="ENH"/></tr>
        <tr><td>45%</td><CatCell v="ENH"/><CatCell v="ENH"/><CatCell v="MDT"/></tr>
        <tr><td>60%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="MDT"/></tr>
      </tbody>
    </table>
    <p><em>Hail does not produce a HIGH categorical outcome in any combination.</em></p>

    <h4>Day 3 Total Severe Conversion</h4>
    <p>Day 3 uses a single combined probability rather than three separate hazards.</p>
    <table className="conversion-table">
      <thead>
        <tr><th>Probability</th><th>CIG0</th><th>CIG1</th><th>CIG2</th></tr>
      </thead>
      <tbody>
        <tr><td>5%</td><CatCell v="MRGL"/><CatCell v="MRGL"/><CatCell v="SLGT"/></tr>
        <tr><td>15%</td><CatCell v="SLGT"/><CatCell v="SLGT"/><CatCell v="ENH"/></tr>
        <tr><td>30%</td><CatCell v="ENH"/><CatCell v="ENH"/><CatCell v="MDT"/></tr>
        <tr><td>45%</td><CatCell v="ENH"/><CatCell v="MDT"/><CatCell v="MDT"/></tr>
        <tr><td>60%</td><CatCell v="MDT"/><CatCell v="MDT"/><CatCell v="MDT"/></tr>
      </tbody>
    </table>
    <p><em>Day 3 categorical does not reach HIGH. Maximum output is MDT.</em></p>
  </div>
);

export default {} as Record<string, never>;
