<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError, errorText, stableOperation } from "../lib/api";
import { useAuth } from "../stores/auth";
import { major } from "../data/majors";
import { observeRecommendation } from "../lib/events";
import type { Dashboard, MajorCode, Decision } from "../types";
import RecommendationDetails from "../components/RecommendationDetails.vue";
import type { PreviewTask, Run } from "../types/workspace";
const previewAvailable = ref(false),
  formalRuns = ref<Run[]>([]);
const auth = useAuth(),
  router = useRouter(),
  dashboard = ref<Dashboard | null>(null),
  loading = ref(true),
  error = ref(""),
  busy = ref(false),
  showReasons = ref(false),
  choosing = ref<MajorCode | null>(null),
  reason = ref("DECLINED"),
  other = ref(""),
  success = ref(""),
  operation = stableOperation();
let dispose: undefined | (() => void);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    await auth.refresh(true);
    if (!auth.me) {
      await router.replace("/login?returnTo=/app");
      return;
    }
    if (!auth.me.emailVerified) return;
    dashboard.value = await api<Dashboard>("/api/app/v1/dashboard");
    const [previews, runs] = await Promise.all([
      api<PreviewTask[]>("/api/app/v1/review-preview-tasks").catch(() => []),
      api<Run[]>("/api/app/v1/experience-runs").catch(() => []),
    ]);
    previewAvailable.value = previews.length > 0;
    formalRuns.value = runs.filter(
      (value) => value.contentKind === "MAJOR" && value.runMode === "STANDARD",
    );
    if (dashboard.value.recommendation) {
      dispose?.();
      dispose = observeRecommendation(
        dashboard.value.recommendation.recommendationId,
        "app",
      );
    }
  } catch (cause) {
    error.value = errorText(cause);
    if (cause instanceof ApiError && cause.status === 401)
      await router.replace("/login?returnTo=/app");
  } finally {
    loading.value = false;
  }
}
async function logout() {
  busy.value = true;
  error.value = "";
  try {
    await auth.logout();
    await router.push("/login");
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
function choose(code: MajorCode) {
  choosing.value = code;
  reason.value = "DECLINED";
  other.value = "";
  success.value = "";
}
async function save() {
  const recommendation = dashboard.value?.recommendation;
  if (!recommendation || !choosing.value) return;
  busy.value = true;
  error.value = "";
  try {
    const body = {
      selectedMajorCode: choosing.value,
      ...(choosing.value !== recommendation.primaryMajor
        ? {
            overrideReasonCode: reason.value,
            ...(reason.value === "OTHER" ? { overrideText: other.value } : {}),
          }
        : {}),
    };
    const decision = await api<Decision>(
      `/api/app/v1/recommendations/${recommendation.recommendationId}/decision`,
      { method: "POST", body, key: operation(body) },
    );
    dashboard.value!.currentDecision = decision;
    choosing.value = null;
    success.value = `已保存：${major(decision.selectedMajorCode).name}。${dashboard.value!.majors.find((value) => value.majorCode === decision.selectedMajorCode)?.availability === "AVAILABLE" ? "内容已发布，可主动开始正式体验。" : "专业任务内容准备中，尚未开始正式体验。"}`;
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function startFormal(code: MajorCode) {
  const decision = dashboard.value?.currentDecision;
  if (!decision || decision.selectedMajorCode !== code) return;
  busy.value = true;
  error.value = "";
  try {
    const existing = formalRuns.value.find(
      (value) => value.majorCode === code && value.status !== "REPLACED",
    );
    const body = { decisionId: decision.decisionId };
    const next =
      existing ||
      (await api<Run>("/api/app/v1/experience-runs", {
        method: "POST",
        body,
        key: operation(body),
      }));
    if (["READY", "PAUSED"].includes(next.status)) {
      const runs = await api<Run[]>("/api/app/v1/experience-runs"),
        active = runs.find(
          (value) =>
            value.runId !== next.runId &&
            ["IN_PROGRESS", "TASK_COMPLETED"].includes(value.status),
        );
      if (
        active &&
        !window.confirm(
          "暂停当前活动体验并保留已保存进度，切换到这个专业？未同步内容请先返回原页面保存。",
        )
      )
        return;
      const transition = {
        expectedRevision: next.revision,
        ...(active
          ? {
              pauseActiveRunId: active.runId,
              expectedActiveRunRevision: active.revision,
            }
          : {}),
      };
      const action = next.status === "PAUSED" ? "resume" : "start";
      await api<Run>(`/api/app/v1/experience-runs/${next.runId}/${action}`, {
        method: "POST",
        body: transition,
        key: operation({ action, ...transition }),
      });
    }
    await router.push(`/app/runs/${next.runId}`);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => dispose?.());
</script>
<template>
  <main class="dashboard-page">
    <div class="dashboard-top">
      <h1 class="serif">继续你的专业探索。</h1>
      <div>
        <RouterLink to="/app/settings" class="text-link">账户与数据</RouterLink
        ><button class="plain-button" :disabled="busy" @click="logout">
          退出
        </button>
      </div>
    </div>
    <div v-if="loading" class="loading-state" role="status">
      正在读取已保存的资料…
    </div>
    <div v-else-if="auth.me && !auth.me.emailVerified" class="content-page">
      <h2>先验证你的邮箱</h2>
      <p>资料已保存。验证邮箱后，即可查看初始建议并选择方向。</p>
      <RouterLink to="/verify-email" class="text-link"
        >打开验证与重发入口</RouterLink
      ><button class="quiet-button" @click="load">已验证？刷新状态</button>
    </div>
    <template v-else-if="dashboard"
      ><section
        v-if="dashboard.recommendation"
        class="dashboard-recommendation"
      >
        <span class="dashboard-major serif">{{
          major(dashboard.recommendation.primaryMajor).short
        }}</span>
        <div>
          <p class="muted">你的初始建议</p>
          <h2>{{ major(dashboard.recommendation.primaryMajor).name }}</h2>
          <p>先安排尝试顺序，不代表适配结论。你可以自由改选。</p>
          <button
            class="text-link plain-button"
            @click="showReasons = !showReasons"
          >
            {{ showReasons ? "收起建议依据" : "查看建议依据" }}
          </button>
        </div>
      </section>
      <RecommendationDetails
        v-if="showReasons && dashboard.recommendation"
        :value="dashboard.recommendation"
      />
      <div v-if="success" class="success-notice" role="status">
        {{ success }}
      </div>
      <section class="dashboard-majors" aria-label="三个专业初始状态">
        <article v-for="item in dashboard.majors" :key="item.majorCode">
          <div class="dashboard-major-title">
            <b class="serif">{{ major(item.majorCode).short }}</b>
            <div>
              <h2>{{ item.name }}</h2>
              <p>{{ major(item.majorCode).chinese }}</p>
            </div>
            <span>{{
              formalRuns.find((value) => value.majorCode === item.majorCode)
                ?.status === "CLOSED"
                ? "体验已完成"
                : formalRuns.find((value) => value.majorCode === item.majorCode)
                  ? "已保存进度"
                  : "未开始"
            }}</span>
          </div>
          <p>{{ major(item.majorCode).description }}</p>
          <p class="muted">
            {{
              item.availability === "AVAILABLE"
                ? "正式内容已发布"
                : "专业任务内容准备中"
            }}
          </p>
          <div class="button-row">
            <button
              class="quiet-button"
              :disabled="busy"
              @click="choose(item.majorCode)"
            >
              {{
                dashboard.currentDecision?.selectedMajorCode === item.majorCode
                  ? "已选 · 修改选择"
                  : dashboard.recommendation?.primaryMajor === item.majorCode
                    ? "接受这个建议"
                    : "选择这个方向"
              }}</button
            ><RouterLink :to="`/majors/${item.majorCode}`" class="text-link"
              >了解任务</RouterLink
            >
          </div>
          <button
            v-if="
              item.availability === 'AVAILABLE' &&
              dashboard.currentDecision?.selectedMajorCode === item.majorCode
            "
            class="workspace-outline"
            :disabled="busy"
            @click="startFormal(item.majorCode)"
          >
            {{
              formalRuns.find((value) => value.majorCode === item.majorCode)
                ? "打开已保存体验"
                : "开始正式体验"
            }}
          </button>
        </article>
      </section>
      <section class="dashboard-demo-link">
        <p>
          想先熟悉保存、运行与暂停操作？技术演示不属于任何专业，也不生成专业报告。
        </p>
        <RouterLink to="/app/demos" class="text-link"
          >打开工作区上手演示 →</RouterLink
        >
      </section>
      <section v-if="previewAvailable" class="dashboard-demo-link">
        <p>仅本地工程预览：尚待专业审核与真实用户计时，不计正式完成。</p>
        <RouterLink to="/app/review-previews" class="text-link"
          >打开内容工程预览 →</RouterLink
        >
      </section>
      <section
        v-if="choosing"
        class="decision-panel"
        aria-labelledby="decision-title"
      >
        <h2 id="decision-title" class="serif">
          先从 {{ major(choosing).name }} 开始了解。
        </h2>
        <p>本次仅保存选择。正式任务内容仍在准备中，不会创建体验记录。</p>
        <template v-if="choosing !== dashboard.recommendation?.primaryMajor"
          ><label for="override-reason">愿意补充改选原因吗？（可选）</label
          ><select id="override-reason" v-model="reason">
            <option value="DECLINED">不愿回答</option>
            <option value="ALREADY_PREFERRED">本来就更想先体验这个方向</option>
            <option value="FAMILIAR_FIRST">想先体验更熟悉的方向</option>
            <option value="UNFAMILIAR_FIRST">想先体验最陌生的方向</option>
            <option value="TIME_OR_FORMAT">时间或任务形式更合适</option>
            <option value="OTHER">其他</option></select
          ><label v-if="reason === 'OTHER'" for="override-text"
            >补充说明（可选）</label
          ><textarea
            v-if="reason === 'OTHER'"
            id="override-text"
            v-model="other"
            maxlength="300"
            rows="3"
          />
        </template>
        <div class="button-row">
          <button class="primary-button" :disabled="busy" @click="save">
            确认并保存选择</button
          ><button
            class="quiet-button"
            :disabled="busy"
            @click="choosing = null"
          >
            取消
          </button>
        </div>
      </section>
      <div class="comparison-empty">
        <h2 class="serif">比较报告</h2>
        <p>
          专业任务开放并完成两个方向后，才会形成基于真实体验证据的比较。当前没有报告。
        </p>
      </div></template
    >
    <div v-if="error" class="error-notice" role="alert">
      {{ error }}<button class="quiet-button" @click="load">重试</button>
    </div>
  </main>
</template>
