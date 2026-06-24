'use client';

/**
 * Pure presentational SVG pie chart — no dependencies.
 *
 * Renders a circular pie from the supplied slices, with the numeric value (and
 * a short %) drawn inside each large-enough slice, an outside legend listing
 * every entry (including 0-count entries, dimmed), and a native <title> hover
 * tooltip per slice. Scales fluidly on phones (max-w-[260px]) and sits beside
 * the legend on sm+ screens.
 *
 * Dark-mode aware via the same Tailwind `dark:` convention used across the
 * dashboard components.
 */

export interface PieDatum {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  title: string;
  data: PieDatum[];
  /** 'lg' renders a bigger chart for the full-page sidebar view. */
  size?: 'md' | 'lg';
}

export interface ComputedSlice extends PieDatum {
  /** Fraction of the whole (0..1). */
  fraction: number;
  /** Percentage 0..100, rounded for display. */
  pct: number;
  /** SVG path "d" for the wedge. */
  path: string;
  /** Centroid for the inside label. */
  labelX: number;
  labelY: number;
}

const CX = 50;
const CY = 50;
const R = 48;
// Radius at which inside-slice labels are placed.
const LABEL_R = 28;
// Slices smaller than this fraction get no inside label (too cramped).
const MIN_LABEL_FRACTION = 0.04;

/**
 * Point on the circle for a given angle (degrees, 0 = top, clockwise).
 */
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Convert the data into renderable slices with cumulative SVG arc paths.
 *
 * Zero-value entries produce no wedge (fraction 0, empty path). When a single
 * non-zero entry makes up the whole pie, it is drawn as a full circle (two
 * half-arcs) since a 360° arc cannot be expressed as one A command.
 *
 * Pure — exported for unit testing.
 */
export function computeSlices(data: PieDatum[]): ComputedSlice[] {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (total <= 0) {
    return data.map((d) => ({
      ...d,
      fraction: 0,
      pct: 0,
      path: '',
      labelX: CX,
      labelY: CY,
    }));
  }

  const nonZero = data.filter((d) => d.value > 0);
  const isFullCircle = nonZero.length === 1;

  let cumulative = 0;
  return data.map((d) => {
    const value = Math.max(0, d.value);
    const fraction = value / total;
    const pct = Math.round(fraction * 100);

    if (value <= 0) {
      return { ...d, fraction: 0, pct: 0, path: '', labelX: CX, labelY: CY };
    }

    const startAngle = cumulative * 360;
    cumulative += fraction;
    const endAngle = cumulative * 360;
    const midAngle = (startAngle + endAngle) / 2;

    let path: string;
    if (isFullCircle) {
      // A single full slice: draw the whole circle via two semicircular arcs.
      const [tx, ty] = polar(CX, CY, R, 0);
      const [bx, by] = polar(CX, CY, R, 180);
      path = `M ${tx} ${ty} A ${R} ${R} 0 1 1 ${bx} ${by} A ${R} ${R} 0 1 1 ${tx} ${ty} Z`;
    } else {
      const [x1, y1] = polar(CX, CY, R, startAngle);
      const [x2, y2] = polar(CX, CY, R, endAngle);
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      path = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    const [labelX, labelY] = polar(CX, CY, LABEL_R, midAngle);

    return { ...d, fraction, pct, path, labelX, labelY };
  });
}

export default function PieChart({ title, data, size = 'md' }: PieChartProps) {
  const slices = computeSlices(data);
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const lg = size === 'lg';
  const chartClass = lg ? 'w-full max-w-[440px]' : 'w-full max-w-[260px]';
  const legendClass = lg ? 'w-full sm:max-w-sm sm:text-base' : 'w-full sm:max-w-[260px]';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <h2 className={`mb-4 font-semibold text-gray-900 dark:text-gray-100 ${lg ? 'text-xl sm:text-2xl' : 'text-lg'}`}>
        {title}
      </h2>

      {total <= 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300 dark:bg-gray-700 dark:text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12a8.25 8.25 0 1 0 16.5 0 8.25 8.25 0 0 0-16.5 0Zm8.25 0V3.75M12 12l5.83-5.83" />
            </svg>
          </div>
          <span className="text-sm text-gray-400 dark:text-gray-500">No data yet</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
          {/* Chart */}
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={title}
            className={`${chartClass} shrink-0`}
          >
            {slices.map((s) =>
              s.path ? (
                <path
                  key={s.label}
                  d={s.path}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                  className="dark:[stroke:#1f2937]"
                >
                  <title>{`${s.label}: ${s.value} (${s.pct}%)`}</title>
                </path>
              ) : null,
            )}
            {slices.map((s) =>
              s.path && s.fraction >= MIN_LABEL_FRACTION ? (
                <text
                  key={`label-${s.label}`}
                  x={s.labelX}
                  y={s.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={4.5}
                  fontWeight={700}
                  fill="#ffffff"
                  style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
                >
                  {s.pct}%
                </text>
              ) : null,
            )}
          </svg>

          {/* Legend */}
          <ul className={`flex flex-col gap-2 ${legendClass}`}>
            {data.map((d) => {
              const dim = d.value <= 0;
              return (
                <li
                  key={d.label}
                  className={`flex items-start gap-2 text-sm ${
                    dim ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    className="mt-[3px] inline-block h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: d.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words leading-snug text-gray-700 dark:text-gray-300">
                    {d.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {d.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
