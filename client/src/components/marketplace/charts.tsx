"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free SVG charts for the admin dashboard.
 * Charts scale to container width; dots/tooltips are positioned with
 * percentages so they stay crisp at any size.
 */

export type ChartDatum = { label: string; value: number };

const CHART_HEIGHT = 230;
const PAD = { top: 18, right: 10, bottom: 30, left: 10 };

function niceMax(max: number): number {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function formatShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function useHover(): [number | null, (i: number | null) => void] {
  const [index, setIndex] = React.useState<number | null>(null);
  return [index, setIndex];
}

function Tooltip({ xPct, topPct, children }: { xPct: number; topPct: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-inverse px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
      style={{ left: `${xPct}%`, top: `${topPct}%`, transform: "translate(-50%, -130%)" }}
    >
      {children}
    </div>
  );
}

export function LineChart({
  data,
  formatter,
  color = "var(--color-primary)",
  height = CHART_HEIGHT,
}: {
  data: ChartDatum[];
  formatter?: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useHover();
  const W = 640;
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const n = data.length;
  const xAt = (i: number) => (n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d.value).toFixed(1)}`).join(" ");
  const areaPath = data.length
    ? `${linePath} L${xAt(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
    : "";

  return (
    <div onMouseLeave={() => setHover(null)}>
      {/* The relative wrapper is exactly the SVG box, so dots stay aligned at any width */}
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
          {/* Horizontal gridlines */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yAt(max * f)}
              y2={yAt(max * f)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
          ))}
          {areaPath && <path d={areaPath} fill={color} opacity={0.12} />}
          {linePath && (
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* Dots + hover targets (HTML so they don't distort when stretched) */}
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            aria-label={`${d.label}: ${d.value}`}
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-default rounded-full focus:outline-none"
            style={{ left: `${(xAt(i) / W) * 100}%`, top: `${(yAt(d.value) / H) * 100}%` }}
            onMouseEnter={() => setHover(i)}
          >
            <span
              className={cn("mx-auto block h-2 w-2 rounded-full ring-2 ring-white", hover === i && "scale-125")}
              style={{ backgroundColor: color }}
            />
          </button>
        ))}

        {hover !== null && data[hover] && (
          <Tooltip xPct={(xAt(hover) / W) * 100} topPct={(yAt(data[hover].value) / H) * 100}>
            <span className="mr-1.5 text-muted-foreground">{data[hover].label}:</span>
            {formatter ? formatter(data[hover].value) : formatShort(data[hover].value)}
          </Tooltip>
        )}
      </div>

      {/* X-axis labels — sample to avoid crowding */}
      <div className="mt-1 flex justify-between px-1 text-[10px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(n / 2)]?.label}</span>
        <span>{data[n - 1]?.label}</span>
      </div>
    </div>
  );
}

export function BarChart({
  data,
  formatter,
  color = "var(--color-primary)",
  height = CHART_HEIGHT,
  barGap = 6,
}: {
  data: ChartDatum[];
  formatter?: (v: number) => string;
  color?: string;
  height?: number;
  barGap?: number;
}) {
  const [hover, setHover] = useHover();
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotH = height - PAD.top - PAD.bottom;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex items-end gap-1" style={{ height: `${plotH}px` }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * plotH);
          return (
            <button
              key={d.label}
              type="button"
              aria-label={`${d.label}: ${d.value}`}
              className="group relative flex-1 cursor-default rounded-t-[3px] transition-opacity focus:outline-none"
              style={{ backgroundColor: hover === null || hover === i ? color : `${color}40`, height: `${h}px` }}
              onMouseEnter={() => setHover(i)}
            >
              {hover === i && (
                <Tooltip xPct={50} topPct={-4}>
                  <span className="mr-1.5 text-muted-foreground">{d.label}:</span>
                  {formatter ? formatter(d.value) : formatShort(d.value)}
                </Tooltip>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-1 text-[10px] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export const CHART_COLORS = ["#6c4ef5", "#10b981", "#f59e0b", "#ef4444", "#9b7bff", "#06b6d4", "#ec4899", "#64748b"];

export function DonutChart({
  data,
  formatter = (v) => String(v),
  centerLabel,
}: {
  data: Array<{ label: string; value: number }>;
  formatter?: (v: number) => string;
  centerLabel?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="block h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth="16" />
          {total > 0 &&
            data.map((d, i) => {
              const frac = d.value / total;
              const dash = frac * C;
              const el = (
                <circle
                  key={d.label}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={hover === i ? 20 : 16}
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += dash;
              return el;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold">{hover !== null ? formatter(data[hover]?.value ?? 0) : formatter(total)}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {hover !== null ? data[hover]?.label : centerLabel ?? "Total"}
          </span>
        </div>
      </div>
      <ul className="min-w-35 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={d.label}
            className={cn("flex cursor-default items-center justify-between gap-3 rounded px-2 py-1 text-sm", hover === i && "bg-muted")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate capitalize text-muted-foreground">{d.label.replaceAll("_", " ")}</span>
            </span>
            <span className="font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-sm text-muted-foreground">No data yet</li>}
      </ul>
    </div>
  );
}

/** Horizontal progress-bar rows — used for category/action breakdowns. */
export function ProgressRows({
  data,
  formatter = (v) => String(v),
  color = "var(--color-primary)",
}: {
  data: Array<{ label: string; value: number }>;
  formatter?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="group">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate capitalize text-muted-foreground group-hover:text-foreground">
              {d.label.replaceAll("_", " ").replaceAll(".", " ")}
            </span>
            <span className="font-semibold tabular-nums">{formatter(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-300 group-hover:opacity-80"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] || color }}
            />
          </div>
        </li>
      ))}
      {data.length === 0 && <li className="text-sm text-muted-foreground">No data yet</li>}
    </ul>
  );
}
