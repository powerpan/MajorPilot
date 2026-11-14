<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { useIntake } from "../stores/intake";
import { ApiError, errorText } from "../lib/api";
import type { AnswerValue, Field } from "../types";
import { partialProblem, skipUnanswered } from "../lib/profile";
import QuestionField from "../components/QuestionField.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
const store = useIntake(),
  route = useRoute(),
  router = useRouter();
const busy = ref(false),
  booting = ref(true),
  error = ref(""),
  showValidation = ref(false),
  offline = ref(!navigator.onLine),
  heading = ref<HTMLElement | null>(null);
const serverFields = ref<Record<string, string>>({});
const number = computed(() =>
    Math.min(12, Math.max(1, Number(route.params.step) || 1)),
  ),
  page = computed(() => store.definition?.pages[number.value - 1]);
let timer: ReturnType<typeof setTimeout> | undefined;
function validate(field: Field) {
  return partialProblem(field, store.answers[field.key]);
}
function change(key: string, value: AnswerValue) {
  if (!page.value) return;
  delete serverFields.value[key];
  store.setAnswer(page.value.stepKey, key, value);
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (navigator.onLine && !store.conflict) void store.flush().catch(() => {});
  }, 650);
}
async function retry() {
  error.value = "";
  try {
    await store.flush();
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function focusProblem() {
  await nextTick();
  const panel = heading.value?.closest<HTMLElement>(".intake-form-panel");
  const field = panel?.querySelector<HTMLElement>(".field-error")?.closest<HTMLElement>(".question-field");
  const target = field || panel?.querySelector<HTMLElement>(".error-notice") || heading.value;
  target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  (field?.querySelector<HTMLElement>("input,select,textarea,button") || target)?.focus({ preventScroll: true });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) target?.animate([{ outline: "3px solid #4b50ff" }, { outline: "3px solid transparent" }], { duration: 1200 });
}
async function advance(skip = false) {
  if (!page.value || busy.value) return;
  showValidation.value = true;
  if (page.value.fields.some((field) => validate(field))) { await focusProblem(); return; }
  if (number.value === 12 || skip) {
    const incomplete = store.definition?.pages.find((item) =>
      item.fields.some((field) => validate(field)),
    );
    if (incomplete) {
      await router.push(`/intake/${incomplete.number}`);
      await nextTick();
      showValidation.value = true;
      error.value = "有一项内容需要调整，已回到对应页面。其他问题可以跳过。";
      await focusProblem();
      return;
    }
  }
  busy.value = true;
  error.value = "";
  clearTimeout(timer);
  try {
    if (skip && store.definition && !store.pendingFinish) {
      const next = skipUnanswered(store.definition, store.answers);
      for (const item of store.definition.pages) for (const field of item.fields)
        if (next[field.key] === null && store.answers[field.key] !== null) store.setAnswer(item.stepKey, field.key, null);
    }
    await store.flush();
    if (store.conflict) return;
    if (number.value === 12 || skip || store.pendingFinish) {
      const result = await store.finish();
      await router.push(!skip && result.recommendation ? "/recommendation" : "/register");
    } else await router.push(`/intake/${number.value + 1}`);
  } catch (cause) {
    error.value = errorText(cause);
    if (cause instanceof ApiError)
      for (const item of cause.fields || [])
        if (item.field)
          serverFields.value[item.field] =
            "这一项未通过验证，请检查选项、字数或特殊字符。";
    await focusProblem();
  } finally {
    busy.value = false;
  }
}
async function startOver() {
  busy.value = true;
  try {
    await store.restart();
    error.value = "";
    await router.replace("/intake/1");
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
async function useServer() {
  try {
    await store.loadServer();
    error.value = "";
  } catch (cause) {
    error.value = errorText(cause);
  }
}
function connectivity() {
  offline.value = !navigator.onLine;
  if (navigator.onLine && store.hasUnsaved && !store.conflict) void retry();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (store.hasUnsaved) {
    event.preventDefault();
    event.returnValue = "";
  }
}
watch(number, async () => {
  showValidation.value = false;
  error.value = "";
  await nextTick();
  heading.value?.focus();
});
onMounted(async () => {
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  window.addEventListener("beforeunload", beforeUnload);
  try {
    await store.init(true);
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    booting.value = false;
  }
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  window.removeEventListener("online", connectivity);
  window.removeEventListener("offline", connectivity);
  window.removeEventListener("beforeunload", beforeUnload);
});
onBeforeRouteLeave((to) => {
  if (
    !to.path.startsWith("/intake/") &&
    store.hasUnsaved &&
    !window.confirm("还有尚未同步的答案。本机草稿会保留，仍要离开吗？")
  )
    return false;
});
</script>
<template>
  <main class="intake-layout">
    <aside class="intake-aside">
      <h1 class="sr-only">说说你的选择</h1>
      <div class="intake-progress-copy">
        <span class="serif">{{ String(number).padStart(2, "0") }}</span
        ><span>/ 12</span>
      </div>
    </aside>
    <div class="intake-form-panel">
      <div v-if="booting" class="loading-state" role="status">
        正在恢复填写进度…
      </div>
      <template v-else-if="page && store.view"
        ><div
          class="intake-progress"
          role="progressbar"
          aria-label="填写进度"
          :aria-valuenow="number"
          :aria-valuemin="1"
          :aria-valuemax="12"
        >
          <span :style="{ width: `${(number / 12) * 100}%` }" />
        </div>
        <div class="form-step-top">
          <span>{{
            number <= 5
              ? "了解你的起点"
              : number <= 9
                ? "看看你想探索什么"
                : "说说你的关注点"
          }}</span
          ><span>每题可跳过</span>
        </div>
        <h2 ref="heading" tabindex="-1">{{ page.title }}</h2>
        <p class="question-why">{{ page.why }}</p>
        <p class="field-help">只填写你愿意分享的内容。没有足够偏好信息时不生成个性化推荐，也不会影响你注册后自主选择专业。</p>
        <div v-if="offline" class="notice" role="status">
          当前离线，答案保留在本机。连接恢复后保存。
        </div>
        <div v-if="store.conflict" class="error-notice" role="alert">
          <strong>检测到另一页面的较新版本</strong>
          <p>
            当前本机版本 {{ store.view?.revision }}；服务器版本
            {{
              store.failure instanceof ApiError
                ? store.failure.currentRevision
                : "已更新"
            }}。未自动覆盖任何一方。
          </p>
          <details>
            <summary>查看并复制本机草稿</summary>
            <pre class="local-draft">{{
              JSON.stringify(store.answers, null, 2)
            }}</pre>
          </details>
          <button class="quiet-button" @click="useServer">
            放弃本机未同步更改，加载服务器版本
          </button>
        </div>
        <form @submit.prevent="advance()">
          <fieldset class="intake-questions" :disabled="busy || store.conflict || !!store.pendingFinish">
          <div v-for="field in page.fields" :key="field.key">
          <QuestionField
            :field="field"
            :model-value="store.answers[field.key]"
            :error="
              serverFields[field.key] || (showValidation ? validate(field) : '')
            "
            @update:model-value="change(field.key, $event)"
          />
          <p class="skip-question"><span v-if="store.answers[field.key] === null">已主动跳过</span><button type="button" class="text-link" :disabled="store.answers[field.key] === null" @click="change(field.key, null)">跳过这题</button></p>
          </div>
          </fieldset>
          <div v-if="store.pendingFinish" class="notice"><p>上次提交结果尚未确认。重试会使用同一次请求，不会重复创建资料。</p><button type="button" class="quiet-button" :disabled="busy || offline" @click="advance(true)">确认上次提交结果</button></div>
          <div v-if="error || store.failure" class="error-notice" role="alert">
            {{ error || errorText(store.failure) }}
            <div
              v-if="
                store.failure instanceof ApiError &&
                [
                  'INTAKE_EXPIRED',
                  'QUESTIONNAIRE_VERSION_STALE',
                  'RESOURCE_NOT_FOUND',
                ].includes(store.failure.code)
              "
              class="button-row"
            >
              <button type="button" class="quiet-button" @click="startOver">
                重新开始</button
              ><RouterLink to="/login" class="text-link"
                >已注册？登录恢复资料</RouterLink
              >
            </div>
            <button
              v-else-if="!store.conflict"
              type="button"
              class="quiet-button"
              @click="retry"
            >
              重试保存
            </button>
          </div>
          <div class="intake-controls">
            <RouterLink
              v-if="number > 1"
              :to="`/intake/${number - 1}`"
              class="quiet-button"
              >上一步</RouterLink
            ><button
              v-if="!store.pendingFinish"
              type="button"
              class="plain-button"
              :disabled="busy || store.conflict || offline"
              @click="advance(true)"
            >
              暂不填写，继续注册</button
            ><button
              type="submit"
              class="primary-button"
              :disabled="busy || store.conflict || offline || !!store.pendingFinish"
            >
              <span>{{
                busy
                  ? "正在保存…"
                  : number === 12
                    ? "保存资料并继续"
                    : "保存并继续"
              }}</span
              ><span class="action-arrow"><ArrowIcon /></span>
            </button>
          </div>
          <p class="save-state" aria-live="polite">
            {{
              store.saving
                ? "正在保存…"
                : store.hasUnsaved
                  ? "本机草稿尚未同步"
                  : store.savedAt
                    ? `已自动保存 ${store.savedAt}`
                    : "答案将自动保存"
            }}<span v-if="store.view"> · 最近有效操作后保留7天</span>
          </p>
        </form></template
      >
      <div v-else class="error-notice" role="alert">
        {{ error || "暂时无法加载问卷。"
        }}<button class="quiet-button" @click="startOver">重试</button>
      </div>
    </div>
  </main>
</template>
<style scoped>button.text-link{appearance:none;border:0;border-bottom:1px solid currentColor;background:transparent;padding:0 0 3px;text-align:left}.intake-questions{border:0;margin:0;padding:0;min-width:0}.skip-question{display:flex;justify-content:flex-end;gap:16px;align-items:center;font-size:14px;margin:12px 0 24px}.skip-question span{color:var(--muted)}.intake-controls{flex-wrap:wrap}</style>
