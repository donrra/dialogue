/** Formatting helpers for durations, dates and file sizes. */

/** 65000 -> "1:05", 3725000 -> "1:02:05". */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Friendly Danish relative-ish date label. */
export function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `I dag ${time}`;
  if (isYesterday) return `I går ${time}`;
  return (
    d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }) + ` ${time}`
  );
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}
