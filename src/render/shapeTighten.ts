/**
 * Chrome (Blink) often shows a stronger AA fringe / seam bleed than Brave.
 * Pull shapes in by 0.25px on Chrome only — leave Brave and other browsers alone.
 */
export function chromeShapeTightenPx(): number {
  if (typeof navigator === "undefined") return 0;
  if ("brave" in navigator) return 0;
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua) || /Edg\//.test(ua) || /OPR\//.test(ua)) return 0;
  return 0.25;
}
