<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { api, ApiError, errorText } from "../../lib/api";
import { identityRequest, onIdentityChange, useAuth } from "../../stores/auth";
import {
  observePrivateContent,
  sendPrivateObservation,
} from "../../lib/events";
import { major } from "../../data/majors";
import type { NextRecommendation } from "../../types/reports";
import ArrowIcon from "../ArrowIcon.vue";
const props = defineProps<{ recommendationId: string }>();
const auth = useAuth();
const value = ref<NextRecommendation | null>(null),
  error = ref(""),
  showAlternatives = ref(false),
  core = ref<HTMLElement | null>(null);
let epoch = 0,
  dispose: (() => void) | undefined;
const unsubscribe = onIdentityChange(() => {
  epoch++;
  value.value = null;
  error.value = "";
  dispose?.();
});
watch(
  () => props.recommendationId,
  async (id) => {
    const issued = ++epoch,
      ticket = identityRequest();
    value.value = null;
    error.value = "";
    dispose?.();
    try {
      const body = await api<NextRecommendation>(
        `/api/app/v1/recommendations/${id}`,
        { signal: ticket.signal },
      );
      ticket.assertCurrent();
      if (issued !== epoch) return;
      if (body.recommendationType !== "NEXT")
        throw new Error("此入口不是下一专业建议，请返回个人主页。");
      value.value = body;
      await nextTick();
      if (issued === epoch && core.value)
        dispose = observePrivateContent(core.value, () =>
          sendPrivateObservation("next_recommendation.viewed", id),
        );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 401 ||
          (cause.status === 403 &&
            ["ACCOUNT_LOCKED", "EMAIL_NOT_VERIFIED"].includes(cause.code)))
      )
        auth.expire();
      if (issued === epoch) error.value = errorText(cause);
    } finally {
      ticket.finish();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  epoch++;
  dispose?.();
  unsubscribe();
});
const link = (code: string) => ({
  path: `/app/experiences/${code}`,
  query: { recommendationId: props.recommendationId },
});
</script>
<template>
  <div class="report-next-panel">
    <p v-if="error" class="error-notice" role="alert">
      {{ error }} <RouterLink to="/app">返回个人主页</RouterLink>
    </p>
    <template v-else-if="value"
      ><div ref="core">
        <h3 class="serif blue">{{ major(value.primaryMajor).name }}</h3>
        <p v-for="reason in value.reasons" :key="reason.code">
          {{ reason.text }}
        </p>
        <p class="muted">
          这是体验顺序建议，不是能力或适合度排名；你可以自由改选。
        </p>
        <p
          v-if="
            value.differences.find(
              (item) => item.majorCode === value?.primaryMajor,
            )?.availability !== 'AVAILABLE'
          "
          class="notice"
        >
          这个方向暂未开放正式内容。建议顺序保留不变，你仍可了解或选择其他方向。
        </p>
      </div>
      <div class="button-row">
        <RouterLink class="primary-button" :to="link(value.primaryMajor)"
          ><span>了解下一项体验</span><ArrowIcon /></RouterLink
        ><button
          class="plain-button text-link"
          @click="showAlternatives = !showAlternatives"
        >
          {{ showAlternatives ? "收起其他专业" : "选择其他专业" }}
        </button>
      </div>
      <div v-if="showAlternatives" class="report-alternatives">
        <article v-for="code in value.alternativeMajors" :key="code">
          <h4>{{ major(code).name }}</h4>
          <p>
            {{
              value.differences.find((item) => item.majorCode === code)
                ?.description
            }}
          </p>
          <p class="muted">
            {{
              value.differences.find((item) => item.majorCode === code)
                ?.availability === "AVAILABLE"
                ? "正式内容已开放"
                : "正式内容暂未开放"
            }}
          </p>
          <RouterLink :to="link(code)" class="text-link"
            >了解这个方向 →</RouterLink
          >
        </article>
      </div></template
    >
    <p v-else role="status">正在读取已保存的下一专业建议…</p>
  </div>
</template>
