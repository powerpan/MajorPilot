import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api, ApiError, errorText, stableOperation } from "../lib/api";
import { identityRequest, onIdentityChange, useAuth } from "./auth";
import {
  readTaskDraft,
  writeTaskDraft,
  removeTaskDraft,
  type DraftKey,
  type TaskDraft,
} from "../lib/task-drafts";
import { execute } from "../execution";
import type {
  Answer,
  Execution,
  Hint,
  Reflection,
  Run,
  Sample,
  Saved,
  Step,
  TaskManifest,
} from "../types/workspace";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const base = "/api/app/v1/experience-runs";
export const useWorkspace = defineStore("workspace", () => {
  const auth = useAuth();
  const run = ref<Run | null>(null),
    manifest = ref<TaskManifest | null>(null),
    step = ref<Step | null>(null);
  const reflection = ref<Reflection | null>(null),
    sample = ref<Sample | null>(null),
    answer = ref<Answer>({});
  const error = ref(""),
    storageWarning = ref(""),
    loading = ref(false),
    busy = ref(false);
  const dirty = ref(false),
    saving = ref(false),
    conflict = ref(false),
    recovered = ref<TaskDraft | null>(null);
  const execution = ref<Execution | null>(null),
    executing = ref(false),
    executionError = ref("");
  const localEngine = ref(""),
    hints = ref<Hint[]>([]),
    hintBusy = ref(false),
    selectedStep = ref("");
  const iterationNotice = ref("");
  const connectionOnline = ref(navigator.onLine);
  let generation = 0,
    selectionGeneration = 0,
    edits = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let savePromise: Promise<boolean> | null = null,
    workerController: AbortController | null = null;
  const keyers = new Map<string, ReturnType<typeof stableOperation>>();
  const reflectionMode = computed(() => selectedStep.value === "reflection");
  const readOnly = computed(
    () =>
      !run.value ||
      run.value.readOnly ||
      (reflectionMode.value
        ? reflection.value?.readOnly
        : step.value?.readOnly) ||
      conflict.value,
  );
  const saveLabel = computed(() =>
    conflict.value
      ? "版本冲突"
      : saving.value
        ? "保存中…"
        : dirty.value
          ? connectionOnline.value
            ? "本机待同步"
            : "离线待同步"
          : recovered.value
            ? "发现本机草稿"
            : "已保存",
  );
  const resultStale = computed(
    () =>
      !!execution.value &&
      (dirty.value || execution.value.appliedToRevision !== step.value?.revision),
  );
  function requestKey(operation: string, body: unknown) {
    let keyer = keyers.get(operation);
    if (!keyer) {
      keyer = stableOperation();
      keyers.set(operation, keyer);
    }
    return keyer(body);
  }
  async function request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      key?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    const issuedAt = generation,
      ticket = identityRequest();
    try {
      const result = await api<T>(path, {
        ...options,
        signal: options.signal
          ? AbortSignal.any([ticket.signal, options.signal])
          : ticket.signal,
      });
      ticket.assertCurrent();
      if (issuedAt !== generation) throw new ApiError(409, "IDENTITY_CHANGED");
      return result;
    } finally {
      ticket.finish();
    }
  }
  function draftKey(): DraftKey | null {
    if (!auth.me || !run.value?.taskVersionId || !selectedStep.value)
      return null;
    return {
      owner: auth.me.studentId,
      runId: run.value.runId,
      stepKey: selectedStep.value,
      taskVersion: run.value.taskVersionId,
    };
  }
  const revision = () =>
    reflectionMode.value
      ? reflection.value?.revision || 0
      : step.value?.revision || 0;
  async function persist() {
    const key = draftKey();
    if (!key) return;
    try {
      await writeTaskDraft(key, revision(), answer.value);
    } catch (cause) {
      storageWarning.value = errorText(cause);
    }
  }
  function clear() {
    generation += 1;
    selectionGeneration += 1;
    clearTimeout(timer);
    workerController?.abort();
    run.value = null;
    manifest.value = null;
    step.value = null;
    reflection.value = null;
    sample.value = null;
    answer.value = {};
    recovered.value = null;
    execution.value = null;
    hints.value = [];
    dirty.value = false;
    conflict.value = false;
    error.value = "";
    storageWarning.value = "";
    saving.value = false;
    busy.value = false;
    executing.value = false;
    hintBusy.value = false;
    savePromise = null;
    keyers.clear();
    selectedStep.value = "";
    iterationNotice.value = "";
  }
  onIdentityChange(clear);
  async function handle(cause: unknown) {
    if (cause instanceof ApiError && cause.code === "IDENTITY_CHANGED") return;
    error.value = errorText(cause);
    if (cause instanceof ApiError) {
      if (cause.status === 401) {
        auth.expire();
        return;
      }
      if (
        [
          "STEP_REVISION_CONFLICT",
          "REFLECTION_REVISION_CONFLICT",
          "RUN_REVISION_CONFLICT",
        ].includes(cause.code)
      )
        conflict.value = true;
      if (
        [
          "RUN_PAUSED",
          "RUN_REPLACED",
          "RUN_STATE_INVALID",
          "STEP_NOT_AVAILABLE",
        ].includes(cause.code)
      )
        await checkState().catch(() => undefined);
    }
  }
  async function load(id: string) {
    clear();
    loading.value = true;
    try {
      await auth.refresh(true);
      if (!auth.me) throw new ApiError(401, "AUTH_REQUIRED");
      run.value = await request<Run>(`${base}/${encodeURIComponent(id)}`);
      if (run.value.status === "READY" || run.value.status === "REPLACED")
        return;
      manifest.value = await request<TaskManifest>(`${base}/${id}/task`);
      await select(
        ["TASK_COMPLETED", "CLOSED"].includes(run.value.status) ||
          run.value.pausedFromStatus === "TASK_COMPLETED"
          ? "reflection"
          : run.value.currentStepKey || manifest.value.steps[0]!.stepKey,
      );
    } catch (cause) {
      await handle(cause);
    } finally {
      loading.value = false;
    }
  }
  async function loadSample() {
    sample.value = null;
    const asset = manifest.value?.assets.find(
      (value) => value.assetKey === "sample",
    );
    if (!asset || !run.value) return;
    const issuedAt = generation, selectionAt = selectionGeneration,
      ticket = identityRequest();
    try {
      const response = await fetch(
        `${base}/${run.value.runId}/task/assets/sample`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal: ticket.signal,
        },
      );
      if (!response.ok)
        throw new ApiError(
          response.status,
          response.status === 401 ? "AUTH_REQUIRED" : "CONTENT_UNAVAILABLE",
        );
      const bytes = await response.arrayBuffer();
      if (
        bytes.byteLength !== asset.byteLength ||
        bytes.byteLength > 1024 * 1024
      )
        throw new Error("样本大小不符合审核版本，请重试加载。");
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== asset.sha256)
        throw new Error("样本校验未通过，未载入空白或替代样本。请重试。");
      const value = JSON.parse(new TextDecoder().decode(bytes)) as Sample;
      if (
        !Array.isArray(value.rows) ||
        value.rows.length !== 4 ||
        value.rows.some(
          (row) => typeof row.rowId !== "string" || !Number.isFinite(row.value),
        )
      )
        throw new Error("样本结构不符合当前演示要求。");
      ticket.assertCurrent();
      if (issuedAt !== generation || selectionAt !== selectionGeneration) throw new ApiError(409, "IDENTITY_CHANGED");
      sample.value = value;
    } finally {
      ticket.finish();
    }
  }
  async function select(key: string) {
    if (!run.value) return;
    const selectedAt = ++selectionGeneration;
    const assertSelected = () => { if (selectedAt !== selectionGeneration) throw new ApiError(409, "IDENTITY_CHANGED"); };
    if (dirty.value && !(await flush())) return;
    assertSelected();
    clearTimeout(timer);
    selectedStep.value = key;
    error.value = "";
    conflict.value = false;
    recovered.value = null;
    hints.value = [];
    hintBusy.value = false;
    execution.value = null;
    executionError.value = "";
    localEngine.value = "";
    step.value = null;
    reflection.value = null;
    answer.value = {};
    sample.value = null;
    if (key === "reflection") {
      const next = await request<Reflection>(
        `${base}/${run.value.runId}/reflection`,
      );
      assertSelected(); reflection.value = next;
      answer.value = clone(reflection.value.answers || {});
    } else {
      const next = await request<Step>(
        `${base}/${run.value.runId}/steps/${encodeURIComponent(key)}`,
      );
      assertSelected(); step.value = next;
      answer.value = clone(step.value.response || {});
      execution.value =
        [...step.value.executions]
          .reverse()
          .find((value) => value.status === "SUCCEEDED") || null;
      if (step.value.definition.assetKeys.includes("sample"))
        await loadSample();
    }
    assertSelected();
    dirty.value = false;
    const draft = draftKey();
    if (draft) {
      try {
        const value = (await readTaskDraft(draft)) || null;
        assertSelected(); recovered.value = value;
      } catch (cause) {
        assertSelected();
        storageWarning.value = errorText(cause);
      }
    }
    if (
      !recovered.value &&
      !readOnly.value &&
      step.value?.definition.operationKey &&
      Object.keys(answer.value).length === 0
    )
      edit({ multiplier: 1, include: "ALL" });
  }
  function edit(next: Answer) {
    if (readOnly.value) return;
    answer.value = clone(next);
    dirty.value = true;
    edits += 1;
    error.value = "";
    void persist();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (
        navigator.onLine &&
        (typeof answer.value.observation !== "string" ||
          [...answer.value.observation].length >= 20)
      )
        void flush();
    }, 700);
  }
  async function restoreDraft() {
    const draft = recovered.value;
    if (!draft) return;
    if (draft.serverRevision !== revision()) {
      conflict.value = true;
      error.value =
        "本机草稿与服务端版本不同。请复制草稿后重新载入，不能覆盖较新版本。";
      return;
    }
    if (readOnly.value) {
      error.value = "当前体验只读。草稿可以复制，主动恢复体验后才能继续编辑。";
      return;
    }
    recovered.value = null;
    edit(draft.answer);
  }
  async function reloadServer() {
    const key = draftKey(),
      selected = selectedStep.value;
    if (key) await removeTaskDraft(key);
    dirty.value = false;
    conflict.value = false;
    recovered.value = null;
    await checkState();
    await select(selected);
  }
  function draftText() {
    return JSON.stringify(recovered.value?.answer || answer.value, null, 2);
  }
  async function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (savePromise) {
      const issuedAt = generation;
      const result = await savePromise;
      if (issuedAt !== generation) return false;
      return result && dirty.value ? flush() : result;
    }
    if (!dirty.value) return !conflict.value;
    if (readOnly.value || !run.value || !navigator.onLine) {
      await persist();
      return false;
    }
    const snapshot = clone(answer.value),
      issuedEdit = edits,
      issuedAt = generation,
      key = draftKey();
    const runId = run.value.runId,
      selected = selectedStep.value;
    const body = reflectionMode.value
      ? {
          expectedRevision: revision(),
          questionSetVersion: reflection.value!.questionSetVersion,
          answers: snapshot,
        }
      : {
          expectedRevision: revision(),
          responseSchemaVersion: step.value!.responseSchemaVersion,
          response: snapshot,
        };
    saving.value = true;
    const task = (async () => {
      await persist();
      try {
        if (reflectionMode.value)
          reflection.value = await request<Reflection>(
            `${base}/${runId}/reflection`,
            { method: "PUT", body },
          );
        else {
          const saved = await request<Saved>(
            `${base}/${runId}/steps/${selected}/response`,
            { method: "PUT", body },
          );
          step.value!.revision = saved.revision;
          step.value!.savedAt = saved.savedAt;
          step.value!.response = snapshot;
          run.value!.revision = saved.runRevision;
          const summary = run.value!.steps.find(
            (value) => value.stepKey === selected,
          );
          if (summary) summary.revision = saved.revision;
          if (saved.invalidatedStepKeys?.length) {
            run.value = await request<Run>(`${base}/${runId}`);
            iterationNotice.value = `你修改了已完成步骤。以下步骤的答案和历史仍保留，需要重新复核：${saved.invalidatedStepKeys.map((key) => manifest.value?.steps.find((value) => value.stepKey === key)?.title || key).join("、")}。`;
          }
        }
        if (issuedAt !== generation) return false;
        dirty.value = issuedEdit !== edits;
        if (dirty.value) await persist();
        else if (key)
          await removeTaskDraft(key).catch((cause) => {
            storageWarning.value = errorText(cause);
          });
        error.value = "";
        return true;
      } catch (cause) {
        if (issuedAt === generation) await handle(cause);
        return false;
      } finally {
        if (issuedAt === generation) saving.value = false;
      }
    })();
    savePromise = task;
    const result = await task;
    if (savePromise === task) savePromise = null;
    if (result && dirty.value && issuedAt === generation) return flush();
    return result;
  }
  async function checkState() {
    if (!run.value) return;
    const issuedRevision = run.value.revision;
    const next = await request<Run>(`${base}/${run.value.runId}`);
    if (!run.value || run.value.revision !== issuedRevision) return;
    const previous = run.value;
    run.value = next;
    if (step.value && !step.value.definition.dependencies.every(key => next.steps.find(value => value.stepKey === key)?.status === 'COMPLETED')) {
      workerController?.abort(); step.value.readOnly = true;
      error.value = "前序步骤已在另一页面修改，当前步骤暂为只读。答案仍保留，请先复核前序步骤。";
    }
    if (next.status !== previous.status && next.readOnly) {
      workerController?.abort();
      if (step.value) step.value.readOnly = true;
      if (reflection.value) reflection.value.readOnly = true;
      error.value =
        next.status === "PAUSED"
          ? "体验已在另一页面暂停。这里已转为只读；未同步差异保留在本机，不会自动恢复体验。"
          : "体验状态已在另一页面更新，请重新打开最新状态。";
    }
  }
  async function executePreview() {
    if (
      executing.value ||
      !step.value?.definition.operationKey ||
      readOnly.value
    )
      return;
    if (step.value.definition.operationKey !== "demo-summary-v1") {
      error.value = "此版本的执行适配器尚未开放，不会运行未审核操作。";
      return;
    }
    executing.value = true;
    executionError.value = "";
    error.value = "";
    workerController = new AbortController();
    const controller = workerController,
      issuedAt = generation;
    try {
      if (!(await flush()) || controller.signal.aborted || issuedAt !== generation) return;
      const params = clone(answer.value) as {
        multiplier: 1 | 2 | 3;
        include: "ALL" | "FIRST_TWO";
      };
      if (!sample.value) await loadSample();
      const local = await execute(
        "demo-summary-v1",
        sample.value!.rows.map((row) => row.value),
        { parameters: params, signal: controller.signal },
      );
      if (controller.signal.aborted || issuedAt !== generation) return;
      if (local.status !== "SUCCESS" || !local.result)
        throw new Error(local.code || "WORKER_FAILURE");
      localEngine.value = "固定计算器 · 隔离 Worker · demo-summary-v1";
      const body = {
        operationKey: step.value!.definition.operationKey,
        inputRevision: step.value!.revision,
        parameters: params,
        observedResult: local.result,
      };
      execution.value = await request<Execution>(
        `${base}/${run.value!.runId}/executions`,
        {
          method: "POST",
          body,
          key: requestKey("execution", body),
          signal: controller.signal,
        },
      );
    } catch (cause) {
      if (issuedAt !== generation) return;
      executionError.value = controller.signal.aborted
        ? "本次运行已取消。输入和上次结果仍保留，可以重新运行。"
        : cause instanceof Error &&
            [
              "EXECUTION_TIMEOUT",
              "EXECUTOR_BOOT_TIMEOUT",
              "WORKER_FAILURE",
            ].includes(cause.message)
          ? "计算器超时或暂不可用。输入和上次结果仍保留，重试会新建隔离 Worker。"
          : errorText(cause);
      if (cause instanceof ApiError) await handle(cause);
    } finally {
      if (issuedAt === generation) executing.value = false;
    }
  }
  function cancelExecution() {
    workerController?.abort();
    if (executing.value) executionError.value = "本次运行已取消。输入和上次结果仍保留，可以重新运行。";
  }
  async function complete() {
    if (busy.value || !run.value) return;
    busy.value = true;
    const issuedAt = generation;
    error.value = "";
    try {
      if (!(await flush()) || issuedAt !== generation) return;
      if (reflectionMode.value) {
        const body = {
          expectedRevision: reflection.value!.revision,
          questionSetVersion: reflection.value!.questionSetVersion,
          answers: answer.value,
        };
        run.value = await request<Run>(
          `${base}/${run.value.runId}/reflection/submission`,
          { method: "POST", body, key: requestKey("reflection-submit", body) },
        );
        if (reflection.value) reflection.value.readOnly = true;
      } else {
        const body = { expectedRevision: step.value!.revision };
        run.value = await request<Run>(
          `${base}/${run.value.runId}/steps/${step.value!.stepKey}/complete`,
          {
            method: "POST",
            body,
            key: requestKey(`complete-${step.value!.stepKey}`, body),
          },
        );
        if (run.value.steps.every((value) => value.status === "COMPLETED")) {
          const completion = { expectedRevision: run.value.revision };
          run.value = await request<Run>(
            `${base}/${run.value.runId}/task-completion`,
            {
              method: "POST",
              body: completion,
              key: requestKey("task-completion", completion),
            },
          );
          await select("reflection");
        } else await select(run.value.currentStepKey!);
      }
    } catch (cause) {
      await handle(cause);
    } finally {
      if (issuedAt === generation) busy.value = false;
    }
  }
  async function pause() {
    if (!run.value || busy.value) return false;
    busy.value = true;
    const issuedAt = generation;
    try {
      if (!(await flush()) || issuedAt !== generation) return false;
      const body = { expectedRevision: run.value.revision };
      run.value = await request<Run>(`${base}/${run.value.runId}/pause`, {
        method: "POST",
        body,
        key: requestKey("pause", body),
      });
      return true;
    } catch (cause) {
      await handle(cause);
      return false;
    } finally {
      if (issuedAt === generation) busy.value = false;
    }
  }
  async function hint(level: number) {
    if (!run.value || !step.value || hintBusy.value || readOnly.value) return;
    hintBusy.value = true;
    const issuedAt = generation, selectedAt = selectionGeneration;
    try {
      const body = { stepKey: step.value.stepKey, hintLevel: level };
      const result = await request<Hint>(`${base}/${run.value.runId}/hints`, {
        method: "POST",
        body,
        key: requestKey(`hint-${step.value.stepKey}-${level}`, body),
      });
      if (selectedAt !== selectionGeneration) return;
      hints.value = [
        ...hints.value.filter((value) => value.hintLevel !== level),
        result,
      ];
    } catch (cause) {
      await handle(cause);
    } finally {
      if (issuedAt === generation && selectedAt === selectionGeneration) hintBusy.value = false;
    }
  }
  return {
    run,
    manifest,
    step,
    reflection,
    sample,
    answer,
    error,
    storageWarning,
    loading,
    busy,
    dirty,
    saving,
    conflict,
    recovered,
    execution,
    executing,
    executionError,
    localEngine,
    hints,
    hintBusy,
    selectedStep,
    reflectionMode,
    readOnly,
    saveLabel,
    resultStale,
    connectionChanged: () => { connectionOnline.value = navigator.onLine; },
    iterationNotice,
    load,
    select,
    edit,
    restoreDraft,
    reloadServer,
    draftText,
    flush,
    checkState,
    executePreview,
    cancelExecution,
    complete,
    pause,
    hint,
    handle,
    clear,
  };
});
