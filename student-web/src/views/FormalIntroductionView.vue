<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, ApiError, errorText, stableOperation } from "../lib/api";
import { useAuth, identityRequest, onIdentityChange } from "../stores/auth";
import { major, majors as majorDefinitions } from "../data/majors";
import type {
  MajorCode,
  MajorDifference,
  Dashboard,
  Recommendation,
  Decision,
} from "../types";
import type { NextRecommendation, ReportPage } from "../types/reports";
import type { Run } from "../types/workspace";
import { productRun, currentDecisionFor, productAction } from "../lib/product-entry";
import ArrowIcon from "../components/ArrowIcon.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuth();
const catalog = ref<MajorDifference[]>([]),
  runs = ref<Run[]>([]),
  recommendation = ref<Recommendation | NextRecommendation | null>(null),
  decision = ref<Decision | null>(null),
  reports = ref<ReportPage | null>(null),
  loading = ref(true),
  busy = ref(false),
  error = ref(""),
  success = ref("");
const reason = ref("DECLINED"),
  other = ref("");
let epoch = 0;
const operation = stableOperation();
const code = computed(
    () =>
      majorDefinitions.find(
        (value) => value.code === String(route.params.major),
      )?.code,
  ),
  definition = computed(() =>
    code.value
      ? catalog.value.find((item) => item.majorCode === code.value)
      : undefined,
  );
const existing = computed(() => code.value ? productRun(runs.value, code.value) : undefined);
const completed = computed(() => existing.value?.status === "CLOSED");
const report = computed(() => reports.value?.items.find((item) => item.reportType === "EXPERIENCE" && item.majorCode === code.value && (!item.sourceRunId || item.sourceRunId === existing.value?.runId)));
const selected = computed(
  () => !!code.value && currentDecisionFor(decision.value, recommendation.value?.recommendationId, code.value),
);
function clear() {
  epoch++;
  catalog.value = [];
  runs.value = [];
  recommendation.value = null;
  decision.value = null;
  reports.value = null;
  error.value = "";
  success.value = "";
  busy.value = false;
}
const unsubscribe = onIdentityChange(clear);
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
  clear();
  loading.value = true;
  const issued = epoch;
  reason.value = "DECLINED";
  other.value = "";
  try {
    await auth.refresh(true);
    if (issued !== epoch) return;
    const [nextCatalog, nextRuns, dashboard, nextReports] = await Promise.all([
      request<MajorDifference[]>("/api/public/v1/majors"),
      request<Run[]>("/api/app/v1/experience-runs"),
      request<Dashboard>("/api/app/v1/dashboard"),
      request<ReportPage>("/api/app/v1/reports?limit=50").catch(() => null),
    ]);
    const id =
      typeof route.query.recommendationId === "string"
        ? route.query.recommendationId
        : undefined;
    const nextRecommendation = id
      ? await request<Recommendation | NextRecommendation>(
          `/api/app/v1/recommendations/${encodeURIComponent(id)}`,
        )
      : dashboard.nextRecommendation ||
        (dashboard.nextStep === "ALL_COMPLETED"
          ? null
          : dashboard.recommendation);
    if (issued !== epoch) return;
    catalog.value = nextCatalog;
    runs.value = nextRuns;
    reports.value = nextReports;
    decision.value = dashboard.currentDecision;
    recommendation.value = nextRecommendation;
  } catch (cause) {
    if (issued === epoch) error.value = errorText(cause);
  } finally {
    if (issued === epoch) loading.value = false;
  }
}
watch(() => route.fullPath, load, { immediate: true });
onBeforeUnmount(() => {
  epoch++;
  unsubscribe();
});
async function choose(): Promise<boolean> {
  if (busy.value || !code.value || !recommendation.value || completed.value) return false;
  busy.value = true;
  error.value = "";
  const issued = epoch;
  try {
    const rec = recommendation.value,
      body = {
        selectedMajorCode: code.value,
        ...(code.value !== rec.primaryMajor
          ? {
              overrideReasonCode: reason.value,
              ...(reason.value === "OTHER" && other.value
                ? { overrideText: other.value }
                : {}),
            }
          : {}),
      };
    decision.value = await request<Decision>(
      `/api/app/v1/recommendations/${rec.recommendationId}/decision`,
      {
        method: "POST",
        body,
        key: operation({ recommendationId: rec.recommendationId, ...body }),
      },
    );
    success.value = "选择已保存。还未创建或开始体验；由你决定何时开始。";
    return true;
  } catch (cause) {
    if (issued === epoch) error.value = errorText(cause);
    return false;
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
async function start() {
  if (busy.value || !code.value) return;
  if (window.innerWidth < 1024 && !completed.value) {
    if (existing.value) await router.push(`/app/runs/${existing.value.runId}`);
    return;
  }
  if (!existing.value && definition.value?.availability !== "AVAILABLE") return;
  const issued = epoch;
  if (!existing.value && recommendation.value && !selected.value && !await choose()) return;
  if (issued !== epoch) return;
  busy.value = true;
  error.value = "";
  try {
    if (completed.value && existing.value) {
      if (!report.value) reports.value = await request<ReportPage>("/api/app/v1/reports?limit=50");
      await router.push(report.value ? `/app/reports/${report.value.reportId}` : `/app/runs/${existing.value.runId}`);
      return;
    }
    const body = recommendation.value
      ? { decisionId: decision.value?.decisionId }
      : { majorCode: code.value };
    const next =
      existing.value ||
      (await request<Run>("/api/app/v1/experience-runs", {
        method: "POST",
        body,
        key: operation(body),
      }));
    if (!runs.value.some((run) => run.runId === next.runId)) runs.value.push(next);
    if (["READY", "PAUSED"].includes(next.status)) {
      const currentRuns = await request<Run[]>("/api/app/v1/experience-runs"),
        active = currentRuns.find(
          (item) =>
            item.runId !== next.runId &&
            ["IN_PROGRESS", "TASK_COMPLETED"].includes(item.status),
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
        },
        action = next.status === "PAUSED" ? "resume" : "start";
      await request<Run>(
        `/api/app/v1/experience-runs/${next.runId}/${action}`,
        {
          method: "POST",
          body: transition,
          key: operation({ runId: next.runId, action, ...transition }),
        },
      );
    }
    if (issued === epoch) await router.push(`/app/runs/${next.runId}`);
  } catch (cause) {
    if (issued === epoch) error.value = errorText(cause);
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
</script>
<template>
  <main class="content-page formal-introduction">
    <RouterLink to="/app" class="text-link">← 返回个人主页</RouterLink>
    <p v-if="loading" role="status">正在读取体验介绍与当前进度…</p>
    <template v-else-if="code && definition"
      ><h1 class="serif">{{ major(code).name }}</h1>
      <h2>{{ major(code).chinese }}</h2>
      <p class="formal-description">{{ definition.description }}</p>
      <p>先阅读介绍，再决定是否体验。查看本页不会创建或开始体验记录。</p>
      <p v-if="existing?.taskVersionId && (existing.experienceEdition || 1) === 1" class="notice">
        你保存的是旧版体验，继续时仍会使用原来的任务和记录。新版方法路线可在个人主页另行开始，不会覆盖这里的进度。
      </p>
      <section v-else class="formal-task-overview">
        <h2 class="serif">你会做些什么</h2>
        <ol>
          <li v-for="[title, description] in major(code).steps" :key="title"><strong>{{ title }}</strong><p>{{ description }}</p></li>
          <li><strong>回顾体验，阅读报告</strong><p>记录自己的感受，把实际操作与反思一起带入个人报告，再决定是否尝试另一专业。</p></li>
        </ol>
        <p>这次会留下：{{ major(code).outcome }}。</p>
      </section>
      <div class="notice">
        <p>
          通过任务观察工作方式、记录自己的体验，再结合证据比较。不是专业适配度测试或录取判断。
        </p>
        <p>开始后固定使用本次任务版本；可暂停、切换并继续原进度。</p>
        <p>建议使用电脑或宽屏平板完成任务；手机可以阅读介绍、进度和报告。</p>
      </div>
      <p v-if="completed" class="success-notice">
        这个专业体验已经完成。你的操作与反思已保存，可以继续查看体验报告。
      </p>
      <template v-else
        ><p
          v-if="definition.availability !== 'AVAILABLE' && !existing"
          class="warning-notice"
        >
          这个方向暂未开放。你仍可保存选择；已保存的建议和进度不受影响。
        </p>
        <section v-if="recommendation && !existing" class="formal-choice desktop-task-action">
          <h2 class="serif">
            {{
              code === recommendation.primaryMajor
                ? "接受这个体验顺序？"
                : "选择这个方向？"
            }}
          </h2>
          <p v-if="'recommendationType' in recommendation">
            这是已保存的下一专业建议，你可以自由改选尚未完成的专业。
          </p>
          <p v-if="selected">已保存这个选择。你可以直接开始体验。</p>
          <template v-if="!selected && code !== recommendation.primaryMajor"
            ><label class="report-form-field"
              >愿意补充改选原因吗？（可选）<select
                v-model="reason"
                name="overrideReason"
              >
                <option value="DECLINED">不愿回答</option>
                <option value="ALREADY_PREFERRED">
                  本来就更想体验这个方向
                </option>
                <option value="FAMILIAR_FIRST">想先体验更熟悉的方向</option>
                <option value="UNFAMILIAR_FIRST">想先体验最陌生的方向</option>
                <option value="TIME_OR_FORMAT">时间或任务形式更合适</option>
                <option value="OTHER">其他</option>
              </select></label
            ><label v-if="reason === 'OTHER'" class="report-form-field"
              >补充说明（可选）<textarea
                v-model="other"
                name="overrideText"
                rows="3"
                maxlength="300"
              /></label></template
          ><button
            v-if="definition.availability !== 'AVAILABLE'"
            class="quiet-button"
            :disabled="busy || selected"
            @click="choose"
          >
            {{ selected ? "已保存此选择" : "确认并保存选择" }}
          </button>
        </section>
        <p v-if="success" class="success-notice" role="status">{{ success }}</p>
        </template
      >
      <p v-if="!existing && !recommendation && definition.availability === 'AVAILABLE'" class="notice">无需先获得个性化推荐。你可以自主开始这个方向，背景资料之后仍可补充。</p>
      <button v-if="existing || definition.availability === 'AVAILABLE'"
        class="action-link action-small formal-start-action" :class="{ 'desktop-task-action': !completed }" :disabled="busy" @click="start">
        <span>{{ busy ? "正在打开…" : productAction(existing, report, major(code).short, definition.availability === 'AVAILABLE') }}</span>
        <span class="action-arrow"><ArrowIcon /></span>
      </button>
      <RouterLink v-if="existing && !completed" :to="`/app/runs/${existing.runId}`" class="text-link mobile-progress-action">查看已保存进度 →</RouterLink>
      <p v-if="!completed" class="task-device-notice">请在电脑或宽屏平板开始与继续任务；你的已保存进度不会改变。</p>
      <div class="formal-other-links">
        <h2 class="serif">了解其他方向</h2>
        <RouterLink
          v-for="item in catalog.filter((value) => value.majorCode !== code)"
          :key="item.majorCode"
          :to="{
            path: `/app/experiences/${item.majorCode}`,
            query: route.query,
          }"
          class="text-link"
          >{{ item.name }} →</RouterLink
        >
      </div>
    </template>
    <p v-else-if="!loading && !error">这个专业暂不可访问，请返回个人主页。</p>
    <div v-if="error" class="error-notice" role="alert">
      {{ error
      }}<button class="plain-button text-link" :disabled="busy" @click="load">
        重新读取
      </button>
    </div>
  </main>
</template>
<style scoped>
.formal-task-overview { margin: 32px 0; border-top: 1px solid var(--line); padding-top: 24px; }
.formal-task-overview h2 { font-size: 30px; }
.formal-task-overview ol { padding-left: 24px; margin: 20px 0; }
.formal-task-overview li { padding-left: 10px; margin: 18px 0; }
.formal-task-overview li::marker { color: var(--blue); }
.formal-task-overview li p { margin: 6px 0; }
.formal-start-action { margin-top: 22px; }
.mobile-progress-action { display: none; }
@media (max-width: 1023px) { .mobile-progress-action { display: inline-block; } }
@media (max-width: 600px) { .formal-start-action { width: 100%; } }
</style>
