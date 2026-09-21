<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError, errorText, stableOperation } from "../lib/api";
import { useAuth, identityRequest, onIdentityChange } from "../stores/auth";
import { major } from "../data/majors";
import { observeRecommendation } from "../lib/events";
import type { Dashboard, MajorCode, Decision } from "../types";
import RecommendationDetails from "../components/RecommendationDetails.vue";
import type { Run } from "../types/workspace";
import type { ReportPage, ComparisonResponse } from "../types/reports";
import { waitingLabels } from "../lib/report-display";
import NextRecommendationPanel from "../components/reports/NextRecommendationPanel.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
import { isProductRun, productRun, productAction, currentDecisionFor, runStatusLabel } from "../lib/product-entry";
const formalRuns = ref<Run[]>([]), decisionDialog = ref<HTMLDialogElement | null>(null);
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
  operation = stableOperation();
let dispose: undefined | (() => void);
let epoch = 0;
const reportPage = ref<ReportPage | null>(null),
  comparison = ref<ComparisonResponse | null>(null),
  reportError = ref("");
const activeRecommendation = computed(
  () =>
    dashboard.value?.nextRecommendation ||
    (dashboard.value?.nextStep === "ALL_COMPLETED"
      ? null
      : dashboard.value?.recommendation),
);
const runFor = (code: MajorCode) => productRun(formalRuns.value, code);
const reportFor = (code: MajorCode) => reportPage.value?.items.find(
  (item) => item.reportType === "EXPERIENCE" && item.majorCode === code,
);
const available = (code: MajorCode) => dashboard.value?.majors.find(
  (item) => item.majorCode === code,
)?.availability === "AVAILABLE";
const actionLabel = (code: MajorCode) => productAction(runFor(code), reportFor(code), major(code).short, available(code));
const unsubscribe = onIdentityChange(() => {
  epoch++;
  dashboard.value = null;
  formalRuns.value = [];
  reportPage.value = null;
  comparison.value = null;
  reportError.value = "";
  choosing.value = null;
  busy.value = false;
  error.value = "";
  decisionDialog.value?.close();
  dispose?.();
});
async function request<T>(
  path: string,
  options: Parameters<typeof api>[1] = {},
) {
  const ticket = identityRequest(),
    issued = epoch;
  try {
    const value = await api<T>(path, { ...options, signal: ticket.signal });
    ticket.assertCurrent();
    if (issued !== epoch) throw new ApiError(409, "IDENTITY_CHANGED");
    return value;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) auth.expire();
    throw cause;
  } finally {
    ticket.finish();
  }
}
async function load() {
  const issued = epoch;
  loading.value = true;
  error.value = "";
  dashboard.value = null;
  formalRuns.value = [];
  reportPage.value = null;
  comparison.value = null;
  try {
    await auth.refresh(true);
    if (issued !== epoch) return;
    if (!auth.me) {
      await router.replace("/login?returnTo=/app");
      return;
    }
    if (!auth.me.emailVerified) return;
    const nextDashboard = await request<Dashboard>("/api/app/v1/dashboard");
    const runs = await request<Run[]>("/api/app/v1/experience-runs");
    if (issued !== epoch) return;
    dashboard.value = nextDashboard;
    formalRuns.value = runs.filter(isProductRun);
    if (
      dashboard.value.recommendation &&
      !dashboard.value.nextRecommendation &&
      dashboard.value.nextStep !== "ALL_COMPLETED"
    ) {
      dispose?.();
      dispose = observeRecommendation(
        dashboard.value.recommendation.recommendationId,
        "app",
      );
    }
    reportError.value = "";
    try {
      const [reports, compared] = await Promise.all([
        request<ReportPage>("/api/app/v1/reports?limit=50"),
        request<ComparisonResponse>("/api/app/v1/comparison-report"),
      ]);
      reportPage.value = reports;
      comparison.value = compared;
    } catch (cause) {
      if (issued === epoch) reportError.value = errorText(cause);
    }
  } catch (cause) {
    if (issued !== epoch) return;
    error.value = errorText(cause);
    if (cause instanceof ApiError && cause.status === 401)
      await router.replace("/login?returnTo=/app");
  } finally {
    if (issued === epoch) loading.value = false;
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
async function choose(code: MajorCode) {
  if (busy.value) return;
  choosing.value = code;
  reason.value = "DECLINED";
  other.value = "";
  const issued = epoch;
  await nextTick();
  if (issued === epoch) decisionDialog.value?.showModal();
}
async function save() {
  if (!choosing.value || busy.value) return;
  await startFormal(choosing.value, true);
}
async function startFormal(code: MajorCode, overrideConfirmed = false) {
  if (busy.value || !dashboard.value) return;
  const recommendation = activeRecommendation.value;
  const existing = runFor(code);
  if (window.innerWidth < 1024 && existing?.status !== "CLOSED") {
    await router.push(existing ? `/app/runs/${existing.runId}` : `/app/experiences/${code}`);
    return;
  }
  if (!existing && !available(code)) {
    await router.push(`/app/experiences/${code}`);
    return;
  }
  if (!existing && !recommendation) return;
  if (!existing && recommendation && code !== recommendation.primaryMajor &&
      !currentDecisionFor(dashboard.value.currentDecision, recommendation.recommendationId, code) && !overrideConfirmed) {
    await choose(code);
    return;
  }
  busy.value = true;
  error.value = "";
  const issued = epoch;
  try {
    if (existing?.status === "CLOSED") {
      // Report lists are private and owner-scoped. Refresh when closure is newer than the page.
      if (!reportFor(code)) reportPage.value = await request<ReportPage>("/api/app/v1/reports?limit=50");
      const report = reportFor(code);
      await router.push(report ? `/app/reports/${report.reportId}` : `/app/runs/${existing.runId}`);
      return;
    }
    let decision = dashboard.value.currentDecision;
    if (!existing && recommendation && !currentDecisionFor(decision, recommendation.recommendationId, code)) {
      const body = {
        selectedMajorCode: code,
        ...(code !== recommendation.primaryMajor ? {
          overrideReasonCode: reason.value,
          ...(reason.value === "OTHER" ? { overrideText: other.value } : {}),
        } : {}),
      };
      decision = await request<Decision>(
        `/api/app/v1/recommendations/${recommendation.recommendationId}/decision`,
        { method: "POST", body, key: operation({ recommendationId: recommendation.recommendationId, ...body }) },
      );
      dashboard.value!.currentDecision = decision;
    }
    const body = { decisionId: decision?.decisionId };
    const next =
      existing ||
      (await request<Run>("/api/app/v1/experience-runs", {
        method: "POST",
        body,
        key: operation(body),
      }));
    if (!formalRuns.value.some((run) => run.runId === next.runId)) formalRuns.value.push(next);
    if (["READY", "PAUSED"].includes(next.status)) {
      const runs = await request<Run[]>("/api/app/v1/experience-runs"),
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
      await request<Run>(
        `/api/app/v1/experience-runs/${next.runId}/${action}`,
        {
          method: "POST",
          body: transition,
          key: operation({ runId: next.runId, action, ...transition }),
        },
      );
    }
    decisionDialog.value?.close();
    choosing.value = null;
    if (issued === epoch) await router.push(`/app/runs/${next.runId}`);
  } catch (cause) {
    if (issued === epoch) error.value = errorText(cause);
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  epoch++;
  dispose?.();
  unsubscribe();
});
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
        v-if="
          dashboard.recommendation &&
          !dashboard.nextRecommendation &&
          dashboard.nextStep !== 'ALL_COMPLETED'
        "
        class="dashboard-recommendation"
      >
        <span class="dashboard-major serif">{{
          major(dashboard.recommendation.primaryMajor).short
        }}</span>
        <div class="dashboard-recommendation-copy">
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
        <button
          class="action-link action-small dashboard-primary-action"
          :class="{ 'desktop-task-action': runFor(dashboard.recommendation.primaryMajor)?.status !== 'CLOSED' }"
          :disabled="busy"
          @click="startFormal(dashboard.recommendation.primaryMajor)"
        >
          <span>{{ busy ? "正在打开…" : actionLabel(dashboard.recommendation.primaryMajor) }}</span>
          <span class="action-arrow"><ArrowIcon /></span>
        </button>
        <RouterLink v-if="runFor(dashboard.recommendation.primaryMajor)?.status !== 'CLOSED'"
          :to="runFor(dashboard.recommendation.primaryMajor) ? `/app/runs/${runFor(dashboard.recommendation.primaryMajor)!.runId}` : `/app/experiences/${dashboard.recommendation.primaryMajor}`"
          class="action-link action-small dashboard-primary-action mobile-entry-action">
          <span>{{ runFor(dashboard.recommendation.primaryMajor) ? "查看体验进度" : "了解这次体验" }}</span>
          <span class="action-arrow"><ArrowIcon /></span>
        </RouterLink>
      </section>
      <RecommendationDetails
        v-if="
          showReasons &&
          dashboard.recommendation &&
          !dashboard.nextRecommendation &&
          dashboard.nextStep !== 'ALL_COMPLETED'
        "
        :value="dashboard.recommendation"
      />
      <section
        v-if="dashboard.nextRecommendation"
        class="dashboard-next-recommendation"
      >
        <div class="dashboard-next-heading">
          <h2 class="serif">下一次体验建议</h2>
          <button class="action-link action-small" :disabled="busy"
            :class="{ 'desktop-task-action': runFor(dashboard.nextRecommendation.primaryMajor)?.status !== 'CLOSED' }"
            @click="startFormal(dashboard.nextRecommendation.primaryMajor)">
            <span>{{ busy ? "正在打开…" : actionLabel(dashboard.nextRecommendation.primaryMajor) }}</span>
            <span class="action-arrow"><ArrowIcon /></span>
          </button>
          <RouterLink v-if="runFor(dashboard.nextRecommendation.primaryMajor)?.status !== 'CLOSED'"
            :to="runFor(dashboard.nextRecommendation.primaryMajor) ? `/app/runs/${runFor(dashboard.nextRecommendation.primaryMajor)!.runId}` : `/app/experiences/${dashboard.nextRecommendation.primaryMajor}`"
            class="action-link action-small mobile-entry-action">
            <span>{{ runFor(dashboard.nextRecommendation.primaryMajor) ? "查看体验进度" : "了解这次体验" }}</span><span class="action-arrow"><ArrowIcon /></span>
          </RouterLink>
        </div>
        <NextRecommendationPanel
          :recommendation-id="dashboard.nextRecommendation.recommendationId"
        />
      </section>
      <section
        v-else-if="dashboard.nextStep === 'ALL_COMPLETED'"
        class="dashboard-next-recommendation"
      >
        <h2 class="serif">三个方向，都留下了你的体验。</h2>
        <p>
          你可以继续阅读报告、比较不同的工作方式。完成体验不是最终专业决定，也不需要重复开始已完成方向。
        </p>
      </section>
      <div v-if="error && !choosing" class="error-notice" role="alert">
        {{ error }}<button class="plain-button text-link" :disabled="busy" @click="load">重新读取</button>
      </div>
      <section class="dashboard-majors" aria-label="三个专业体验">
        <article v-for="item in dashboard.majors" :key="item.majorCode">
          <div class="dashboard-major-title">
            <b class="serif">{{ major(item.majorCode).short }}</b>
            <div>
              <h2>{{ item.name }}</h2>
              <p>{{ major(item.majorCode).chinese }}</p>
            </div>
            <span>{{
              runFor(item.majorCode)
                ? runStatusLabel[runFor(item.majorCode)!.status]
                : "未开始"
            }}</span>
          </div>
          <p>{{ major(item.majorCode).description }}</p>
          <p v-if="item.availability !== 'AVAILABLE' && !runFor(item.majorCode)" class="muted">
            这个方向暂未开放，已保存的建议不受影响。
          </p>
          <div class="button-row">
            <button
              class="quiet-button"
              :class="{ 'desktop-task-action': runFor(item.majorCode)?.status !== 'CLOSED' }"
              :disabled="
                busy || (!runFor(item.majorCode) && !activeRecommendation && item.availability === 'AVAILABLE')
              "
              @click="startFormal(item.majorCode)"
            >
              {{ actionLabel(item.majorCode) }}</button
            ><RouterLink
              :to="{
                path: `/app/experiences/${item.majorCode}`,
                query: activeRecommendation
                  ? { recommendationId: activeRecommendation.recommendationId }
                  : {},
              }"
              class="text-link"
              >了解任务</RouterLink
            >
            <RouterLink v-if="runFor(item.majorCode) && runFor(item.majorCode)?.status !== 'CLOSED'" :to="`/app/runs/${runFor(item.majorCode)!.runId}`" class="text-link mobile-entry-action">查看进度</RouterLink>
          </div>
        </article>
      </section>
      <p class="task-device-notice">请使用电脑或宽屏平板开始与继续任务；手机可以查看介绍、已保存进度和报告。</p>
      <section class="dashboard-demo-link">
        <p>
          想先熟悉保存、运行与暂停操作？技术演示不属于任何专业，也不生成专业报告。
        </p>
        <RouterLink to="/app/demos" class="text-link"
          >打开工作区上手演示 →</RouterLink
        >
      </section>
      <dialog
        ref="decisionDialog"
        class="workspace-dialog product-decision-dialog"
        aria-labelledby="decision-title"
        @close="choosing = null"
        @cancel="busy && $event.preventDefault()"
      >
        <template v-if="choosing">
        <h2 id="decision-title" class="serif">
          先从 {{ major(choosing).name }} 开始了解。
        </h2>
        <p>
          你可以自由改选。确认后会保存这次选择并开始体验。
        </p>
        <template v-if="choosing !== activeRecommendation?.primaryMajor"
          ><label for="override-reason">愿意补充改选原因吗？（可选）</label
          ><select id="override-reason" v-model="reason" :disabled="busy">
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
            :disabled="busy"
          />
        </template>
        <div class="button-row">
          <button class="primary-button" :disabled="busy" @click="save">
            {{ busy ? "正在打开…" : "确认并开始体验" }}</button
          ><button
            class="quiet-button"
            :disabled="busy"
            @click="decisionDialog?.close()"
          >
            取消
          </button>
        </div>
        <p v-if="error" class="error-notice" role="alert">{{ error }}</p>
        </template>
      </dialog>
      <section class="dashboard-reports">
        <h2 class="serif">我的体验报告</h2>
        <p v-if="reportError" class="error-notice" role="alert">
          {{ reportError }}
          <button class="plain-button text-link" @click="load">重新读取</button>
        </p>
        <template v-else-if="reportPage"
          ><p
            v-if="
              !reportPage.items.some((item) => item.reportType === 'EXPERIENCE')
            "
          >
            完成专业任务与反思后，报告会在这里呈现你的实际操作、感受与下一步建议。
          </p>
          <article
            v-for="item in reportPage.items.filter(
              (value) => value.reportType === 'EXPERIENCE',
            )"
            :key="item.reportId"
            class="dashboard-report-row"
          >
            <div>
              <h3>
                {{ item.majorCode ? major(item.majorCode).name : "体验" }} 报告
              </h3>
              <p>
                {{
                  item.currentVersionId
                    ? `报告版本 ${item.versionNo} 已就绪`
                    : item.status === "FAILED"
                      ? "报告准备异常；体验仍已完成"
                      : "体验已完成，报告正在准备"
                }}
              </p>
            </div>
            <RouterLink
              :to="`/app/reports/${item.reportId}`"
              class="text-link"
              >{{
                item.currentVersionId ? "阅读报告 →" : "查看状态 →"
              }}</RouterLink
            >
          </article></template
        >
      </section>
      <section class="comparison-empty">
        <h2 class="serif">专业体验比较</h2>
        <template v-if="comparison"
          ><p v-if="comparison.state === 'WAITING'">
            {{ waitingLabels[comparison.reason] }}
          </p>
          <p v-else>把不同专业的经历并排，不合成为总分，也不替你作最终决定。</p>
          <RouterLink to="/app/comparison" class="text-link">{{
            comparison.state === "READY" ? "阅读比较报告 →" : "查看比较状态 →"
          }}</RouterLink></template
        >
        <p v-else-if="!reportError">正在读取比较状态…</p>
      </section></template
    >
    <div v-if="error && !dashboard" class="error-notice" role="alert">
      {{ error }}<button class="quiet-button" @click="load">重试</button>
    </div>
  </main>
</template>
<style scoped>
.dashboard-recommendation-copy { flex: 1; min-width: 0; }
.mobile-entry-action { display: none; }
.dashboard-recommendation .dashboard-primary-action { flex: 0 0 auto; margin: 0 0 0 auto; font-size: 18px; white-space: nowrap; }
.dashboard-next-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.dashboard-next-heading h2 { font-size: 32px; }
.product-decision-dialog label { display: block; margin: 20px 0 8px; }
.product-decision-dialog select, .product-decision-dialog textarea { width: 100%; padding: 12px; border: 1px solid var(--line); background: transparent; font: inherit; }
.product-decision-dialog .button-row { margin-top: 24px; }
.product-decision-dialog .primary-button { min-height: 48px; padding: 12px 24px; font-size: 17px; }
@media (max-width: 1050px) {
  .dashboard-recommendation { flex-wrap: wrap; }
  .dashboard-recommendation-copy { flex-basis: calc(100% - 145px); }
  .dashboard-recommendation .dashboard-primary-action { margin-left: 145px; }
}
@media (max-width: 1023px) {
  .mobile-entry-action { display: inline-flex; }
}
@media (max-width: 700px) {
  .dashboard-recommendation { display: grid; grid-template-columns: 96px minmax(0, 1fr); column-gap: 20px; row-gap: 18px; }
  .dashboard-recommendation .dashboard-major { align-self: start; }
  .dashboard-recommendation .dashboard-primary-action { grid-column: 1 / -1; margin-left: 0; width: 100%; font-size: 17px; }
  .dashboard-next-heading { align-items: flex-start; flex-direction: column; }
  .dashboard-next-heading .action-link { width: 100%; }
  .dashboard-major-title { flex-wrap: wrap; }
  .dashboard-major-title > div { min-width: 0; flex: 1; }
  .dashboard-major-title > span { margin-left: 72px; }
}
</style>
