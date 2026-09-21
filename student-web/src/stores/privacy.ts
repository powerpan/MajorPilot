import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, ApiError, errorText, privateDownload, stableOperation } from "../lib/api";
import { identityRequest, onIdentityChange, useAuth } from "./auth";
import type { Consent } from "../types";
import type { PersonalExport, ExportScope, DeletionRequest, DeletionReceipt } from "../types/privacy";

const base = "/api/app/v1";
export const usePrivacy = defineStore("privacy", () => {
  const auth = useAuth();
  const consents = ref<Consent[]>([]), exports = ref<PersonalExport[]>([]), currentExport = ref<PersonalExport | null>(null),
    deletion = ref<DeletionRequest | null>(null), busy = ref(false), error = ref("");
  let exportKey = stableOperation(), deletionKey = stableOperation();
  const research = computed(() => consents.value.filter(row => row.documentType === "RESEARCH").at(-1));
  onIdentityChange(() => {
    consents.value = []; exports.value = []; currentExport.value = null; deletion.value = null;
    busy.value = false; error.value = "";
    exportKey = stableOperation(); deletionKey = stableOperation();
  });
  async function perform<T>(operation: (ticket: ReturnType<typeof identityRequest>) => Promise<T>, expire = true): Promise<T> {
    const ticket = identityRequest(); busy.value = true; error.value = "";
    try { const result = await operation(ticket); ticket.assertCurrent(); return result; }
    catch (cause) {
      if (ticket.current()) {
        if (expire && cause instanceof ApiError && cause.status === 401) auth.expire();
        else error.value = errorText(cause);
      }
      throw cause;
    } finally { if (ticket.current()) busy.value = false; ticket.finish(); }
  }
  async function load() {
    return perform(async ticket => {
      await auth.refresh(true); ticket.assertCurrent();
      if (!auth.me) throw new ApiError(401, "AUTH_REQUIRED");
      const [result, files] = await Promise.all([
        api<Consent[]>(`${base}/consents`, { signal: ticket.signal }),
        api<{ items: PersonalExport[] }>(`${base}/data-export-requests`, { signal: ticket.signal }),
      ]);
      ticket.assertCurrent(); consents.value = result; exports.value = files.items;
    });
  }
  async function withdraw() {
    return perform(async ticket => {
      await api(`${base}/consents/research/withdraw`, { method: "POST", body: {}, signal: ticket.signal });
      const result = await api<Consent[]>(`${base}/consents`, { signal: ticket.signal });
      ticket.assertCurrent(); consents.value = result;
    });
  }
  async function changeEmail(currentPassword: string, newEmail: string) {
    return perform(ticket => api<{ accepted: true }>(`${base}/me/email`, {
      method: "PATCH", body: { currentPassword, newEmail }, signal: ticket.signal,
    }));
  }
  async function changePassword(currentPassword: string, newPassword: string) {
    const boundary = identityRequest();
    try {
      await perform(ticket => api<void>(`${base}/me/password`, {
        method: "PATCH", body: { currentPassword, newPassword }, signal: ticket.signal,
      }));
      boundary.assertCurrent(); auth.clear();
    } finally { boundary.finish(); }
  }
  async function requestExport(scope: ExportScope) {
    return perform(async ticket => {
      const body = { scope };
      const result = await api<PersonalExport>(`${base}/data-export-requests`, {
        method: "POST", body, key: exportKey(body), signal: ticket.signal,
      });
      ticket.assertCurrent(); currentExport.value = result;
      exports.value = [result, ...exports.value.filter(row => row.exportId !== result.exportId)].slice(0, 20);
      exportKey = stableOperation(); return result;
    });
  }
  async function refreshExport(id = currentExport.value?.exportId) {
    if (!id) return;
    return perform(async ticket => {
      const result = await api<PersonalExport>(`${base}/data-export-requests/${id}`, { signal: ticket.signal });
      ticket.assertCurrent(); currentExport.value = result;
      exports.value = exports.value.map(row => row.exportId === result.exportId ? result : row); return result;
    });
  }
  async function download() {
    const id = currentExport.value?.exportId;
    if (!id) return;
    await perform(async ticket => {
      const blob = await privateDownload(`${base}/data-export-requests/${id}/download`, ticket.signal);
      ticket.assertCurrent();
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "majorpilot-personal.zip"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function requestDeletion() {
    deletion.value = null;
    return perform(async ticket => {
      const result = await api<DeletionRequest>(`${base}/account-deletion-requests`, {
        method: "POST", body: {}, key: deletionKey({}), signal: ticket.signal,
      });
      ticket.assertCurrent(); deletion.value = result; return result;
    });
  }
  async function confirmDeletion(currentPassword: string) {
    const request = deletion.value;
    if (!request) throw new ApiError(409, "REQUEST_FAILED");
    const boundary = identityRequest();
    let confirmed = false;
    try {
      try { await perform(async ticket => {
        const body = { currentPassword };
        const next = await api<DeletionRequest>(`${base}/account-deletion-requests/${request.requestId}/confirm`, {
          method: "POST", body, key: crypto.randomUUID(), signal: ticket.signal,
        });
        ticket.assertCurrent(); confirmed = !!next.confirmedAt;
      }, false); } catch (cause) {
      // A lost confirmation response can accompany revoked normal cookies. The
      // pre-issued receipt cookie, not the old Session, resolves uncertainty.
      if (cause instanceof ApiError && [0, 401].includes(cause.status)) {
        boundary.assertCurrent();
        // A full POST timeout also expires its original signal. Preserve that
        // identity epoch fence, but give the recovery read its own deadline.
        const recovery = identityRequest();
        try {
          const receipt = await readDeletionReceipt(request.receiptId, recovery.signal).catch(() => null);
          boundary.assertCurrent(); recovery.assertCurrent();
          confirmed = !!receipt?.confirmedAt;
        } finally { recovery.finish(); }
      }
      if (!confirmed) throw cause;
      }
      boundary.assertCurrent();
      if (!confirmed) throw new ApiError(409, "REQUEST_IN_PROGRESS");
      auth.clear();
      return request.receiptId;
    } finally { boundary.finish(); }
  }
  return { consents, research, exports, currentExport, deletion, busy, error, load, withdraw, changeEmail, changePassword,
    requestExport, refreshExport, download, requestDeletion, confirmDeletion };
});
export function readDeletionReceipt(id: string, signal?: AbortSignal) {
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id)) throw new ApiError(404, "RESOURCE_NOT_FOUND");
  return api<DeletionReceipt>(`/api/public/v1/deletion-receipts/${id}`, { signal });
}
