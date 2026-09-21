<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { api, ApiError, errorText, stableOperation } from "../../lib/api";
import { useAuth, identityRequest, onIdentityChange } from "../../stores/auth";
import {
  verifyFeedbackOwner,
  readFeedbackDraft,
  writeFeedbackDraft,
  removeFeedbackDraft,
} from "../../lib/feedback-drafts";
import type { NextAction, ReportFeedback } from "../../types/reports";
const props = defineProps<{ versionId: string }>();
const auth = useAuth(),
  comment = ref(""),
  insight = ref<number | null>(null),
  clarity = ref<number | null>(null),
  nextAction = ref<NextAction | "">("");
const busy = ref(false),
  hydrating = ref(true),
  ready = ref(false),
  error = ref(""),
  success = ref(false),
  skipped = ref(false),
  storageWarning = ref("");
const operation = stableOperation(),
  length = computed(() => [...comment.value].length);
const choices: { value: NextAction; label: string }[] = [
  { value: "TRY_ANOTHER", label: "尝试另一专业" },
  { value: "LEARN_CURRENT", label: "进一步了解当前方向" },
  { value: "PAUSE_DECISION", label: "暂缓决定" },
  { value: "OTHER", label: "其他" },
  { value: "DECLINED", label: "不愿回答" },
];
let epoch = 0;
function clear() {
  epoch += 1;
  ready.value = false;
  hydrating.value = true;
  comment.value = "";
  insight.value = null;
  clarity.value = null;
  nextAction.value = "";
  busy.value = false;
  success.value = false;
  skipped.value = false;
  error.value = "";
}
const unsubscribe = onIdentityChange(clear);
watch(
  comment,
  (value) => {
    if (!ready.value || !auth.me || success.value) return;
    try {
      writeFeedbackDraft(auth.me.studentId, props.versionId, value);
      storageWarning.value = "";
    } catch (cause) {
      storageWarning.value = errorText(cause);
    }
  },
  { flush: "sync" },
);
onMounted(async () => {
  const ticket = identityRequest(),
    issuedAt = epoch;
  try {
    await auth.refresh(true);
    ticket.assertCurrent();
    if (issuedAt !== epoch || !auth.me) return;
    verifyFeedbackOwner(auth.me.studentId);
    comment.value = readFeedbackDraft(auth.me.studentId, props.versionId);
    ready.value = true;
  } catch (cause) {
    if (issuedAt === epoch) storageWarning.value = errorText(cause);
  } finally {
    ticket.finish();
    if (issuedAt === epoch) hydrating.value = false;
  }
});
onBeforeUnmount(() => {
  epoch += 1;
  unsubscribe();
});
async function submit() {
  if (!auth.me || busy.value || hydrating.value) return;
  if (length.value > 1000) {
    error.value = "评论最多1000字，请缩短后提交。";
    return;
  }
  const answers = {
    ...(insight.value === null ? {} : { insightResponse: insight.value }),
    ...(clarity.value === null ? {} : { clarityChange: clarity.value }),
    ...(nextAction.value ? { nextAction: nextAction.value } : {}),
  };
  if (!Object.keys(answers).length && !comment.value.trim()) {
    error.value = "请选择至少一项答案或填写评论，也可以直接跳过。";
    return;
  }
  const body: ReportFeedback = {
    feedbackType: "REPORT",
    contextType: "REPORT_VERSION",
    contextPublicId: props.versionId,
    ...(comment.value.trim() ? { comment: comment.value } : {}),
    ...(Object.keys(answers).length
      ? { surveyVersion: "report-value-v1", answers }
      : {}),
  };
  const ticket = identityRequest(),
    issuedAt = epoch;
  busy.value = true;
  error.value = "";
  try {
    await api("/api/app/v1/feedback", {
      method: "POST",
      body,
      key: operation(body),
      signal: ticket.signal,
    });
    ticket.assertCurrent();
    if (issuedAt !== epoch) return;
    success.value = true;
    try {
      removeFeedbackDraft(auth.me.studentId, props.versionId);
    } catch {
      /* A successful feedback is never resubmitted to fix local storage. */
    }
    comment.value = "";
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) auth.expire();
    if (issuedAt === epoch) error.value = errorText(cause);
  } finally {
    ticket.finish();
    if (issuedAt === epoch) busy.value = false;
  }
}
</script>
<template>
  <section class="report-feedback" aria-labelledby="feedback-title">
    <h2 id="feedback-title" class="serif">这份报告对你有帮助吗？</h2>
    <p>每题都可跳过。反馈不会改变报告或推荐，也不是继续体验的条件。</p>
    <p v-if="success" class="success-notice" role="status">
      反馈已收到，谢谢你。你的选择与报告不会因此改变。
    </p>
    <p v-else-if="skipped" role="status">已跳过反馈。你可以继续探索。</p>
    <form v-else @submit.prevent="submit">
      <p v-if="hydrating" role="status">正在核对账户并恢复本版本的评论草稿…</p>
      <div class="report-feedback-ratings">
        <fieldset>
          <legend>是否获得新的认识？（可选）</legend>
          <div class="report-rating-options">
            <label v-for="value in 5" :key="value"
              ><input
                v-model="insight"
                type="radio"
                name="insightResponse"
                :value="value"
                :disabled="busy || hydrating"
                :aria-label="`获得新的认识：${value}分`"
              /><span>{{ value }}</span></label
            >
          </div>
          <p class="report-rating-ends">
            <span>1 完全没有</span><span>5 很有帮助</span>
          </p>
          <button
            type="button"
            class="plain-button text-link"
            :disabled="busy || insight === null"
            @click="insight = null"
          >
            清除此题
          </button>
        </fieldset>
        <fieldset>
          <legend>选择方向是否更清楚？（可选）</legend>
          <div class="report-rating-options">
            <label v-for="value in 5" :key="value"
              ><input
                v-model="clarity"
                type="radio"
                name="clarityChange"
                :value="value"
                :disabled="busy || hydrating"
                :aria-label="`选择方向更清楚：${value}分`"
              /><span>{{ value }}</span></label
            >
          </div>
          <p class="report-rating-ends">
            <span>1 完全没有</span><span>5 清楚很多</span>
          </p>
          <button
            type="button"
            class="plain-button text-link"
            :disabled="busy || clarity === null"
            @click="clarity = null"
          >
            清除此题
          </button>
        </fieldset>
      </div>
      <label class="report-form-field"
        >接下来你倾向于？（可选）<select
          v-model="nextAction"
          name="nextAction"
          :disabled="busy || hydrating"
        >
          <option value="">暂不回答</option>
          <option
            v-for="choice in choices"
            :key="choice.value"
            :value="choice.value"
          >
            {{ choice.label }}
          </option>
        </select></label
      >
      <label class="report-form-field"
        >还有什么想告诉我们？（可选）<textarea
          v-model="comment"
          name="reportComment"
          rows="4"
          maxlength="2000"
          :disabled="busy || hydrating"
          aria-describedby="comment-note"
          placeholder="请勿填写敏感信息或他人的资料。"
        />
      </label>
      <p
        id="comment-note"
        class="report-comment-count"
        :class="{ 'is-error': length > 1000 }"
      >
        {{ length }} / 1000 字
      </p>
      <p v-if="storageWarning" class="warning-notice" role="status">
        {{ storageWarning }}
      </p>
      <p v-if="error" class="error-notice" role="alert">{{ error }}</p>
      <div class="report-feedback-actions">
        <button
          type="button"
          class="plain-button text-link"
          :disabled="busy"
          @click="skipped = true"
        >
          跳过，继续探索</button
        ><button
          class="quiet-button"
          :disabled="busy || hydrating || length > 1000"
        >
          {{ busy ? "正在提交…" : "提交反馈" }}
        </button>
      </div>
    </form>
  </section>
</template>
