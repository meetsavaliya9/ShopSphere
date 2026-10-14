export function StatCard({ title, value, description, icon: Icon, trend, trendLabel, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition-all hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      <div className="flex items-center justify-between space-y-0 pb-2">
        <p className="text-xs font-medium tracking-tight text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{title}</p>
        {Icon && (
          <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 dark:bg-zinc-850 dark:text-zinc-300">
            <Icon size={16} strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</h3>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              trend.startsWith("+")
                ? "text-emerald-600 dark:text-emerald-400"
                : trend.startsWith("-")
                ? "text-rose-600 dark:text-rose-400"
                : "text-zinc-500"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
      {(description || trendLabel) && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
          {description || trendLabel}
        </p>
      )}
    </div>
  );
}
