<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useWorkspace } from "../stores/workspace";
import { useAuth } from "../stores/auth";
import StepFields from "../components/workspace/StepFields.vue";
import ReflectionFields from "../components/workspace/ReflectionFields.vue";
import HintPanel from "../components/workspace/HintPanel.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
import ClassifierConfig from "../components/workspace/ClassifierConfig.vue";
import ClassifierErrors from "../components/workspace/ClassifierErrors.vue";
import ClassifierMetrics from "../components/workspace/ClassifierMetrics.vue";
import DsWorkspace from "../components/workspace/DsWorkspace.vue";
import BaWorkspace from "../components/workspace/BaWorkspace.vue";
import { leaveRunObservation, observeRunStep } from '../lib/run-observations';
const route = useRoute(),
  router = useRouter(),
  workspace = useWorkspace(),
  auth = useAuth();
const help = ref<HTMLDialogElement | null>(null),
  copy = ref<HTMLDialogElement | null>(null),
  copied = ref(false);
const wide = ref(window.innerWidth >= 1024);
const observationCore = ref<HTMLElement | null>(null);
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
const preview = computed(() => workspace.run?.runMode === "REVIEW_PREVIEW");
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
  try {
    await workspace.select(key);
  } catch (cause) {
    await workspace.handle(cause);
  }
}
async function pause() {
  if (await workspace.pause()) await router.push(returnPath.value);
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
        <div class="workspace-main-body">
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
                    ? "任务与反思已提交，报告状态以账户中实际记录为准。"
                    : "演示不生成专业报告，也不构成专业适合度结论。"
              }}
            </p>
            <RouterLink :to="returnPath" class="text-link"
              >返回任务入口 →</RouterLink
            >
          </div>
          <template v-else>
            <div class="workspace-title-row">
              <h1>
                {{
                  workspace.reflectionMode
                    ? "回顾这次体验"
                    : workspace.step?.definition.title
                }}
              </h1>
              <button
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
                  : workspace.step?.definition.instructions
              }}
            </p>
            <div
              v-if="workspace.iterationNotice"
              class="workspace-notice"
              role="status"
            >
              {{ workspace.iterationNotice }}
            </div>
            <div v-if="workspace.error" class="error-notice" role="alert">
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
              <section class="classifier-binding">
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
                  @click="workspace.executePreview"
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
            <BaWorkspace v-else-if="isBa && workspace.step" />
            <DsWorkspace v-else-if="isDs && workspace.step" />
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
              v-if="workspace.reflectionMode && isMajor && workspace.reflection"
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
            >
              <div class="button-row">
                <button
                  class="workspace-outline"
                  :disabled="
                    workspace.readOnly || workspace.busy || workspace.executing
                  "
                  @click="workspace.previewPractice"
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
              <div class="workspace-execution-actions">
                <button
                  v-if="!workspace.executing"
                  class="workspace-outline"
                  :disabled="
                    workspace.readOnly ||
                    workspace.busy ||
                    !!workspace.recovered
                  "
                  @click="workspace.executePreview"
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
              @click="workspace.flush"
            >
              重试保存</button
            ><button
              class="action-link"
              :disabled="
                (workspace.readOnly &&
                  !(allCompleted && workspace.run.status === 'IN_PROGRESS')) ||
                workspace.busy ||
                workspace.executing ||
                !workspace.selectionReady ||
                !!workspace.recovered ||
                workspace.baActionBlocked ||
                workspace.conflict
              "
              @click="workspace.complete"
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
          v-if="!workspace.reflectionMode"
          :hints="workspace.hints"
          :boundary="boundary"
          :busy="workspace.hintBusy"
          :disabled="workspace.readOnly"
          @request="workspace.hint"
        />
        <div v-else class="reflection-aside">
          <h2>把感受留给自己。</h2>
          <p>
            任务结果与体验偏好是两回事。诚实记录兴趣、困难与不确定，比选一个“正确答案”更有用。
          </p>
          <p>反思可以暂停，恢复后仍从这里继续。</p>
          <small>{{ boundary }}</small>
        </div>
      </aside>
    </div>
    <dialog ref="help" class="workspace-help-drawer" aria-label="分层帮助">
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
