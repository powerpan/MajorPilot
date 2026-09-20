<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorText, stableOperation } from "../lib/api";
import { identityRequest } from "../stores/auth";
import type { DemoTask, Run } from "../types/workspace";
import ArrowIcon from "../components/ArrowIcon.vue";
const route = useRoute(),
  router = useRouter();
const demos = ref<DemoTask[]>([]),
  runs = ref<Run[]>([]),
  error = ref(""),
  busy = ref(false),
  loading = ref(true);
const dialog = ref<HTMLDialogElement | null>(null),
  target = ref<Run | null>(null),
  active = ref<Run | null>(null);
const operation = stableOperation();
const selected = computed(() =>
  demos.value.find((value) => value.demoKey === route.params.demoKey),
);
const current = (demoKey: string) =>
  [...runs.value]
    .reverse()
    .find((value) => value.demoKey === demoKey && value.status !== "REPLACED");
const labels: Record<string, string> = {
  READY: "尚未开始",
  IN_PROGRESS: "正在进行",
  TASK_COMPLETED: "待完成反思",
  PAUSED: "已暂停",
  CLOSED: "演示已完成",
  REPLACED: "已被替代",
};
async function request<T>(
  path: string,
  options: Parameters<typeof api>[1] = {},
) {
  const ticket = identityRequest();
  try {
    const result = await api<T>(path, { ...options, signal: ticket.signal });
    ticket.assertCurrent();
    return result;
  } finally {
    ticket.finish();
  }
}
async function load() {
  loading.value = true;
  try {
    [demos.value, runs.value] = await Promise.all([
      request<DemoTask[]>("/api/app/v1/demo-tasks"),
      request<Run[]>("/api/app/v1/experience-runs"),
    ]);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    loading.value = false;
  }
}
async function begin(demo: DemoTask) {
  busy.value = true;
  error.value = "";
  try {
    const body = { demoKey: demo.demoKey };
    const next = await request<Run>("/api/app/v1/experience-runs", {
      method: "POST",
      body,
      key: operation(body),
    });
    if (!["READY", "PAUSED"].includes(next.status)) {
      await router.push(`/app/runs/${next.runId}`);
      return;
    }
    target.value = next;
    const latest = await request<Run[]>("/api/app/v1/experience-runs");
    active.value =
      latest.find(
        (value) =>
          value.runId !== next.runId &&
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
    const result = await request<Run>(
      `/api/app/v1/experience-runs/${target.value.runId}/${action}`,
      { method: "POST", body, key: operation({ action, ...body }) },
    );
    dialog.value?.close();
    await router.push(`/app/runs/${result.runId}`);
  } catch (cause) {
    dialog.value?.close();
    error.value = errorText(cause);
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
watch(
  () => route.params.demoKey,
  () => {
    error.value = "";
  },
);
</script>
<template>
  <main class="demo-page">
    <RouterLink to="/app" class="text-link">← 返回个人主页</RouterLink>
    <p class="demo-eyebrow">工作区上手 · 技术演示</p>
    <h1>{{ selected?.title || "先熟悉这张工作台。" }}</h1>
    <p class="demo-lead">
      用一份合成样本，试一试读取、调整、运行与记录。<br />这里不是第四个专业，也不用于判断能力或专业适合度。
    </p>
    <p v-if="loading" role="status">正在读取可用演示…</p>
    <div v-if="error" class="error-notice" role="alert">
      {{ error
      }}<button class="text-link plain-button" @click="load">重新加载</button>
    </div>
    <section v-if="selected" class="demo-introduction">
      <div>
        <h2>你会做些什么</h2>
        <ol>
          <li>准备工作区与读取4行合成样本</li>
          <li>选择倍数与范围，运行并观察结果</li>
          <li>记录自己的观察，填写简短反思</li>
        </ol>
        <p>预计6–10分钟。使用电脑或宽屏平板；不需要安装软件或自行配置环境。</p>
        <p>
          进度保存到当前账户。可以暂停、尝试另一个演示，再回来继续。未同步草稿仅存于本机，最多保留7天。
        </p>
        <p class="muted">
          完成演示不生成专业报告，也不代表完成AI、DS或BA专业体验。
        </p>
      </div>
      <div class="demo-start">
        <span v-if="current(selected.demoKey)" class="demo-status">{{
          labels[current(selected.demoKey)!.status]
        }}</span
        ><button
          class="action-link desktop-task-action"
          :disabled="busy"
          @click="begin(selected)"
        >
          <span>{{
            busy
              ? "正在确认进度…"
              : current(selected.demoKey)?.status === "PAUSED"
                ? "恢复这次演示"
                : current(selected.demoKey)?.status === "CLOSED"
                  ? "查看完成记录"
                  : current(selected.demoKey) &&
                      current(selected.demoKey)?.status !== "READY"
                    ? "继续演示"
                    : "开始这次演示"
          }}</span
          ><span class="action-arrow"><ArrowIcon /></span>
        </button>
        <div class="task-device-notice">
          这项任务需要较宽的表格和操作区域。请使用电脑或宽屏平板继续；手机可以查看进度。
        </div>
        <p>点击开始后才绑定当前内容版本。</p>
      </div>
    </section>
    <section v-else-if="!loading" class="demo-list" aria-label="技术演示列表">
      <article v-for="demo in demos" :key="demo.demoKey">
        <span class="serif">{{
          demo.demoKey === "DEMO_TABLE" ? "01" : "02"
        }}</span>
        <div>
          <h2>{{ demo.title }}</h2>
          <p>
            6–10分钟 · 合成数据 ·
            {{
              current(demo.demoKey)
                ? labels[current(demo.demoKey)!.status]
                : "尚未开始"
            }}
          </p>
          <RouterLink :to="`/app/demos/${demo.demoKey}`" class="text-link"
            >了解并进入 →</RouterLink
          >
        </div>
      </article>
      <p v-if="!demos.length">
        当前没有开放的技术演示。三个专业内容的发布状态不受此入口影响。
      </p>
    </section>
    <dialog
      ref="dialog"
      class="workspace-dialog"
      aria-labelledby="switch-title"
    >
      <h2 id="switch-title">暂停原体验，切换到这里？</h2>
      <p>
        原体验：{{
          demos.find((value) => value.demoKey === active?.demoKey)?.title ||
          "当前活动体验"
        }}
      </p>
      <p>目标：{{ selected?.title }}</p>
      <p>
        服务端已保存的进度会保留。若原页面还有未同步输入，请先取消并回到原页面保存。切换会同时暂停原体验并启动目标，不会让两次体验一起运行。
      </p>
      <div class="button-row">
        <button class="quiet-button" :disabled="busy" @click="dialog?.close()">
          取消切换</button
        ><button class="workspace-outline" :disabled="busy" @click="transition">
          确认暂停并切换
        </button>
      </div>
    </dialog>
  </main>
</template>
