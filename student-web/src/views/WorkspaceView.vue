<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useWorkspace } from "../stores/workspace";
import { useAuth } from "../stores/auth";
import StepFields from "../components/workspace/StepFields.vue";
import ReflectionFields from "../components/workspace/ReflectionFields.vue";
import HintPanel from "../components/workspace/HintPanel.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
const route = useRoute(),
  router = useRouter(),
  workspace = useWorkspace(),
  auth = useAuth();
const help = ref<HTMLDialogElement | null>(null),
  copy = ref<HTMLDialogElement | null>(null),
  copied = ref(false);
const wide = ref(window.innerWidth >= 1024);
const number = computed(() =>
  workspace.reflectionMode
    ? 6
    : Math.max(
        1,
        (workspace.manifest?.steps.findIndex(
          (value) => value.stepKey === workspace.selectedStep,
        ) ?? 0) + 1,
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
  if (await workspace.pause()) await router.push("/app/demos");
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
watch(() => auth.me, (value, previous) => {
  if (!value && previous) void router.replace(`/login?returnTo=${encodeURIComponent(route.path)}`);
});
onMounted(() => {
  void load();
  window.addEventListener("resize", resized);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  window.addEventListener("offline", check);
  window.addEventListener("beforeunload", unload);
  poll = setInterval(check, 8000);
});
onBeforeUnmount(() => {
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
  <div class="task-workspace">
    <header class="workspace-header">
      <RouterLink to="/app" class="brand" aria-label="MajorPilot 个人主页"
        ><svg viewBox="0 0 44 40" aria-hidden="true">
          <path d="M3 28 31 5 23 25Z" fill="#304FFE" />
          <path d="m33 5 10 35-18-12Z" fill="#F45B35" /></svg
        ><span>MajorPilot</span></RouterLink
      ><strong>{{ workspace.manifest?.title || "工作区上手" }}</strong>
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
          :disabled="workspace.busy || workspace.executing"
          @click="pause"
        >
          {{
            workspace.reflectionMode ? "暂停反思并返回" : "暂停并返回"
          }}</button
        ><RouterLink v-else to="/app/demos" class="text-link">返回</RouterLink>
      </div>
    </header>
    <main v-if="!wide" class="workspace-device">
      <span class="serif">继续之前，<br />换一张更宽的工作台。</span>
      <p>
        这项任务需要较宽的表格和操作区域。请使用电脑或宽屏平板继续。账户中已保存的进度可以恢复。
      </p>
      <p v-if="workspace.run">
        当前状态：{{
          workspace.run.status === "PAUSED"
            ? "已暂停"
            : workspace.run.status === "CLOSED"
              ? "演示已完成"
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
        :to="`/app/demos${workspace.run?.demoKey ? '/' + workspace.run.demoKey : ''}`"
        class="text-link"
        >返回演示介绍 →</RouterLink
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
        <h2>{{ workspace.reflectionMode ? '体验反思' : '任务步骤' }}</h2>
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
            <span class="serif">06</span><span>体验反思</span>
          </button>
        </nav>
        <RouterLink to="/app/demos" class="workspace-switch text-link"
          >查看其他演示 →</RouterLink
        ><small>技术演示 · v{{ workspace.manifest.versionCode }}</small>
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
              :to="`/app/demos/${workspace.run.demoKey}`"
              class="text-link"
              >主动恢复或切换 →</RouterLink
            >
          </div>
          <div
            v-if="workspace.run.status === 'CLOSED'"
            class="workspace-closed"
          >
            <span class="serif">完成。</span>
            <h1>这次演示已完成。</h1>
            <p>任务与反思已经保存。你已走过读取、调整、运行与记录的过程。</p>
            <p>演示不生成专业报告，也不构成专业适合度结论。</p>
            <RouterLink to="/app/demos" class="text-link"
              >返回演示列表 →</RouterLink
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
            <p class="workspace-instructions">
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
            <ReflectionFields
              v-if="workspace.reflectionMode && workspace.reflection"
              :model-value="workspace.answer"
              :steps="workspace.manifest.steps"
              :disabled="workspace.readOnly || workspace.busy"
              @update:model-value="workspace.edit"
            />
            <StepFields
              v-else-if="workspace.step"
              :schema="workspace.step.definition.inputSchema"
              :model-value="workspace.answer"
              :disabled="
                workspace.readOnly || workspace.executing || workspace.busy
              "
              @update:model-value="workspace.edit"
            />
            <template v-if="workspace.step?.definition.operationKey">
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
              select(workspace.manifest.steps[Math.min(4, number - 2)]!.stepKey)
            "
          >
            ← <strong>{{ workspace.reflectionMode ? '返回任务回顾' : '上一步' }}</strong>
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
                !!workspace.recovered ||
                workspace.conflict
              "
              @click="workspace.complete"
            >
              <span>{{
                workspace.busy
                  ? "正在确认…"
                  : workspace.reflectionMode
                    ? "提交并完成演示"
                    : allCompleted
                      ? "提交任务并进入反思"
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
          <small>演示不生成专业报告</small>
        </div>
      </aside>
    </div>
    <dialog ref="help" class="workspace-help-drawer" aria-label="分层帮助">
      <button class="plain-button text-link" @click="help?.close()">
        关闭提示 ×</button
      ><HintPanel
        :hints="workspace.hints"
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
