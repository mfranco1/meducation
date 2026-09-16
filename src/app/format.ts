export function formatDuration(ms: number): string {
  const minutes = String(Math.floor(ms / 60000)).padStart(2, '0');
  const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
