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
import type { NextRecommendation } from "../types/reports";
import type { Run } from "../types/workspace";
const route = useRoute(),
  router = useRouter(),
  auth = useAuth();
const catalog = ref<MajorDifference[]>([]),
  runs = ref<Run[]>([]),
  recommendation = ref<Recommendation | NextRecommendation | null>(null),
  decision = ref<Decision | null>(null),
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
const completed = computed(() =>
  runs.value.some(
    (item) =>
      item.runMode === "STANDARD" &&
      item.majorCode === code.value &&
      item.status === "CLOSED",
  ),
);
const existing = computed(() =>
  [...runs.value]
    .reverse()
    .find(
      (item) =>
        item.runMode === "STANDARD" &&
        item.majorCode === code.value &&
        !["CLOSED", "REPLACED"].includes(item.status),
    ),
);
const selected = computed(
  () =>
    decision.value?.selectedMajorCode === code.value &&
    decision.value?.recommendationId === recommendation.value?.recommendationId,
);
function clear() {
  epoch++;
  catalog.value = [];
  runs.value = [];
  recommendation.value = null;
  decision.value = null;
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
    const [nextCatalog, nextRuns, dashboard] = await Promise.all([
      request<MajorDifference[]>("/api/public/v1/majors"),
      request<Run[]>("/api/app/v1/experience-runs"),
      request<Dashboard>("/api/app/v1/dashboard"),
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
async function choose() {
  if (!code.value || !recommendation.value || completed.value) return;
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
  } catch (cause) {
    if (issued === epoch) error.value = errorText(cause);
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
async function start() {
  if (!code.value || completed.value || (!existing.value && !selected.value))
    return;
  busy.value = true;
  error.value = "";
  const issued = epoch;
  try {
    const body = { decisionId: decision.value?.decisionId };
    const next =
      existing.value ||
      (await request<Run>("/api/app/v1/experience-runs", {
        method: "POST",
        body,
        key: operation(body),
      }));
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
    <p v-if="loading" role="status">正在读取正式体验介绍与当前进度…</p>
    <template v-else-if="code && definition"
      ><h1 class="serif">{{ major(code).name }}</h1>
      <h2>{{ major(code).chinese }}</h2>
      <p class="formal-description">{{ definition.description }}</p>
      <p>先阅读介绍，再决定是否体验。查看本页不会创建或开始体验记录。</p>
      <div class="notice">
        <p>
          通过任务观察工作方式、记录自己的体验，再结合证据比较。不是专业适配度测试或录取判断。
        </p>
        <p>开始后固定使用本次任务版本；可暂停、切换并继续原进度。</p>
      </div>
      <p v-if="completed" class="success-notice">
        这个正式专业体验已经完成。你可以在个人主页读取报告，不会重复创建本次方向的体验。
      </p>
      <template v-else
        ><p
          v-if="definition.availability !== 'AVAILABLE' && !existing"
          class="warning-notice"
        >
          正式内容暂未开放。你仍可保存选择；当前不会开始任务，也不会因此改写建议顺序。
        </p>
        <section v-if="recommendation && !existing" class="formal-choice">
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
          <template v-if="code !== recommendation.primaryMajor"
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
            class="quiet-button"
            :disabled="busy || selected"
            @click="choose"
          >
            {{ selected ? "已保存此选择" : "确认并保存选择" }}
          </button>
        </section>
        <p v-if="success" class="success-notice" role="status">{{ success }}</p>
        <button
          v-if="
            existing || (selected && definition.availability === 'AVAILABLE')
          "
          class="primary-button"
          :disabled="busy"
          @click="start"
        >
          {{
            busy
              ? "正在处理…"
              : existing?.status === "PAUSED"
                ? "恢复原体验进度"
                : existing && existing.status !== "READY"
                  ? "继续已保存体验"
                  : "开始正式体验"
          }}
        </button></template
      >
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
