export type InactivityBucket = 'MINUTES_10_60' | 'HOURS_1_24' | 'DAYS_1_PLUS';
export function inactivityBucket(milliseconds: number): InactivityBucket | null {
  if (!Number.isFinite(milliseconds) || milliseconds <= 600000) return null;
  return milliseconds < 3600000 ? 'MINUTES_10_60' : milliseconds < 86400000 ? 'HOURS_1_24' : 'DAYS_1_PLUS';
}
/** Per-identity in-memory observations, not authoritative progress or duration. */
export function createRunObservationState() {
  const runs = new Map<string, { steps: Set<string>; leftAt: number | null }>();
  function state(pin: string) {
    let value = runs.get(pin);
    if (!value) {
      if (runs.size >= 100) runs.delete(runs.keys().next().value!);
      value = { steps: new Set(), leftAt: null }; runs.set(pin, value);
    }
    return value;
  }
  return {
    clear() { runs.clear(); },
    leave(pin: string, now: number) { const value = state(pin); if (value.leftAt === null) value.leftAt = now; },
    visible(pin: string, step: string, now: number) {
      const value = state(pin), viewed = !value.steps.has(step);
      const resumed = value.leftAt === null ? null : inactivityBucket(now - value.leftAt);
      value.steps.add(step); value.leftAt = null;
      return { viewed, resumed };
    },
  };
}
