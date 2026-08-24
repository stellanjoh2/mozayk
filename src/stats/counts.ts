export function parseCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export function formatCount(value: unknown): string {
  return new Intl.NumberFormat("en-US").format(parseCount(value));
}
