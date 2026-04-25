/**
 * Cohort retention display: null/undefined = future (—), 0 = "0.0%", else percentage.
 * One decimal place for all numeric values (audit: consistent decimal precision).
 */
export function formatCohortCellValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(1)}%`
}
