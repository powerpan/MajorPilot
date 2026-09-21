import { api } from './api';
import { observePrivateContent } from './events';
import { identityRequest, onIdentityChange } from '../stores/auth';
import { createRunObservationState } from './run-observation-state';
const state = createRunObservationState();
onIdentityChange(() => state.clear());
export function leaveRunObservation(pin: string) { state.leave(pin, Date.now()); }
export function observeRunStep(element: Element, runId: string, taskVersionId: string, stepKey: string) {
  return observePrivateContent(element, () => {
    const observed = state.visible(`${runId}:${taskVersionId}`, stepKey, Date.now());
    const base = { eventVersion: 'v1', occurredAt: new Date().toISOString(), visibleDurationMs: 1000,
      contextType: 'EXPERIENCE_RUN', contextPublicId: runId };
    const events = [];
    if (observed.viewed) events.push({ ...base, clientEventId: crypto.randomUUID(), eventName: 'experience.step.viewed', properties: { stepKey } });
    if (observed.resumed) events.push({ ...base, clientEventId: crypto.randomUUID(), eventName: 'experience.run.resumed', properties: { stepKey, inactivityBucket: observed.resumed } });
    if (!events.length) return;
    const ticket = identityRequest();
    void api('/api/app/v1/events', { method: 'POST', body: { events }, signal: ticket.signal })
      .catch(() => { /* Missing observations are a coverage gap, never fabricated. */ }).finally(() => ticket.finish());
  });
}
