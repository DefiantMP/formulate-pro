'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { deriveSavedFormulation, savedFormulationStatusLabel, type SavedFormulationRecord, type SavedFormulationStatus } from '@/lib/savedFormulations';

/**
 * Categorical series colors + status colors, per this project's dataviz
 * skill reference palette (references/palette.md) — light-mode values only,
 * since the app has no dark-mode theme today. Categorical hues are assigned
 * in the skill's fixed CVD-safe order (never cycled/reassigned by data).
 * Status colors reuse the skill's fixed status palette rather than the
 * categorical slots, so a status color never impersonates a series — failed
 * and issue both read as "problem" (adjacent red/orange severity steps,
 * matching the spec's "red for Failed/Issue") while staying distinguishable.
 */
const SERIES_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];

const STATUS_COLORS: Record<SavedFormulationStatus, string> = {
  untested: '#898781',
  passed: '#0ca30c',
  failed: '#d03b3b',
  issue: '#ec835a',
};

interface ChartPoint {
  version: number;
  status: SavedFormulationStatus;
  [componentName: string]: number | string;
}

function buildChartData(versions: SavedFormulationRecord[]): { data: ChartPoint[]; componentNames: string[] } {
  const componentNames: string[] = [];
  const addName = (name: string) => {
    if (!componentNames.includes(name)) componentNames.push(name);
  };

  const data: ChartPoint[] = [...versions]
    .sort((a, b) => a.version - b.version)
    .map((v) => {
      const derived = deriveSavedFormulation(v);
      const point: ChartPoint = { version: v.version, status: v.status };
      derived.actives.forEach((a) => {
        point[a.label] = a.percentOfBlend;
        addName(a.label);
      });
      point[v.fillerName] = derived.fillerPercent;
      addName(v.fillerName);
      if (v.disintegrantName) {
        point[v.disintegrantName] = v.disintegrantPercent ?? 0;
        addName(v.disintegrantName);
      }
      if (v.lubricantName) {
        point[v.lubricantName] = v.lubricantPercent ?? 0;
        addName(v.lubricantName);
      }
      if (v.glidantName) {
        point[v.glidantName] = v.glidantPercent ?? 0;
        addName(v.glidantName);
      }
      return point;
    });

  return { data, componentNames };
}

function StatusDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={5} fill={STATUS_COLORS[payload.status]} stroke="#fff" strokeWidth={1.5} />;
}

interface CompositionOutcomeChartProps {
  versions: SavedFormulationRecord[];
}

/**
 * X axis = version number, one line per component (each active + filler +
 * disintegrant + lubricant + glidant) so a component's trend across versions is
 * traceable by line color, while every line's marker at a given version is
 * colored by THAT version's outcome status — letting the reader see both
 * what changed and whether it worked in one view (spec's "Option B").
 */
export default function CompositionOutcomeChart({ versions }: CompositionOutcomeChartProps) {
  const { data, componentNames } = buildChartData(versions);

  if (data.length === 0) return null;

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#e1e0d9" vertical={false} />
          <XAxis
            dataKey="version"
            tickFormatter={(v) => `v${v}`}
            tick={{ fill: '#898781', fontSize: 11 }}
            axisLine={{ stroke: '#c3c2b7' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: '#898781', fontSize: 11 }}
            axisLine={{ stroke: '#c3c2b7' }}
            tickLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
            labelFormatter={(v) => `Version ${v}`}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #e1e0d9' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#52514e' }} />
          {componentNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={<StatusDot />}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-status-legend">
        {(Object.keys(STATUS_COLORS) as SavedFormulationStatus[]).map((status) => (
          <div key={status} className="chart-status-legend-item">
            <span className="chart-status-dot" style={{ background: STATUS_COLORS[status] }} />
            {savedFormulationStatusLabel(status)}
          </div>
        ))}
      </div>
    </div>
  );
}
