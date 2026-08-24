/**
 * Fire-and-forget anonymous stats beacons. No cookies, no identifiers, no file data.
 * API URL from VITE_STATS_API_URL (baked in at build for GitHub Pages).
 */

export type StatsEvent = "page_view" | "visual_exported";

const PAGE_VIEW_SESSION_KEY = "mozayk_stats_page_view_sent";

export function statsApiUrl(): string {
  const url = import.meta.env.VITE_STATS_API_URL;
  return typeof url === "string" ? url.trim() : "";
}

function postEvent(event: StatsEvent): void {
  const api = statsApiUrl();
  if (!api) return;

  fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
    mode: "cors",
  }).catch(() => {});
}

/**
 * One page-visit signal per tab session. Uses sessionStorage only
 * (cleared when the tab closes); the flag is not sent to the server.
 */
export function recordPageView(): void {
  try {
    if (sessionStorage.getItem(PAGE_VIEW_SESSION_KEY) === "1") return;
    sessionStorage.setItem(PAGE_VIEW_SESSION_KEY, "1");
  } catch {
    /* Private mode / blocked storage — count this load anyway. */
  }
  postEvent("page_view");
}

export function recordVisualExported(): void {
  postEvent("visual_exported");
}
