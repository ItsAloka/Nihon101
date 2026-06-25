// report.js — lightweight client-error sink. Leaves a structured console
// breadcrumb for every error and, when a sink URL is configured at build time
// (PUBLIC_ERR_SINK), beacons it to the backend so a crash is learned from a
// metric, not an angry reader. No-ops the network side until the sink is set.
// Also installs the global last-resort handlers for anything that escapes every
// React error boundary. SSR-safe (guards `window`).
const SINK = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.PUBLIC_ERR_SINK) || "";
let lastSent = 0;

export function reportClientError(err, ctx = {}) {
  try {
    const payload = {
      msg: String((err && err.message) || err || "unknown"),
      stack: err && err.stack ? String(err.stack).slice(0, 2000) : null,
      url: typeof location !== "undefined" ? location.href : null,
      ts: Date.now(),
      ...ctx,
    };
    console.error("[n101:client-error]", payload);
    // Throttle network reports to 1 / 2s so a render loop can't beacon-storm.
    if (SINK && typeof navigator !== "undefined" && Date.now() - lastSent > 2000) {
      lastSent = Date.now();
      navigator.sendBeacon?.(SINK, JSON.stringify(payload));
    }
  } catch { /* the reporter must never throw */ }
}

if (typeof window !== "undefined" && !window.__n101ErrHooked) {
  window.__n101ErrHooked = true;
  window.addEventListener("error", (e) => reportClientError(e.error || e.message, { kind: "window.onerror" }));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason, { kind: "unhandledrejection" }));
}
