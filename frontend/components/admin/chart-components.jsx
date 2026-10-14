"use client";

import { useState } from "react";

const CURRENCY = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

function formatPeriod(value) {
  const date = /^\d{4}-\d{2}$/.test(value)
    ? new Date(`${value}-01T00:00:00Z`)
    : new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    ...(value.length === 7 ? { year: "2-digit" } : { day: "numeric" }),
    timeZone: "UTC"
  }).format(date);
}

export function SalesBarChart({ data = [], height = 280 }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (!data.length) {
    return (
      <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400 dark:border-zinc-800">
        No paid sales in this period
      </div>
    );
  }

  const width = Math.max(760, data.length * 38);
  const chartHeight = Math.max(220, height);
  const left = 58;
  const right = 42;
  const top = 16;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = chartHeight - top - bottom;
  const maxRevenue = Math.max(1, ...data.map((item) => Number(item.revenue) || 0));
  const maxSales = Math.max(1, ...data.map((item) => Number(item.salesCount) || 0));
  const step = plotWidth / data.length;
  const revenueY = (value) => top + plotHeight - ((Number(value) || 0) / maxRevenue) * plotHeight;
  const salesY = (value) => top + plotHeight - ((Number(value) || 0) / maxSales) * plotHeight;
  const orderLine = data.map((item, index) =>
    `${index === 0 ? "M" : "L"} ${(left + step * (index + 0.5)).toFixed(1)} ${salesY(item.salesCount).toFixed(1)}`
  ).join(" ");
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-800 dark:bg-zinc-200" />Revenue (INR)</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-3 bg-emerald-600" />Paid orders</span>
        <span className="ml-auto">Hover or focus a point for details</span>
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Revenue and paid orders over time"
          viewBox={`0 0 ${width} ${chartHeight}`}
          className="block w-full min-w-[760px]"
          style={{ height: chartHeight }}
        >
          {[0, 1, 2, 3].map((tick) => {
            const y = top + (plotHeight * tick) / 3;
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeDasharray={tick === 3 ? undefined : "3 4"} />
                <text x={left - 8} y={y + 4} textAnchor="end" className="fill-zinc-400 text-[10px]">₹{CURRENCY.format((maxRevenue * (3 - tick)) / 3)}</text>
                <text x={width - right + 8} y={y + 4} textAnchor="start" className="fill-zinc-400 text-[10px]">{Math.round((maxSales * (3 - tick)) / 3)}</text>
              </g>
            );
          })}
          {data.map((item, index) => {
            const x = left + step * (index + 0.5);
            const barWidth = Math.max(3, Math.min(22, step * 0.58));
            const revenueTop = revenueY(item.revenue);
            const revenueHeight = Math.max(1, top + plotHeight - revenueTop);
            return (
              <g
                key={item.date}
                tabIndex={0}
                role="img"
                aria-label={`${formatPeriod(item.date)}: ₹${Number(item.revenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })} revenue, ${item.salesCount || 0} paid orders, ${item.unitsSold || 0} units sold`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                className="cursor-pointer outline-none"
              >
                <title>{`${formatPeriod(item.date)} · Revenue ₹${Number(item.revenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })} · ${item.salesCount || 0} paid orders · ${item.unitsSold || 0} units`}</title>
                <rect
                  x={x - barWidth / 2}
                  y={revenueTop}
                  width={barWidth}
                  height={revenueHeight}
                  rx="2"
                  className={activeIndex === index ? "fill-zinc-950 dark:fill-white" : "fill-zinc-800/80 dark:fill-zinc-300/80"}
                />
                <circle
                  cx={x}
                  cy={salesY(item.salesCount)}
                  r={activeIndex === index ? 5 : 3.5}
                  className="fill-emerald-600 stroke-white dark:stroke-zinc-950"
                  strokeWidth="2"
                />
                {index % labelEvery === 0 && (
                  <text x={x} y={chartHeight - 15} textAnchor="middle" className="fill-zinc-500 text-[10px]">
                    {formatPeriod(item.date)}
                  </text>
                )}
              </g>
            );
          })}
          <path d={orderLine} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((item, index) => {
            const x = left + step * (index + 0.5);
            return <circle key={`point-${item.date}`} cx={x} cy={salesY(item.salesCount)} r="2" fill="#059669" pointerEvents="none" />;
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
        <span>Revenue (₹)</span>
        <span>Paid orders</span>
      </div>
    </div>
  );
}

export function StatusDistribution({ distribution = [] }) {
  const total = distribution.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400 dark:border-zinc-800">
        No order status data available
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {distribution.map((item) => {
          const percent = (item.value / total) * 100;
          if (percent === 0) return null;
          return (
            <div
              key={item.status}
              style={{ width: `${percent}%`, backgroundColor: item.color }}
              className="h-full transition-all duration-300"
              title={`${item.name}: ${item.value} (${percent.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
        {distribution.map((item) => {
          const percent = ((item.value / total) * 100).toFixed(0);
          return (
            <div key={item.status} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 dark:border-zinc-850 dark:bg-zinc-900/50">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{item.name}</p>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{item.value} <span className="text-[10px] font-normal text-zinc-400">({percent}%)</span></p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
