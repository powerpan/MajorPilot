import { api } from "./api";
import { identityRequest } from "../stores/auth";

export function sendPrivateObservation(
  eventName:
    | "report.viewed"
    | "comparison_report.viewed"
    | "report.printed"
    | "next_recommendation.viewed",
  id: string,
) {
  const ticket = identityRequest();
  const event = {
    clientEventId: crypto.randomUUID(),
    eventName,
    eventVersion: "v1",
    occurredAt: new Date().toISOString(),
    visibleDurationMs: 1000,
    contextType:
      eventName === "next_recommendation.viewed"
        ? "RECOMMENDATION"
        : "REPORT_VERSION",
    contextPublicId: id,
    properties: {},
  };
  void api("/api/app/v1/events", {
    method: "POST",
    body: { events: [event] },
    signal: ticket.signal,
  })
    .catch(() => {
      /* Analytics failure cannot block private reading. */
    })
    .finally(() => ticket.finish());
}
/** Continuous visible intersection for one second, never a GET or a hidden-tab timer. */
export function observePrivateContent(element: Element, effective: () => void) {
  let stopped = false,
    visible = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  function change() {
    clearTimeout(timer);
    if (!stopped && visible && document.visibilityState === "visible")
      timer = setTimeout(() => {
        if (stopped) return;
        effective();
        dispose();
      }, 1000);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some(
        (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
      );
      change();
    },
    { threshold: [0, 0.5, 1] },
  );
  function dispose() {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener("visibilitychange", change);
    window.removeEventListener("mp:logout", dispose);
  }
  observer.observe(element);
  document.addEventListener("visibilitychange", change);
  window.addEventListener("mp:logout", dispose);
  return dispose;
}
export function observeRecommendation(id: string, boundary: "app" | "public") {
  let disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    started = 0,
    coreVisible = false,
    frame = 0;
  let observer: IntersectionObserver | undefined;
  const event = {
    clientEventId: crypto.randomUUID(),
    eventName: "recommendation.viewed",
    eventVersion: "v1",
    occurredAt: "",
    visibleDurationMs: 1000,
    contextType: "RECOMMENDATION",
    contextPublicId: id,
    properties: {},
  };
  async function send() {
    if (disposed) return;
    try {
      await api(`/api/${boundary}/v1/events`, {
        method: "POST",
        body: { events: [event] },
      });
    } catch {
      if (!disposed && Date.now() - started < 60000)
        timer = setTimeout(() => void send(), 10000);
    }
  }
  function visibility() {
    clearTimeout(timer);
    if (!disposed && coreVisible && document.visibilityState === "visible")
      timer = setTimeout(() => {
        event.occurredAt = new Date().toISOString();
        started = Date.now();
        document.removeEventListener("visibilitychange", visibility);
        observer?.disconnect();
        void send();
      }, 1000);
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("mp:logout", dispose);
  }
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("mp:logout", dispose);
  function observeCore() {
    if (disposed) return;
    const core = document.querySelector(
      boundary === "public"
        ? ".recommendation-title"
        : ".dashboard-recommendation",
    );
    if (!core) {
      frame = requestAnimationFrame(observeCore);
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        coreVisible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
        );
        visibility();
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(core);
  }
  frame = requestAnimationFrame(observeCore);
  return dispose;
}
