<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorText, stableOperation } from "../lib/api";
import { identityRequest } from "../stores/auth";
import type { PreviewTask, Run } from "../types/workspace";
import ArrowIcon from "../components/ArrowIcon.vue";
const route = useRoute(),
  router = useRouter(),
  tasks = ref<PreviewTask[]>([]),
  runs = ref<Run[]>([]),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  dialog = ref<HTMLDialogElement | null>(null),
  target = ref<Run | null>(null),
  active = ref<Run | null>(null),
  operation = stableOperation();
const selected = computed(() =>
  tasks.value.find(
    (value) => value.taskVersionId === route.params.taskVersionId,
  ),
);
const current = (id: string) =>
  [...runs.value]
    .reverse()
    .find(
      (value) =>
        value.runMode === "REVIEW_PREVIEW" &&
        value.taskVersionId === id &&
        value.status !== "REPLACED",
    );
async function request<T>(
  path: string,
  options: Parameters<typeof api>[1] = {},
) {
  const ticket = identityRequest();
  try {
    const value = await api<T>(path, { ...options, signal: ticket.signal });
    ticket.assertCurrent();
    return value;
  } finally {
    ticket.finish();
  }
}
async function load() {
  loading.value = true;
  try {
    [tasks.value, runs.value] = await Promise.all([
      request<PreviewTask[]>("/api/app/v1/review-preview-tasks"),
      request<Run[]>("/api/app/v1/experience-runs"),
    ]);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    loading.value = false;
  }
}
async function begin(task: PreviewTask) {
  busy.value = true;
  error.value = "";
  try {
    const existing = current(task.taskVersionId);
    const body = { taskVersionId: task.taskVersionId };
    target.value =
      existing ||
      (await request<Run>("/api/app/v1/review-preview-runs", {
        method: "POST",
        body,
        key: operation(body),
      }));
    if (!["READY", "PAUSED"].includes(target.value.status)) {
      await router.push(`/app/runs/${target.value.runId}`);
      return;
    }
    const latest = await request<Run[]>("/api/app/v1/experience-runs");
    active.value =
      latest.find(
        (value) =>
          value.runId !== target.value?.runId &&
          ["IN_PROGRESS", "TASK_COMPLETED"].includes(value.status),
      ) || null;
    if (active.value) dialog.value?.showModal();
    else await transition();
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function transition() {
  if (!target.value) return;
  busy.value = true;
  try {
    const body = {
      expectedRevision: target.value.revision,
      ...(active.value
        ? {
            pauseActiveRunId: active.value.runId,
            expectedActiveRunRevision: active.value.revision,
          }
        : {}),
    };
    const action = target.value.status === "PAUSED" ? "resume" : "start";
    const run = await request<Run>(
      `/api/app/v1/experience-runs/${target.value.runId}/${action}`,
      { method: "POST", body, key: operation({ action, ...body }) },
    );
    dialog.value?.close();
    await router.push(`/app/runs/${run.runId}`);
  } catch (cause) {
    dialog.value?.close();
    error.value = errorText(cause);
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <main class="demo-page">
    <RouterLink to="/app" class="text-link">← 返回个人主页</RouterLink>
    <p class="demo-eyebrow">仅本地 · 内容工程预览</p>
    <h1>{{ selected?.title || "检查一次真实的专业任务流程。" }}</h1>
    <p class="preview-warning preview-list-warning">
      工程预览；尚待专业审核与真实用户计时。这里会真实保存配置、计算和反思，但不计正式专业完成，不产生下一专业推荐或专业报告。
    </p>
    <p v-if="loading" role="status">正在读取已校验的预览版本…</p>
    <div v-if="error" class="error-notice" role="alert">
      {{ error
      }}<button class="plain-button text-link" @click="load">重试</button>
    </div>
    <section v-if="selected" class="demo-introduction">
      <div>
        <h2>你会做些什么</h2>
        <ol v-if="selected.majorCode === 'DATA_SCIENCE'">
          <li>检查合成学习记录的缺失、重复、不适用与合理极端值</li>
          <li>选择处理方案，比较分布、分组完成率或散点关系</li>
          <li>分层检查解释，写出有证据且保留限制的发现</li>
          <li>独立反思，不把分析结果当作专业适配分数</li>
        </ol>
        <ol v-else>
          <li>认识支持请求的四种分类与评价指标</li>
          <li>检查公开错误，选择定义、示例和阈值</li>
          <li>预览公开练习，再比较服务端固定隐藏集的聚合结果</li>
          <li>说明使用决定与不确定性，记录体验反思</li>
        </ol>
        <p>
          设计目标45–60分钟，尚未经真实目标学生计时验证。使用电脑或宽屏平板；不需要安装软件。
        </p>
        <p>
          支持暂停、切换与继续；同一时刻只运行一项。未同步草稿仅保留于本机，最多7天。
        </p>
        <p v-if="selected.majorCode === 'DATA_SCIENCE'" class="muted">
          固定统计计算器；等价Python说明只读、不执行。每种操作最多30种成功配置，相同配置复用不扣次数。
        </p>
        <p v-else class="muted">
          教学分类器不是在线大模型。最多5种成功配置；基线和相同配置复用不扣次数。
        </p>
      </div>
      <div class="demo-start">
        <p>REVIEW · v{{ selected.versionCode }}</p>
        <button
          class="action-link desktop-task-action"
          :disabled="busy"
          @click="begin(selected)"
        >
          <span>{{
            busy
              ? "正在确认…"
              : current(selected.taskVersionId)?.status === "PAUSED"
                ? "恢复工程预览"
                : current(selected.taskVersionId)?.status === "CLOSED"
                  ? "查看预览记录"
                  : current(selected.taskVersionId)
                    ? "继续工程预览"
                    : "开始工程预览"
          }}</span
          ><span class="action-arrow"><ArrowIcon /></span>
        </button>
        <p class="task-device-notice">
          请使用电脑或宽屏平板继续；手机可以查看预览说明与进度。
        </p>
      </div>
    </section>
    <section v-else-if="!loading" class="demo-list" aria-label="工程预览列表">
      <article v-for="task in tasks" :key="task.taskVersionId">
        <span class="serif">{{ task.majorCode }}</span>
        <div>
          <h2>{{ task.title }}</h2>
          <p>
            {{ task.reviewStatus }} · v{{ task.versionCode }} ·
            {{
              current(task.taskVersionId)?.status === "CLOSED"
                ? "预览已完成"
                : "可检查工程流程"
            }}
          </p>
          <RouterLink
            :to="`/app/review-previews/${task.taskVersionId}`"
            class="text-link"
            >了解并进入 →</RouterLink
          >
        </div>
      </article>
      <p v-if="!tasks.length">
        本地工程预览未开启，或当前没有可用的审核中版本。
      </p>
    </section>
    <dialog
      ref="dialog"
      class="workspace-dialog"
      aria-labelledby="preview-switch-title"
    >
      <h2 id="preview-switch-title">暂停原体验，进入工程预览？</h2>
      <p>
        已保存的进度会保留。若原页面仍有未同步输入，请先取消并保存。切换不会同时运行两项。
      </p>
      <div class="button-row">
        <button class="quiet-button" @click="dialog?.close()">取消切换</button
        ><button class="workspace-outline" :disabled="busy" @click="transition">
          确认暂停并切换
        </button>
      </div>
    </dialog>
  </main>
</template>
