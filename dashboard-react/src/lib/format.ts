// Tiny number-formatting helpers used across the UI. All are pure functions
// so they're easy to unit-test if you ever want to.

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Map a 0..100 score to a Tailwind text color class. */
export function scoreColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'text-slate-400';
  if (score < 60) return 'text-rose-400';
  if (score < 80) return 'text-amber-400';
  return 'text-emerald-400';
}

/** Map a 0..100 score to a background tint for badges/cards. */
export function scoreBadgeClass(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return 'bg-slate-800 text-slate-300 border-slate-700';
  }
  if (score < 60) return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
  if (score < 80) return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
}
