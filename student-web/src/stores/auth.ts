import { defineStore } from "pinia";
import { ref } from "vue";
import { api, ApiError } from "../lib/api";
import type { Me } from "../types";

type IdentityReason = "LOGIN" | "LOGOUT" | "CLAIM";
interface IdentityMessage { version: 1; reason: IdentityReason; nonce: string }
interface IdentityNotice { reason: IdentityReason; remote: boolean }
const SIGNAL = "mp:identity-signal:v1";
const listeners = new Set<(notice: IdentityNotice) => void>();
const requests = new Set<AbortController>();
const seen = new Set<string>();
let epoch = 0;
let channel: BroadcastChannel | null = null;

function clearLocalDraft() {
  // Only our exact namespaces; never clear the browser's whole storage.
  try { sessionStorage.removeItem("mp:intake-draft:v1"); } catch { /* Storage denied. */ }
  try { localStorage.removeItem("mp:intake-pointer:v1"); } catch { /* Storage denied. */ }
}
function remember(nonce: string) {
  if (seen.has(nonce)) return false;
  seen.add(nonce);
  if (seen.size > 64) seen.delete(seen.values().next().value!);
  return true;
}
function invalidate(notice: IdentityNotice) {
  epoch += 1;
  for (const controller of requests) controller.abort();
  requests.clear();
  clearLocalDraft();
  for (const listener of listeners) listener(notice);
  window.dispatchEvent(new Event("mp:logout"));
  window.dispatchEvent(new CustomEvent("mp:identity-cleared", { detail: notice }));
}
function receive(value: unknown) {
  if (!value || typeof value !== "object") return;
  const message = value as Partial<IdentityMessage>;
  if (message.version !== 1 || !["LOGIN", "LOGOUT", "CLAIM"].includes(message.reason || "") ||
      typeof message.nonce !== "string" || !/^[a-f0-9-]{36}$/.test(message.nonce) || !remember(message.nonce)) return;
  invalidate({ reason: message.reason!, remote: true });
}
try {
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("majorpilot-identity-v1");
    channel.addEventListener("message", event => receive(event.data));
  }
} catch { /* Storage events remain the fallback when channels are blocked. */ }
window.addEventListener("storage", event => {
  if (event.key !== SIGNAL || !event.newValue) return;
  try { receive(JSON.parse(event.newValue)); } catch { /* Ignore corrupt notifications. */ }
});

/** No account IDs, answers, credentials or email ever enter cross-tab messages. */
export function identityChanged(reason: IdentityReason) {
  const message: IdentityMessage = { version: 1, reason, nonce: crypto.randomUUID() };
  remember(message.nonce);
  invalidate({ reason, remote: false });
  try { channel?.postMessage(message); } catch { /* Fall back below. */ }
  // Also send the fallback so mixed supported/blocked tabs remain coherent.
  try { localStorage.setItem(SIGNAL, JSON.stringify(message)); localStorage.removeItem(SIGNAL); } catch { /* Storage denied. */ }
}
export function onIdentityChange(listener: (notice: IdentityNotice) => void) { listeners.add(listener); }
export function identityRequest() {
  const issuedAt = epoch;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
  requests.add(controller);
  return {
    signal,
    current: () => issuedAt === epoch,
    assertCurrent() { if (issuedAt !== epoch) throw new ApiError(409, "IDENTITY_CHANGED"); },
    finish() { requests.delete(controller); },
  };
}

export const useAuth = defineStore("auth", () => {
  const me = ref<Me | null>(null);
  const checked = ref(false);
  let request: Promise<void> | null = null;
  let refreshing: ReturnType<typeof identityRequest> | null = null;
  onIdentityChange(notice => {
    request = null;
    refreshing = null;
    // Claim ends the anonymous credential, not an already logged-in account.
    if (notice.reason !== "CLAIM") {
      me.value = null;
      checked.value = notice.reason === "LOGOUT";
    }
  });
  async function refresh(force = false) {
    if (checked.value && !force) return;
    if (request) return request;
    const ticket = identityRequest();
    refreshing = ticket;
    request = (async () => {
      try {
        const next = await api<Me>("/api/app/v1/me", { signal: ticket.signal });
        ticket.assertCurrent();
        me.value = next;
      } catch (cause) {
        ticket.assertCurrent();
        if (!(cause instanceof ApiError) || cause.status !== 401) throw cause;
        if (me.value) identityChanged("LOGOUT");
        me.value = null;
      } finally {
        if (ticket.current()) checked.value = true;
        ticket.finish();
        if (refreshing === ticket) { request = null; refreshing = null; }
      }
    })();
    return request;
  }
  async function login(email: string, password: string) {
    const ticket = identityRequest();
    try {
      const next = await api<Me>("/api/public/v1/auth/login", {
        method: "POST", body: { email, password }, signal: ticket.signal,
      });
      ticket.assertCurrent();
      ticket.finish();
      identityChanged("LOGIN");
      me.value = next;
      checked.value = true;
    } catch (cause) { ticket.assertCurrent(); throw cause; }
    finally { ticket.finish(); }
  }
  async function logout() {
    const ticket = identityRequest();
    try {
      await api<void>("/api/app/v1/auth/logout", { method: "POST", body: {}, signal: ticket.signal });
      ticket.assertCurrent();
      ticket.finish();
      clear();
    } catch (cause) { ticket.assertCurrent(); throw cause; }
    finally { ticket.finish(); }
  }
  function clear() { identityChanged("LOGOUT"); }
  return { me, checked, refresh, login, logout, clear };
});
