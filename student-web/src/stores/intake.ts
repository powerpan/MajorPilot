import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, ApiError, stableOperation } from "../lib/api";
import { identityChanged, identityRequest, onIdentityChange } from "./auth";
import type { ProfileSubmission } from "../lib/profile";
import type {
  Answers,
  AnswerValue,
  Intake,
  Questionnaire,
  Recommendation,
} from "../types";
const POINTER = "mp:intake-pointer:v1",
  DRAFT = "mp:intake-draft:v1";
interface Cache {
  view: Intake;
  answers: Answers;
  dirty: string[];
  expiresAt: string;
  definition?: Questionnaire;
  pendingFinish?: FinishRequest | null;
}
interface FinishRequest { body: { questionnaireVersion: string; expectedRevision: number; answers: Answers }; key: string }
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function read<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}
export function intakePointer() {
  const p = read<{ id: string; expiresAt: string; step: string }>(
    localStorage,
    POINTER,
  );
  if (p && Date.parse(p.expiresAt) <= Date.now()) {
    localStorage.removeItem(POINTER);
    sessionStorage.removeItem(DRAFT);
    return null;
  }
  return p && Date.parse(p.expiresAt) > Date.now() ? p : null;
}
export const useIntake = defineStore("intake", () => {
  const definition = ref<Questionnaire | null>(null),
    view = ref<Intake | null>(null),
    answers = ref<Answers>({}),
    dirty = ref<string[]>([]),
    recommendation = ref<Recommendation | null>(null);
  const pendingFinish = ref<FinishRequest | null>(null);
  const saving = ref(false),
    savedAt = ref(""),
    failure = ref<unknown>(null),
    conflict = ref(false),
    loading = ref(false);
  let operation = stableOperation();
  const hasUnsaved = computed(() => dirty.value.length > 0);
  let generation = 0;
  let initialized = false,
    queue: Promise<void> | null = null;
  let initializing: Promise<void> | null = null;
  function persist() {
    if (!view.value) return;
    try {
      localStorage.setItem(
        POINTER,
        JSON.stringify({
          id: view.value.intakeSessionId,
          expiresAt: view.value.expiresAt,
          step: view.value.lastStepKey || "step-1",
        }),
      );
      sessionStorage.setItem(
        DRAFT,
        JSON.stringify({
          view: view.value,
          answers: answers.value,
          dirty: dirty.value,
          expiresAt: view.value.expiresAt,
          definition: definition.value,
          pendingFinish: pendingFinish.value,
        }),
      );
    } catch {
      /* Storage denied: server saving remains authoritative. */
    }
  }
  function adopt(next: Intake) {
    view.value = next;
    answers.value = clone(next.answers);
    dirty.value = [];
    failure.value = null;
    conflict.value = false;
    persist();
  }
  async function init(create = false) {
    if (initialized && view.value) return;
    if (initializing) {
      await initializing;
      if (!create || view.value) return;
    }
    const pending = initialize(create);
    initializing = pending;
    try { await pending; } finally { if (initializing === pending) initializing = null; }
  }
  async function initialize(create: boolean) {
    const ticket = identityRequest();
    loading.value = true;
    try {
      const pointer = intakePointer(),
        cached = read<Cache>(sessionStorage, DRAFT);
      if (
        pointer &&
        cached?.view.intakeSessionId === pointer.id &&
        Date.parse(cached.expiresAt) > Date.now()
      ) {
        view.value = cached.view;
        answers.value = cached.answers;
        dirty.value = cached.dirty;
        if (cached.definition) definition.value = cached.definition;
        pendingFinish.value = cached.pendingFinish || null;
      }
      const currentDefinition = await api<Questionnaire>(
        "/api/public/v1/questionnaires/current", { signal: ticket.signal },
      );
      ticket.assertCurrent();
      definition.value = currentDefinition;
      if (pointer) {
        if (
          cached?.view.intakeSessionId === pointer.id &&
          Date.parse(cached.expiresAt) > Date.now()
        ) {
          view.value = cached.view;
          answers.value = cached.answers;
          dirty.value = cached.dirty;
        }
        const latest = await api<Intake>(
          `/api/public/v1/intake-sessions/${encodeURIComponent(pointer.id)}`, { signal: ticket.signal },
        );
        ticket.assertCurrent();
        if (pendingFinish.value) {
          view.value = latest;
          answers.value = clone(pendingFinish.value.body.answers);
          dirty.value = [];
          conflict.value = false;
          persist();
        } else if (dirty.value.length) {
          if (latest.revision !== view.value?.revision) {
            conflict.value = true;
            failure.value = new ApiError(
              409,
              "INTAKE_REVISION_CONFLICT",
              [],
              latest.revision,
            );
          }
        } else adopt(latest);
      } else if (create) {
        const created = await api<Intake>("/api/public/v1/intake-sessions", {
            method: "POST",
            signal: ticket.signal,
            body: {
              questionnaireVersion: definition.value.questionnaireVersion,
            },
          });
        ticket.assertCurrent();
        adopt(created);
      }
      initialized = true;
    } catch (cause) {
      ticket.assertCurrent();
      if (cause instanceof ApiError &&
          ([401, 404].includes(cause.status) || ["INTAKE_EXPIRED", "INTAKE_ALREADY_CLAIMED"].includes(cause.code))) identityChanged("CLAIM");
      failure.value = cause;
      throw cause;
    } finally {
      if (ticket.current()) loading.value = false;
      ticket.finish();
    }
  }
  async function restart() {
    identityChanged("CLAIM");
    await init(true);
  }
  function setAnswer(step: string, key: string, value: AnswerValue) {
    if (pendingFinish.value) return;
    answers.value = { ...answers.value, [key]: value };
    if (!dirty.value.includes(step)) dirty.value.push(step);
    failure.value = null;
    persist();
  }
  async function flush() {
    if (pendingFinish.value) return;
    if (queue) {
      await queue;
      if (!dirty.value.length) return;
    }
    if (!view.value || conflict.value) return;
    const requestGeneration = generation;
    const ticket = identityRequest();
    queue = (async () => {
      saving.value = true;
      try {
        while (dirty.value.length) {
          const step = dirty.value[0]!,
            page = definition.value?.pages.find((p) => p.stepKey === step);
          if (!page) break;
          const part: Answers = {};
          for (const field of page.fields) {
            if (field.key in answers.value)
              part[field.key] = clone(answers.value[field.key]!);
          }
          const before = JSON.stringify(part);
          const next = await api<Intake>(
            `/api/public/v1/intake-sessions/${view.value!.intakeSessionId}/draft`,
            {
              method: "PUT",
              signal: ticket.signal,
              body: {
                questionnaireVersion: definition.value!.questionnaireVersion,
                expectedRevision: view.value!.revision,
                stepKey: step,
                answers: part,
              },
            },
          );
          ticket.assertCurrent();
          if (requestGeneration !== generation) throw new ApiError(409, "IDENTITY_CHANGED");
          view.value = next;
          savedAt.value = new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const current: Answers = {};
          for (const field of page.fields) {
            if (field.key in answers.value)
              current[field.key] = answers.value[field.key]!;
          }
          if (JSON.stringify(current) === before)
            dirty.value = dirty.value.filter((key) => key !== step);
          failure.value = null;
          persist();
        }
      } catch (cause) {
        ticket.assertCurrent();
        if (requestGeneration !== generation) throw new ApiError(409, "IDENTITY_CHANGED");
        failure.value = cause;
        conflict.value =
          cause instanceof ApiError &&
          cause.code === "INTAKE_REVISION_CONFLICT";
        throw cause;
      } finally {
        ticket.finish();
        if (requestGeneration === generation && ticket.current()) {
          saving.value = false;
          queue = null;
        }
      }
    })();
    return queue;
  }
  async function loadServer() {
    if (!view.value) return;
    const ticket = identityRequest();
    try {
      const latest = await api<Intake>(
        `/api/public/v1/intake-sessions/${view.value.intakeSessionId}`, { signal: ticket.signal },
      );
      ticket.assertCurrent();
      adopt(latest);
    } catch (cause) { ticket.assertCurrent(); throw cause; }
    finally { ticket.finish(); }
  }
  async function submit() {
    const ticket = identityRequest();
    try {
      await flush();
      ticket.assertCurrent();
      if (!view.value || !definition.value || conflict.value)
        throw new Error("请先处理草稿保存状态。");
      const body = {
        questionnaireVersion: definition.value.questionnaireVersion,
        expectedRevision: view.value.revision,
        answers: answers.value,
      };
      const result = await api<Recommendation>(
        `/api/public/v1/intake-sessions/${view.value.intakeSessionId}/submit`,
        { method: "POST", body, key: operation(body), signal: ticket.signal },
      );
      ticket.assertCurrent();
      recommendation.value = result;
      view.value.status = "SUBMITTED";
      view.value.revision += 1;
      view.value.recommendationId = result.recommendationId;
      persist();
      return result;
    } catch (cause) { ticket.assertCurrent(); throw cause; }
    finally { ticket.finish(); }
  }
  async function finish() {
    const ticket = identityRequest();
    try {
      if (!pendingFinish.value) {
        await flush(); ticket.assertCurrent();
        if (!view.value || !definition.value || conflict.value) throw new Error("请先处理草稿保存状态。");
        const body = { questionnaireVersion: definition.value.questionnaireVersion, expectedRevision: view.value.revision, answers: clone(answers.value) };
        pendingFinish.value = { body, key: crypto.randomUUID() }; persist();
      }
      const request = pendingFinish.value;
      const result = await api<ProfileSubmission>(`/api/public/v1/intake-sessions/${view.value!.intakeSessionId}/finish`, { method: "POST", body: request.body, key: request.key, signal: ticket.signal });
      ticket.assertCurrent(); recommendation.value = result.recommendation;
      view.value!.status = "SUBMITTED"; view.value!.revision = request.body.expectedRevision + 1;
      view.value!.recommendationId = result.recommendation?.recommendationId || null;
      pendingFinish.value = null; dirty.value = []; persist(); return result;
    } catch (cause) {
      ticket.assertCurrent();
      if (cause instanceof ApiError && cause.status > 0 && cause.status < 500 && cause.code !== "REQUEST_IN_PROGRESS") pendingFinish.value = null;
      failure.value = cause;
      conflict.value = cause instanceof ApiError && cause.code === "INTAKE_REVISION_CONFLICT";
      persist(); throw cause;
    } finally { ticket.finish(); }
  }
  async function loadRecommendation() {
    const ticket = identityRequest();
    try {
      await init();
      ticket.assertCurrent();
      if (!view.value)
        throw new Error("请先完成基本信息填写，才能获得真实建议。");
      if (view.value.status === "SUBMITTED" && view.value.recommendationId === null) {
        recommendation.value = null;
        return;
      }
      const result = await api<Recommendation>(
        `/api/public/v1/intake-sessions/${view.value.intakeSessionId}/recommendation`, { signal: ticket.signal },
      );
      ticket.assertCurrent();
      recommendation.value = result;
    } catch (cause) { ticket.assertCurrent(); throw cause; }
    finally { ticket.finish(); }
  }
  function claimed() {
    identityChanged("CLAIM");
  }
  onIdentityChange(() => {
    generation += 1;
    dirty.value = [];
    view.value = null;
    answers.value = {};
    recommendation.value = null;
    initialized = false;
    initializing = null;
    queue = null;
    operation = stableOperation();
    pendingFinish.value = null;
    loading.value = false;
    saving.value = false;
    failure.value = null;
    conflict.value = false;
  });
  return {
    definition,
    view,
    answers,
    dirty,
    recommendation,
    saving,
    savedAt,
    failure,
    conflict,
    loading,
    hasUnsaved,
    init,
    restart,
    setAnswer,
    flush,
    loadServer,
    submit,
    finish,
    pendingFinish,
    loadRecommendation,
    claimed,
  };
});
