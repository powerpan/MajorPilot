<script setup lang="ts">
import { pilotMode } from "../lib/pilot";
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useWorkspace } from "../stores/workspace";
import { identityRequest, onIdentityChange, useAuth } from "../stores/auth";
import StepFields from "../components/workspace/StepFields.vue";
import ReflectionFields from "../components/workspace/ReflectionFields.vue";
import HintPanel from "../components/workspace/HintPanel.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
import ClassifierConfig from "../components/workspace/ClassifierConfig.vue";
import ClassifierErrors from "../components/workspace/ClassifierErrors.vue";
import ClassifierMetrics from "../components/workspace/ClassifierMetrics.vue";
import DsWorkspace from "../components/workspace/DsWorkspace.vue";
import BaWorkspace from "../components/workspace/BaWorkspace.vue";
import WorkbookDownload from "../components/workspace/WorkbookDownload.vue";
import GuidedWorkspace from "../components/workspace/GuidedWorkspace.vue";
import { leaveRunObservation, observeRunStep } from '../lib/run-observations';
import { answerIssue, taskIssue, attentionTarget, createAttention, type AttentionIssue } from '../lib/workspace-attention';
import { actionIssue } from '../lib/ba-display';
import { isProductRun, productInstructions } from '../lib/product-entry';
import { api, ApiError, errorText } from '../lib/api';
import type { ReportPage, ReportSummary } from '../types/reports';
const route = useRoute(),
  router = useRouter(),
  workspace = useWorkspace(),
  auth = useAuth();
const help = ref<HTMLDialogElement | null>(null),
  copy = ref<HTMLDialogElement | null>(null),
  copied = ref(false);
const guided = computed(() => !!workspace.manifest?.assets.some(a => a.assetKey === 'method-guide'));
const guidedWorkspace = ref<InstanceType<typeof GuidedWorkspace> | null>(null);
const wide = ref(window.innerWidth >= 1024);
const observationCore = ref<HTMLElement | null>(null);
const workspaceBody = ref<HTMLElement | null>(null);
const attention = createAttention();
let attentionGeneration = 0;
const clearAttention = () => { attentionGeneration += 1; attention.clear(); };
const stopIdentityAttention = onIdentityChange(clearAttention);
const closedReport = ref<ReportSummary | null>(null), reportLoading = ref(false), reportError = ref('');
let reportGeneration = 0;
function clearClosedReport() { reportGeneration += 1; closedReport.value = null; reportError.value = ''; reportLoading.value = false; }
const stopIdentityReport = onIdentityChange(clearClosedReport);
async function readClosedReport() {
  const run = workspace.run;
  if (!run || run.status !== 'CLOSED' || !isProductRun(run) || reportLoading.value || !auth.me) return;
  const issuedAt = reportGeneration, ticket = identityRequest();
  reportLoading.value = true;
  try {
    const page = await api<ReportPage>('/api/app/v1/reports?limit=50', { signal: ticket.signal });
    if (!ticket.current() || issuedAt !== reportGeneration || workspace.run?.runId !== run.runId) return;
    closedReport.value = page.items.find(item => item.reportType === 'EXPERIENCE' && item.majorCode === run.majorCode && (!item.sourceRunId || item.sourceRunId===run.runId)) || null;
    reportError.value = '';
  } catch (cause) {
    if (!ticket.current() || issuedAt !== reportGeneration) return;
    if (cause instanceof ApiError && cause.status === 401) auth.expire();
    else reportError.value = errorText(cause);
  } finally { ticket.finish(); if (issuedAt === reportGeneration) reportLoading.value = false; }
}
watch(() => [workspace.run?.runId, workspace.run?.status, workspace.run && isProductRun(workspace.run)], () => { clearClosedReport(); void readClosedReport(); });
watch(() => [route.params.runId, workspace.selectedStep, workspace.reflectionMode, auth.me?.studentId], clearAttention, { flush: 'sync' });
watch(() => [workspace.baContextConfirmed, workspace.baContextStale, workspace.execution?.executionId], () => attention.clear());
async function guide(issue: AttentionIssue) {
  const issuedAt = attentionGeneration;
  await nextTick();
  if (issuedAt !== attentionGeneration || !auth.me || !workspaceBody.value) return;
  const target = attentionTarget(workspaceBody.value, issue.field) || workspaceBody.value.querySelector<HTMLElement>('[data-field-path="status"]');
  if (target) attention.show(target, issue.message, !['execution', 'context', 'status', 'draft'].includes(issue.field));
}
function currentIssue(complete = true) {
  return answerIssue(workspace.reflectionMode ? workspace.manifest?.reflection.inputSchema : workspace.step?.definition.inputSchema, workspace.answer, complete) || taskIssue(workspace.reflectionMode ? 'reflection' : workspace.selectedStep, workspace.answer, workspace.bindingConfiguration);
}
function contextIssue(): AttentionIssue | null {
  if (workspace.conflict || workspace.recovered) return { field: 'draft', message: '先处理这里的草稿或版本差异，再继续。你的输入不会被覆盖。' };
  if (workspace.baActionBlocked) return { field: 'context', message: workspace.baContextStale ? '依据已更新，请重新读取并确认，再提交当前方案。' : '请在这里查看并确认当前依据，再继续。' };
  return null;
}
function businessIssue(): AttentionIssue | null {
  if (guided.value) return null;
  if (workspace.selectedStep !== 'b6-action') return null;
  const message = actionIssue(workspace.answer, workspace.baActionContext);
  if (!message) return null;
  const field = message.includes('目标群体') ? 'targetSegmentKey' : message.includes('基线') && !message.includes('超过100') ? 'successMetric' : message.includes('护栏') ? 'guardrailMaximum' : message.includes('复盘') ? 'reviewAfterDays' : 'targetChangePercentagePoints';
  return { field, message };
}
async function guideFailure(complete = true) {
  const issue = (complete || workspace.conflict || workspace.recovered ? contextIssue() : null) || currentIssue(complete);
  if (issue) return guide(issue);
  const message = workspace.executionError || workspace.error;
  if (!message) return;
  if (guided.value && /核对并保存|本地结果改过了/.test(message)) return guide({field:'local.check',message});
  if (guided.value && /明确提交|最后一次提交/.test(message)) return guide({field:'learning',message});
  // Domain validation remains on the server; guide only to its relevant action.
  const field = /批次|基准期|两期/.test(message) ? 'baselineStartWeek' : /两轴|分层依据|分析分支/.test(message) ? (workspace.selectedStep === 'd5-stratify' ? 'stratifyBy' : 'relationshipMode') : /运行|计算|评估|参数/.test(message) && workspace.step?.definition.operationKey ? 'execution' : 'status';
  await guide({ field, message });
}
async function completeWithGuidance() {
  clearAttention();
  const issue = contextIssue() || currentIssue() || businessIssue();
  if (issue) { await guide(issue); return; }
  if (!workspace.reflectionMode && workspace.step?.definition.operationKey && !workspace.execution) {
    await guide({ field: 'execution', message: '请先点击这里的运行按钮，查看当前数据结果后再完成这一步。' });
    return;
  }
  const issuedAt = attentionGeneration;
  if (guided.value && !workspace.reflectionMode && guidedWorkspace.value && !(await guidedWorkspace.value.ready())) return;
  await workspace.complete();
  if (issuedAt === attentionGeneration) await guideFailure();
}
async function executeWithGuidance(practice = false) {
  clearAttention();
  const schema = workspace.step?.definition.inputSchema;
  const operation = workspace.manifest?.operations.find(item => item.operationKey === workspace.step?.definition.operationKey);
  const ownFields = operation?.ownResponseBindings?.map(item => item.sourceField) || Object.keys(operation?.parametersSchema.properties || {}).filter(key => !!schema?.properties[key]);
  const issue = (workspace.conflict || workspace.recovered ? contextIssue() : null) || currentIssue(false) || (schema ? answerIssue({ ...schema, required: ownFields }, workspace.answer) : null);
  if (issue) { await guide(issue); return; }
  const issuedAt = attentionGeneration;
  await (practice ? workspace.previewPractice() : workspace.executePreview());
  if (issuedAt === attentionGeneration && (workspace.error || workspace.executionError)) await guideFailure(false);
}
function nativeInvalid(event: Event) {
  if (!(event.target instanceof HTMLElement)) return;
  event.preventDefault();
  clearAttention();
  const target = event.target as HTMLInputElement;
  attention.show(target, target.validationMessage || '请检查这一项后继续。');
}
let stopObservation: (() => void) | undefined, observedPin = '', observationGeneration = 0;
async function bindObservation() {
  const generation = ++observationGeneration;
  stopObservation?.(); stopObservation = undefined;
  const run = workspace.run;
  const pin = run?.taskVersionId && run.startedAt ? `${run.runId}:${run.taskVersionId}` : '';
  if (auth.me && observedPin && pin !== observedPin) leaveRunObservation(observedPin);
  observedPin = pin;
  if (document.visibilityState !== 'visible') { if (pin) leaveRunObservation(pin); return; }
  await nextTick();
  if (generation !== observationGeneration || !run?.taskVersionId || !run.startedAt || !auth.me || !workspace.selectionReady || workspace.reflectionMode || !wide.value || !observationCore.value || !accessible(workspace.selectedStep)) return;
  stopObservation = observeRunStep(observationCore.value, run.runId, run.taskVersionId, workspace.selectedStep);
}
watch(() => [workspace.run?.runId, workspace.run?.taskVersionId, workspace.run?.startedAt, workspace.selectedStep, workspace.selectionReady, workspace.reflectionMode, wide.value, auth.me?.studentId], () => void bindObservation(), { flush: 'post' });
const number = computed(() =>
  workspace.reflectionMode
    ? (workspace.manifest?.steps.length || 5) + 1
    : Math.max(
        1,
        (workspace.manifest?.steps.findIndex(
          (value) => value.stepKey === workspace.selectedStep,
        ) ?? 0) + 1,
      ),
);
const isMajor = computed(() => workspace.run?.contentKind === "MAJOR");
const isDs = computed(() => workspace.run?.majorCode === "DATA_SCIENCE");
const isBa = computed(() => workspace.run?.majorCode === "BUSINESS_ANALYTICS");
const preview = computed(() => !!workspace.run && workspace.run.runMode === "REVIEW_PREVIEW" && !isProductRun(workspace.run));
const returnPath = computed(() =>
  isMajor.value
    ? preview.value
      ? "/app/review-previews"
      : "/app"
    : "/app/demos",
);
const boundary = computed(() =>
  preview.value
    ? "工程预览；尚待专业审核与真实用户计时"
    : isMajor.value
      ? "任务表现与专业偏好分开理解"
      : "演示不生成专业报告",
);
const followUpQuestion = computed(() =>
  String(
    (
      workspace.reflection?.followUp?.response as
        | { question?: string }
        | undefined
    )?.question || "",
  ),
);
const allCompleted = computed(() =>
  workspace.run?.steps.every((value) => value.status === "COMPLETED"),
);
let poll: ReturnType<typeof setInterval> | undefined;
function resized() {
  wide.value = window.innerWidth >= 1024;
}
async function load() {
  await workspace.load(String(route.params.runId));
  if (!auth.me)
    await router.replace(`/login?returnTo=${encodeURIComponent(route.path)}`);
}
function accessible(key: string) {
  const definition = workspace.manifest?.steps.find(
    (value) => value.stepKey === key,
  );
  return (
    definition?.dependencies.every(
      (dependency) =>
        workspace.run?.steps.find((value) => value.stepKey === dependency)
          ?.status === "COMPLETED",
    ) || false
  );
}
async function select(key: string) {
  clearAttention();
  const issuedAt = attentionGeneration;
  try {
    await workspace.select(key);
  } catch (cause) {
    await workspace.handle(cause);
  }
  if (issuedAt === attentionGeneration && workspace.error) await guideFailure(false);
}
async function pause() {
  clearAttention();
  const issuedAt = attentionGeneration;
  if (await workspace.pause()) await router.push(returnPath.value);
  else if (issuedAt === attentionGeneration) await guideFailure(false);
}
async function saveWithGuidance() {
  clearAttention();
  const issuedAt = attentionGeneration;
  if (!(await workspace.flush()) && issuedAt === attentionGeneration) await guideFailure(false);
}
async function check() {
  workspace.connectionChanged();
  if (
    !navigator.onLine ||
    workspace.loading ||
    workspace.saving ||
    workspace.busy ||
    !auth.me ||
    document.visibilityState !== "visible"
  )
    return;
  try {
    await workspace.checkState();
    if (!closedReport.value || !closedReport.value.currentVersionId) void readClosedReport();
  } catch (cause) {
    await workspace.handle(cause);
  }
  if (!auth.me)
    await router.replace(`/login?returnTo=${encodeURIComponent(route.path)}`);
}
async function copyDraft() {
  try {
    await navigator.clipboard.writeText(workspace.draftText());
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
function unload(event: BeforeUnloadEvent) {
  if (workspace.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(async () => {
  if (!workspace.dirty) return true;
  if (await workspace.flush()) return true;
  return window.confirm(
    "仍有未同步内容，已尝试保留在这台设备。确定离开？你也可以取消并重试保存。",
  );
});
watch(
  () => route.params.runId,
  () => {
    void load();
  },
);
watch(
  () => auth.me,
  (value, previous) => {
    if (!value && previous)
      void router.replace(`/login?returnTo=${encodeURIComponent(route.path)}`);
  },
);
onMounted(() => {
  void load();
  window.addEventListener("resize", resized);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.addEventListener("offline", check);
  window.addEventListener("beforeunload", unload);
  poll = setInterval(check, 8000);
  document.addEventListener('visibilitychange', bindObservation);
});
onBeforeUnmount(() => {
  clearAttention(); stopIdentityAttention();
  clearClosedReport(); stopIdentityReport();
  observationGeneration += 1; stopObservation?.();
  if (observedPin && auth.me) leaveRunObservation(observedPin);
  document.removeEventListener('visibilitychange', bindObservation);
  clearInterval(poll);
  window.removeEventListener("resize", resized);
  window.removeEventListener("focus", check);
  window.removeEventListener("online", check);
  window.removeEventListener("offline", check);
  window.removeEventListener("beforeunload", unload);
  workspace.cancelExecution();
});
</script>
<template>
  <div class="task-workspace" :class="{ 'ai-workspace': isMajor }">
    <header class="workspace-header">
      <RouterLink to="/app" class="brand" aria-label="MajorPilot 个人主页"
        ><svg viewBox="0 0 44 40" aria-hidden="true">
          <path d="M3 28 31 5 23 25Z" fill="#304FFE" />
          <path d="m33 5 10 35-18-12Z" fill="#F45B35" /></svg
        ><span>MajorPilot</span></RouterLink
      ><strong>{{
        isMajor
          ? isBa
            ? "BA · 完成率诊断"
            : isDs
              ? "DS · 学习行为分析"
              : "AI · 支持请求分类"
          : workspace.manifest?.title || "工作区上手"
      }}</strong>
      <div class="workspace-header-actions">
        <span aria-live="polite" data-testid="save-status">{{
          workspace.saveLabel
        }}</span
        ><button
          v-if="
            wide &&
            workspace.run &&
            ['IN_PROGRESS', 'TASK_COMPLETED'].includes(workspace.run.status)
          "
          class="plain-button text-link"
          :disabled="
            workspace.busy || workspace.executing || !workspace.selectionReady
          "
          @click="pause"
        >
          {{
            workspace.reflectionMode ? "暂停反思并返回" : "暂停并返回"
          }}</button
        ><RouterLink v-else :to="returnPath" class="text-link">返回</RouterLink>
      </div>
    </header>
    <main v-if="!wide" class="workspace-device">
      <span class="serif">继续之前，<br />换一张更宽的工作台。</span>
      <p v-if="preview" class="preview-warning">{{ boundary }}</p>
      <p>
        这项任务需要较宽的表格和操作区域。请使用电脑或宽屏平板继续。账户中已保存的进度可以恢复。
      </p>
      <p v-if="workspace.run">
        当前状态：{{
          workspace.run.status === "PAUSED"
            ? "已暂停"
            : workspace.run.status === "CLOSED"
              ? isMajor
                ? "体验已完成"
                : "演示已完成"
              : "进度已读取"
        }}
      </p>
      <RouterLink to="/app" class="text-link">返回个人主页 →</RouterLink>
    </main>
    <main v-else-if="workspace.loading" class="loading-state" role="status">
      正在读取任务版本与已保存进度…
    </main>
    <main
      v-else-if="!workspace.run || !workspace.manifest"
      class="workspace-empty"
    >
      <h1>
        {{
          workspace.run?.status === "REPLACED"
            ? "这次体验已被替代"
            : workspace.run?.status === "READY"
              ? "准备好后，再开始。"
              : "暂时无法打开工作区"
        }}
      </h1>
      <p v-if="workspace.error" role="alert">{{ workspace.error }}</p>
      <RouterLink
        v-if="workspace.run?.replacementRunId"
        :to="`/app/runs/${workspace.run.replacementRunId}`"
        class="text-link"
        >打开恢复后的体验 →</RouterLink
      ><RouterLink
        v-else
        :to="
          isMajor
            ? returnPath
            : `/app/demos${workspace.run?.demoKey ? '/' + workspace.run.demoKey : ''}`
        "
        class="text-link"
        >返回任务介绍 →</RouterLink
      ><button class="quiet-button" @click="load">重新加载</button>
    </main>
    <div
      v-else
      class="workspace-grid"
      :class="{ 'workspace-reflection': workspace.reflectionMode }"
    >
      <aside class="workspace-steps">
        <div class="workspace-number serif">
          {{ String(number).padStart(2, "0") }}
        </div>
        <h2>{{ workspace.reflectionMode ? "体验反思" : "任务步骤" }}</h2>
        <nav aria-label="任务步骤">
          <button
            v-for="(item, index) in workspace.manifest.steps"
            :key="item.stepKey"
            :aria-current="
              workspace.selectedStep === item.stepKey ? 'step' : undefined
            "
            :disabled="
              !accessible(item.stepKey) ||
              workspace.busy ||
              workspace.saving ||
              workspace.executing
            "
            :class="{ current: workspace.selectedStep === item.stepKey }"
            @click="select(item.stepKey)"
          >
            <span class="serif">{{ String(index + 1).padStart(2, "0") }}</span
            ><span>{{ item.title }}</span
            ><i
              v-if="
                workspace.run.steps.find(
                  (value) => value.stepKey === item.stepKey,
                )?.status === 'COMPLETED'
              "
              aria-label="已完成"
              >✓</i
            ></button
          ><button
            :disabled="
              !['TASK_COMPLETED', 'CLOSED'].includes(workspace.run.status) &&
              workspace.run.pausedFromStatus !== 'TASK_COMPLETED'
            "
            :class="{ current: workspace.reflectionMode }"
            @click="select('reflection')"
          >
            <span class="serif">{{
              String(workspace.manifest.steps.length + 1).padStart(2, "0")
            }}</span
            ><span>体验反思</span>
          </button>
        </nav>
        <RouterLink :to="returnPath" class="workspace-switch text-link"
          >{{ isMajor ? "返回专业入口" : "查看其他演示" }} →</RouterLink
        ><small
          >{{
            isMajor
              ? (isBa ? "BA" : isDs ? "DS" : "AI") +
                (preview ? " · 工程预览" : " · 专业体验")
              : "技术演示"
          }}
          · v{{ workspace.manifest.versionCode }}</small
        >
        <p v-if="preview" class="preview-warning">{{ boundary }}</p>
      </aside>
      <main class="workspace-main" id="workspace-main">
        <div ref="workspaceBody" class="workspace-main-body" @input.capture="clearAttention" @change.capture="clearAttention" @invalid.capture="nativeInvalid">
          <div
            v-if="workspace.run.status === 'PAUSED'"
            class="workspace-notice"
            role="status"
          >
            <strong>体验已暂停 · 当前只读</strong>
            <p>已保存进度保留。本机未同步差异可以复制，不会自动恢复任务。</p>
            <RouterLink
              :to="isMajor ? returnPath : `/app/demos/${workspace.run.demoKey}`"
              class="text-link"
              >主动恢复或切换 →</RouterLink
            >
          </div>
          <div
            v-if="workspace.run.status === 'CLOSED'"
            class="workspace-closed"
          >
            <span class="serif">完成。</span>
            <h1>
              {{
                preview
                  ? "这次工程预览已完成。"
                  : isMajor
                    ? "这次体验已完成。"
                    : "这次演示已完成。"
              }}
            </h1>
            <p>任务与反思已经保存。你已走过读取、调整、运行与记录的过程。</p>
            <p>
              {{
                preview
                  ? "预览记录已保存，不计正式专业完成，不生成正式推荐或专业报告。"
                  : isMajor
                    ? "任务与反思已提交。体验报告会将你的实际操作和个人感受分开呈现，并说明仍不能判断的部分。"
                    : "演示不生成专业报告，也不构成专业适合度结论。"
              }}
            </p>
            <div v-if="isMajor && !preview" class="workspace-closed-report">
              <RouterLink v-if="closedReport" :to="`/app/reports/${closedReport.reportId}`" class="action-link action-small">
                <span>{{ closedReport.currentVersionId ? '查看体验报告' : '查看报告进度' }}</span><span class="action-arrow"><ArrowIcon /></span>
              </RouterLink>
              <p v-else role="status">{{ reportError || '正在整理你的体验记录。报告就绪后，你可以在这里查看，也可以稍后从个人主页继续。' }}</p>
              <button v-if="!closedReport || reportError" class="plain-button text-link" :disabled="reportLoading" @click="readClosedReport">
                {{ reportLoading ? '正在读取报告状态…' : '刷新报告状态' }}
              </button>
            </div>
            <RouterLink :to="returnPath" class="text-link"
              >返回任务入口 →</RouterLink
            >
          </div>
          <template v-else>
            <div class="workspace-title-row" data-field-path="status">
              <h1>
                {{
                  workspace.reflectionMode
                    ? "回顾这次体验"
                    : workspace.step?.definition.title
                }}
              </h1>
              <button
                v-if="!guided"
                class="workspace-help-toggle workspace-outline"
                @click="help?.showModal()"
              >
                需要提示？
              </button>
            </div>
            <p ref="observationCore" class="workspace-instructions">
              {{
                workspace.reflectionMode
                  ? "没有标准答案，只记录你自己的感受。"
                  : productInstructions(workspace.run, workspace.step?.definition.instructions)
              }}
            </p>
            <WorkbookDownload
              v-if="isMajor && !workspace.reflectionMode && workspace.run?.taskVersionId"
              :run-id="workspace.run.runId"
              :task-version-id="workspace.run.taskVersionId"
            />
            <div
              v-if="workspace.iterationNotice"
              class="workspace-notice"
              role="status"
            >
              {{ workspace.iterationNotice }}
            </div>
            <div v-if="workspace.error" class="error-notice" role="alert" data-field-path="status">
              {{ workspace.error }}
            </div>
            <p
              v-if="!workspace.selectionReady"
              class="workspace-notice"
              role="status"
            >
              正在核对步骤资料与本机草稿，核对完成后开放编辑。
              <button
                v-if="workspace.error"
                class="plain-button text-link"
                @click="select(workspace.selectedStep)"
              >
                重新读取本步骤
              </button>
            </p>
            <div
              v-if="workspace.storageWarning"
              class="workspace-notice"
              role="alert"
            >
              {{ workspace.storageWarning }}
            </div>
            <div
              v-if="workspace.recovered || workspace.conflict"
              class="workspace-notice"
              data-field-path="draft"
            >
              <strong>{{
                workspace.conflict
                  ? "请先处理版本差异"
                  : "发现这台设备上的未同步草稿"
              }}</strong>
              <p>
                不会自动覆盖账户中的较新内容。你可以先复制，再选择重新载入。
              </p>
              <div class="button-row">
                <button
                  v-if="workspace.recovered && !workspace.conflict"
                  class="quiet-button"
                  @click="workspace.restoreDraft"
                >
                  恢复本机草稿</button
                ><button class="quiet-button" @click="copy?.showModal()">
                  查看并复制草稿</button
                ><button
                  class="workspace-outline"
                  @click="workspace.reloadServer().catch(workspace.handle)"
                >
                  舍弃本机草稿并重新载入
                </button>
              </div>
            </div>
            <table v-if="workspace.sample" class="workspace-sample">
              <caption class="sr-only">
                当前版本的四行合成样本
              </caption>
              <thead>
                <tr>
                  <th scope="col">样本</th>
                  <th scope="col">数值</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in workspace.sample.rows" :key="row.rowId">
                  <td>{{ row.rowId }}</td>
                  <td>{{ row.value }}</td>
                </tr>
              </tbody>
            </table>
            <section
              v-if="workspace.selectedStep === 'a1-task' && workspace.model"
              class="classifier-label-reference"
              aria-label="四类基础定义"
            >
              <h2>四类支持请求，四种处理方向</h2>
              <dl>
                <template
                  v-for="label in workspace.model.labelOrder"
                  :key="label"
                  ><dt>
                    {{
                      workspace.model.definitionVariants.find(
                        (value) =>
                          value.id ===
                          workspace.model!.baselineConfig.definitionVariantIds[
                            label
                          ],
                      )?.title
                    }}
                  </dt>
                  <dd>
                    {{
                      workspace.model.definitionVariants.find(
                        (value) =>
                          value.id ===
                          workspace.model!.baselineConfig.definitionVariantIds[
                            label
                          ],
                      )?.description
                    }}
                  </dd></template
                >
              </dl>
              <p class="muted">
                这些定义来自本次绑定的内容版本。分类对象是请求，不是学生能力或性格。
              </p>
            </section>
            <ReflectionFields
              v-if="workspace.reflectionMode && workspace.reflection"
              :model-value="workspace.answer"
              :steps="workspace.manifest.steps"
              :schema="workspace.manifest.reflection.inputSchema"
              :professional="isMajor"
              :disabled="workspace.readOnly || workspace.busy"
              @update:model-value="workspace.edit"
            />
            <GuidedWorkspace v-else-if="guided && !workspace.reflectionMode && workspace.step" :key="workspace.selectedStep" ref="guidedWorkspace" @execute="executeWithGuidance()" />
            <ClassifierConfig
              v-else-if="
                workspace.selectedStep === 'a4-configure' &&
                workspace.model &&
                workspace.step
              "
              :model="workspace.model"
              :schema="workspace.step.definition.inputSchema"
              :model-value="workspace.answer"
              :disabled="
                workspace.readOnly || workspace.executing || workspace.busy
              "
              @update:model-value="workspace.edit"
            />
            <ClassifierErrors
              v-else-if="
                workspace.selectedStep === 'a3-errors' && workspace.practice
              "
              :samples="workspace.practice"
              :model-value="workspace.answer"
              :disabled="workspace.readOnly || workspace.busy"
              @update:model-value="workspace.edit"
            />
            <template
              v-else-if="
                workspace.selectedStep === 'a5-evaluate' && workspace.step
              "
            >
              <section class="classifier-binding" data-field-path="execution" data-attention-region>
                <h2>
                  当前配置
                  <button
                    class="plain-button text-link"
                    :disabled="workspace.busy || workspace.executing"
                    @click="select('a4-configure')"
                  >
                    返回修改
                  </button>
                </h2>
                <p>
                  来自已保存的设计修改。{{
                    workspace.step.inputBindings
                      .map(
                        (value) =>
                          `${value.sourceStepKey} · r${value.sourceRevision}`,
                      )
                      .filter(
                        (value, index, all) => all.indexOf(value) === index,
                      )
                      .join("、")
                  }}
                </p>
                <details>
                  <summary>查看本次绑定的配置</summary>
                  <dl>
                    <template
                      v-for="binding in workspace.step.inputBindings"
                      :key="binding.parameterKey"
                      ><dt>{{ binding.parameterKey }}</dt>
                      <dd>{{ JSON.stringify(binding.value) }}</dd></template
                    >
                  </dl>
                </details>
                <button
                  class="workspace-outline"
                  :disabled="
                    workspace.readOnly ||
                    workspace.busy ||
                    workspace.executing ||
                    !!workspace.recovered
                  "
                  data-attention-control
                  @click="executeWithGuidance()"
                >
                  {{
                    workspace.executing
                      ? "正在服务端评估…"
                      : workspace.execution
                        ? "复用或重新评估"
                        : "运行正式评估"
                  }}</button
                ><button
                  v-if="workspace.executing"
                  class="plain-button text-link"
                  @click="workspace.cancelExecution"
                >
                  取消等待
                </button>
                <p class="muted">
                  最多5种成功配置；基线和重复配置不扣次数。{{
                    workspace.execution
                      ? `剩余 ${workspace.execution.remainingEvaluations} 种 · ${workspace.execution.reused ? "本次复用了已有结果" : "新结果已记录"}`
                      : ""
                  }}
                </p>
              </section>
              <p
                v-if="workspace.executionError"
                class="error-notice"
                role="alert"
              >
                {{ workspace.executionError }}
              </p>
              <p
                v-if="workspace.resultStale"
                class="result-stale"
                role="status"
              >
                结果已过期：保存的回答或来源版本发生变化。请点复用或重新评估，确认当前绑定；相同配置不扣次数。
              </p>
              <ClassifierMetrics
                :value="workspace.comparison"
                :baseline="workspace.baseline"
              />
              <p v-if="workspace.execution" class="muted">
                {{
                  workspace.execution.trustLevel === "SERVER_VERIFIED"
                    ? "服务端已复算确认"
                    : "结果待确认"
                }}
                · 回答 r{{ workspace.execution.inputRevision }} · 来源
                {{ JSON.stringify(workspace.execution.sourceRevisions) }} ·
                classifier-v1
              </p>
              <h2>你的观察</h2>
              <StepFields
                :schema="workspace.step.definition.inputSchema"
                :model-value="workspace.answer"
                :disabled="
                  workspace.readOnly || workspace.executing || workspace.busy
                "
                class="classifier-rationale"
                @update:model-value="workspace.edit"
              />
            </template>
            <BaWorkspace v-else-if="isBa && workspace.step" @execute="executeWithGuidance()" />
            <DsWorkspace v-else-if="isDs && workspace.step" @execute="executeWithGuidance()" />
            <StepFields
              v-else-if="workspace.step"
              :schema="workspace.step.definition.inputSchema"
              :model-value="workspace.answer"
              :disabled="
                workspace.readOnly || workspace.executing || workspace.busy
              "
              @update:model-value="workspace.edit"
            />
            <section
              v-if="!pilotMode && workspace.reflectionMode && isMajor && workspace.reflection"
              class="reflection-optional classifier-followup"
            >
              <h2>一个可选的追问</h2>
              <p>
                只围绕已选择的兴趣与困难追问一次。可以直接跳过，失败不会阻挡完成。
              </p>
              <p v-if="workspace.reflection.followUp?.status === 'SUCCEEDED'">
                {{ followUpQuestion }}
              </p>
              <p
                v-else-if="workspace.reflection.followUp?.status === 'FAILED'"
                role="status"
              >
                追问暂不可用。你可以重试或直接提交已有反思。
              </p>
              <p
                v-else-if="workspace.reflection.followUp?.status === 'PENDING'"
                role="status"
              >
                追问正在准备；可以稍后重试读取或直接跳过。
              </p>
              <button
                v-if="workspace.reflection.followUp?.status !== 'SUCCEEDED'"
                class="workspace-outline"
                :disabled="
                  workspace.readOnly || workspace.followUpBusy || workspace.busy
                "
                @click="workspace.requestFollowUp"
              >
                {{ workspace.followUpBusy ? "正在请求…" : "请求可选追问" }}
              </button>
              <p
                v-if="workspace.followUpError"
                class="error-notice"
                role="alert"
              >
                {{ workspace.followUpError }}
              </p>
              <label
                v-if="workspace.reflection.followUp?.status === 'SUCCEEDED'"
                class="workspace-textarea"
                ><span>你的补充（选填，最多500字）</span
                ><textarea
                  name="aiFollowUp"
                  maxlength="500"
                  rows="3"
                  :disabled="workspace.readOnly || workspace.busy"
                  :value="
                    String(
                      workspace.answer.aiFollowUp === 'SKIPPED'
                        ? ''
                        : workspace.answer.aiFollowUp || '',
                    )
                  "
                  @input="
                    workspace.edit({
                      ...workspace.answer,
                      aiFollowUp: ($event.target as HTMLTextAreaElement).value,
                    })
                  "
                /></label
              ><button
                class="plain-button text-link"
                :disabled="workspace.readOnly || workspace.busy"
                @click="
                  workspace.edit({ ...workspace.answer, aiFollowUp: 'SKIPPED' })
                "
              >
                跳过追问
              </button>
            </section>
            <section
              v-if="workspace.selectedStep === 'a4-configure'"
              class="classifier-practice"
              data-field-path="execution"
              data-attention-region
            >
              <div class="button-row">
                <button
                  class="workspace-outline"
                  :disabled="
                    workspace.readOnly || workspace.busy || workspace.executing
                  "
                  data-attention-control
                  @click="executeWithGuidance(true)"
                >
                  {{
                    workspace.executing ? "正在隔离计算…" : "练习集预览"
                  }}</button
                ><button
                  v-if="workspace.executing"
                  class="plain-button text-link"
                  @click="workspace.cancelExecution"
                >
                  取消预览</button
                ><span>只预览公开练习，不占正式评估次数。</span>
              </div>
              <p
                v-if="workspace.executionError"
                class="error-notice"
                role="alert"
              >
                {{ workspace.executionError }}
              </p>
              <p v-if="workspace.practiceStale" class="result-stale">
                练习预览已过期：当前配置已修改，请重新预览。
              </p>
              <ClassifierMetrics
                v-if="workspace.practiceResult"
                :value="workspace.practiceResult"
                practice
              />
            </section>
            <template
              v-if="
                workspace.step?.definition.operationKey === 'demo-summary-v1'
              "
            >
              <div class="workspace-execution-actions" data-field-path="execution" data-attention-region>
                <button
                  v-if="!workspace.executing"
                  class="workspace-outline"
                  :disabled="
                    workspace.readOnly ||
                    workspace.busy ||
                    !!workspace.recovered
                  "
                  data-attention-control
                  @click="executeWithGuidance()"
                >
                  运行预览</button
                ><button
                  v-else
                  class="workspace-outline"
                  @click="workspace.cancelExecution"
                >
                  取消运行</button
                ><span v-if="workspace.executing" role="status"
                  >正在隔离计算并由服务端校验…</span
                >
              </div>
              <p
                v-if="workspace.executionError"
                class="error-notice"
                role="alert"
              >
                {{ workspace.executionError }}
              </p>
              <section
                v-if="workspace.execution?.result"
                class="workspace-result"
                aria-label="运行结果"
              >
                <p
                  v-if="workspace.resultStale"
                  class="result-stale"
                  role="status"
                >
                  结果已过期：输入已修改，请保存后重新运行。
                </p>
                <div class="workspace-result-values">
                  <div>
                    <span>样本数</span
                    ><strong class="serif" data-testid="result-count">{{
                      workspace.execution.result.count
                    }}</strong>
                  </div>
                  <div>
                    <span>总和</span
                    ><strong class="serif" data-testid="result-sum">{{
                      workspace.execution.result.sum
                    }}</strong>
                  </div>
                  <div>
                    <span>平均值</span
                    ><strong class="serif" data-testid="result-mean">{{
                      workspace.execution.result.mean
                    }}</strong>
                  </div>
                </div>
                <p>结果仅来自这份合成样本。</p>
                <small
                  >{{
                    workspace.execution.trustLevel === "SERVER_VERIFIED"
                      ? "服务端已复算确认"
                      : "仅本机观察结果"
                  }}
                  · 输入版本{{ workspace.execution.inputRevision }} ·
                  demo-summary-v1{{
                    workspace.execution.reused ? " · 已有配置结果" : ""
                  }}</small
                ><small v-if="workspace.localEngine">{{
                  workspace.localEngine
                }}</small>
              </section>
              <p v-else class="workspace-unrun">
                尚未运行。结果将来自当前版本的合成样本与允许的参数，不使用外部数据。
              </p>
              <details class="workspace-calculation">
                <summary>
                  查看计算说明 <span aria-hidden="true">→</span>
                </summary>
                <p>
                  先按范围选取行，将每个数值乘以倍数，再统计行数、总和与平均值。以下是只读的计算说明，不是任意代码编辑器。
                </p>
                <pre><code>selected = rows if include == "ALL" else rows[:2]
values = [row["value"] * multiplier for row in selected]
count = len(values)
total = sum(values)
mean = total / count</code></pre>
                <p>
                  当前引擎为已审核固定计算器，不是完整Python环境。每次运行最多10秒，可安全取消与重试。
                </p>
              </details>
            </template>
            <p
              v-if="
                workspace.run.status === 'TASK_COMPLETED' &&
                !workspace.reflectionMode
              "
              class="muted"
            >
              任务已提交，步骤只读。请继续填写体验反思。
            </p>
          </template>
        </div>
        <footer
          v-if="workspace.run.status !== 'CLOSED'"
          class="workspace-footer"
        >
          <button
            class="plain-button"
            :disabled="number <= 1 || workspace.busy || workspace.executing"
            @click="
              select(
                workspace.manifest.steps[
                  Math.min(workspace.manifest.steps.length - 1, number - 2)
                ]!.stepKey,
              )
            "
          >
            ←
            <strong>{{
              workspace.reflectionMode ? "返回任务回顾" : "上一步"
            }}</strong>
          </button>
          <div>
            <button
              v-if="workspace.dirty"
              class="text-link plain-button"
              :disabled="workspace.saving || workspace.readOnly"
              @click="saveWithGuidance"
            >
              重试保存</button
            ><button
              class="action-link"
              :disabled="
                (workspace.readOnly && !workspace.conflict &&
                  !(allCompleted && workspace.run.status === 'IN_PROGRESS')) ||
                workspace.busy ||
                workspace.executing ||
                !workspace.selectionReady
              "
              @click="completeWithGuidance"
            >
              <span>{{
                workspace.busy
                  ? "正在确认…"
                  : workspace.reflectionMode
                    ? isMajor
                      ? preview
                        ? "提交并完成预览"
                        : "提交并完成体验"
                      : "提交并完成演示"
                    : allCompleted
                      ? "提交任务并进入反思"
                      : workspace.selectedStep === "a4-configure"
                        ? "保存并进入评估"
                        : "完成此步骤"
              }}</span
              ><span class="action-arrow"><ArrowIcon /></span>
            </button>
          </div>
        </footer>
      </main>
      <aside class="workspace-help">
        <HintPanel
          v-if="!workspace.reflectionMode && !guided"
          :hints="workspace.hints"
          :boundary="boundary"
          :busy="workspace.hintBusy"
          :disabled="workspace.readOnly"
          @request="workspace.hint"
        />
        <div v-else-if="workspace.reflectionMode" class="reflection-aside">
          <h2>把感受留给自己。</h2>
          <p>
            任务结果与体验偏好是两回事。诚实记录兴趣、困难与不确定，比选一个“正确答案”更有用。
          </p>
          <p>反思可以暂停，恢复后仍从这里继续。</p>
          <small>{{ boundary }}</small>
        </div>
      </aside>
    </div>
    <dialog v-if="!guided" ref="help" class="workspace-help-drawer" aria-label="分层帮助">
      <button class="plain-button text-link" @click="help?.close()">
        关闭提示 ×</button
      ><HintPanel
        :hints="workspace.hints"
        :boundary="boundary"
        :busy="workspace.hintBusy"
        :disabled="workspace.readOnly"
        @request="workspace.hint"
      />
    </dialog>
    <dialog
      ref="copy"
      class="workspace-dialog"
      aria-labelledby="draft-copy-title"
    >
      <h2 id="draft-copy-title">本机未同步草稿</h2>
      <p>
        复制到你信任的位置。此文本仅在当前设备显示，不会自动发送给模型或后台。
      </p>
      <textarea
        readonly
        rows="10"
        aria-label="可复制的本机草稿"
        :value="workspace.draftText()"
      />
      <div class="button-row">
        <button class="quiet-button" @click="copy?.close()">关闭</button
        ><button class="workspace-outline" @click="copyDraft">
          {{ copied ? "已复制" : "复制草稿" }}
        </button>
      </div>
    </dialog>
  </div>
</template>
