import { api } from "./api";
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
    const core = document.querySelector(boundary === 'public' ? '.recommendation-title' : '.dashboard-recommendation');
    if (!core) { frame = requestAnimationFrame(observeCore); return; }
    observer = new IntersectionObserver(entries => {
      coreVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .5);
      visibility();
    }, {threshold:[0,.5,1]});
    observer.observe(core);
  }
  frame = requestAnimationFrame(observeCore);
  return dispose;
}
