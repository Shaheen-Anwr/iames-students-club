export interface DailyCount {
  date: string;
  count: number;
}

// Given raw {_id: 'YYYY-MM-DD', count}[] aggregation rows (which omit empty days), returns a
// dense series of the last `days` days including today, filling gaps with 0 -- used to turn a
// $group-by-date aggregation into a chart-ready series.
export function fillDailyCounts(rows: { _id: string; count: number }[], days: number): DailyCount[] {
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const result: DailyCount[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));

  for (let i = 0; i < days; i++) {
    const date = cursor.toISOString().slice(0, 10);
    result.push({ date, count: counts.get(date) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

// Start-of-day cutoff `days` ago, e.g. days=14 gives a 14-day window including today -- pass to a
// $match stage ahead of the $group that feeds fillDailyCounts.
export function daysAgoStart(days: number): Date {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  return since;
}

// A chart-ready daily series for the trailing `days` window, plus how many events fell in that
// window vs. the `days` window immediately before it -- so the admin console can show a
// period-over-period delta (▲/▼) next to the sparkline.
export interface TrendSeries {
  series: DailyCount[];
  current: number;
  previous: number;
}

// Mongo range match for the `days`-day window ending exactly where the current window (the one
// `daysAgoStart(days)` opens) begins -- i.e. the immediately-preceding comparison period.
export function previousWindowMatch(days: number): { $gte: Date; $lt: Date } {
  return { $gte: daysAgoStart(days * 2), $lt: daysAgoStart(days) };
}
