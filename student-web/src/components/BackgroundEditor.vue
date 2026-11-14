<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { api, ApiError, errorText } from "../lib/api";
import { partialProblem, profileLabels, skipUnanswered, type ProfileInput, type ProfileState, type ProfileSubmission } from "../lib/profile";
import { identityRequest, onIdentityChange, useAuth } from "../stores/auth";
import type { Answers, AnswerValue, Questionnaire } from "../types";
import QuestionField from "./QuestionField.vue";
import ArrowIcon from "./ArrowIcon.vue";

const props = defineProps<{ blank?: boolean }>();
const emit = defineEmits<{ done: []; cancel: [] }>();
const auth = useAuth();
const definition = ref<Questionnaire | null>(null), state = ref<ProfileState | null>(null);
const answers = ref<Answers>({}), step = ref(0), revision = ref(0), baseVersion = ref(0), mode = ref<"EDIT" | "RESTART">("EDIT");
const loading = ref(true), busy = ref(false), saving = ref(false), dirty = ref(false), conflict = ref(false), error = ref(""), saved = ref("");
const showErrors = ref(false), offline = ref(!navigator.onLine), root = ref<HTMLElement | null>(null), heading = ref<HTMLElement | null>(null);
const pending = ref<{ body: ProfileInput; key: string } | null>(null);
const page = computed(() => definition.value?.pages[step.value]);
const disabled = computed(() => busy.value || conflict.value || !!pending.value);
let cacheKey = "", legacyKey = "", timer: ReturnType<typeof setTimeout> | undefined, queue: Promise<void> | null = null, leaving = false;
let generation = 0;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function cache() {
  if (!cacheKey || !definition.value) return;
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ questionnaireVersion: definition.value.questionnaireVersion, answers: answers.value, step: step.value, revision: revision.value, baseVersion: baseVersion.value, mode: mode.value, dirty: dirty.value, pending: pending.value })); }
  catch { /* Server drafts remain available when browser storage is denied. */ }
}
const unsubscribe = onIdentityChange(() => {
  generation++; clearTimeout(timer); if (cacheKey) try { sessionStorage.removeItem(cacheKey); } catch { /* Storage denied. */ }
  cacheKey = ""; legacyKey = ""; answers.value = {}; state.value = null; pending.value = null; dirty.value = false; conflict.value = true;
  error.value = "登录身份已变化，请重新打开我的资料。";
});
function input(): ProfileInput {
  return { questionnaireVersion: definition.value!.questionnaireVersion, expectedRevision: revision.value, baseProfileVersion: baseVersion.value, answers: clone(answers.value), lastStepKey: page.value?.stepKey || "step-1", mode: mode.value };
}
async function request<T>(path: string, options: Parameters<typeof api>[1] = {}): Promise<T> {
  const ticket = identityRequest();
  try { const value = await api<T>(path, { ...options, signal: ticket.signal }); ticket.assertCurrent(); return value; }
  finally { ticket.finish(); }
}
function adopt(server: ProfileState, blank = false) {
  state.value = server; revision.value = server.draftRevision;
  baseVersion.value = blank ? (server.profile?.profileVersion || 0) : (server.draft?.baseProfileVersion ?? server.profile?.profileVersion ?? 0);
  answers.value = blank ? {} : clone(server.draft?.answers || server.profile?.answers || {});
  mode.value = blank ? "RESTART" : server.draft?.mode || "EDIT";
  step.value = blank ? 0 : Math.max(0, definition.value!.pages.findIndex(item => item.stepKey === server.draft?.lastStepKey));
  dirty.value = blank; conflict.value = !blank && !!server.draft && server.draft.baseProfileVersion !== (server.profile?.profileVersion || 0);
  pending.value = null; saved.value = server.draft ? "已恢复尚未提交的草稿" : "";
}
async function load(useServer = false) {
  const issued = generation; loading.value = true; error.value = "";
  try {
    const [server, questions] = await Promise.all([request<ProfileState>("/api/app/v1/profile"), request<Questionnaire>("/api/public/v1/questionnaires/current")]);
    if (issued !== generation) return;
    definition.value = questions; cacheKey = `mp:profile-editor:${auth.me!.studentId}`; legacyKey = `mp:pilot-intake:${auth.me!.studentId}`;
    let cached: { questionnaireVersion?: string; answers?: Answers; step?: number; revision?: number; baseVersion?: number; mode?: "EDIT" | "RESTART"; dirty?: boolean; pending?: { body: ProfileInput; key: string } } | null = null;
    if (!useServer) try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch { /* Ignore malformed local cache. */ }
    // An explicit restart only resumes another restart. A previous edit must not
    // silently replace the blank form the student asked for.
    if (cached && (cached.questionnaireVersion !== questions.questionnaireVersion || !cached.answers || !Number.isInteger(cached.revision) || !Number.isInteger(cached.baseVersion) || !["EDIT", "RESTART"].includes(cached.mode || ""))) cached = null;
    if (props.blank && cached?.mode !== "RESTART") cached = null;
    adopt(server, !useServer && !!props.blank && !cached);
    if (cached?.questionnaireVersion === questions.questionnaireVersion && cached.answers && Number.isInteger(cached.revision) && Number.isInteger(cached.baseVersion) && (cached.mode === "EDIT" || cached.mode === "RESTART")) {
      if (cached.dirty || cached.pending || props.blank) {
        answers.value = clone(cached.answers); revision.value = cached.revision!; baseVersion.value = cached.baseVersion!;
        mode.value = cached.mode; step.value = Math.max(0, Math.min(questions.pages.length - 1, cached.step || 0));
        dirty.value = !!cached.dirty; pending.value = cached.pending || null;
        conflict.value = !pending.value && (server.draftRevision !== revision.value || (server.profile?.profileVersion || 0) !== baseVersion.value);
        saved.value = dirty.value || pending.value ? "本机未同步的填写已恢复" : "已恢复这次从空白开始的填写";
      } else if (props.blank && cached.mode !== "RESTART") adopt(server, true);
    } else if (!useServer && !props.blank && !server.profile && !server.draft && !cached) {
      // The previous pilot stored unfinished answers only in this browser tab.
      // Import those answers as a draft, without manufacturing a submitted profile.
      try {
        const legacy = JSON.parse(sessionStorage.getItem(legacyKey) || "null");
        if (legacy?.answers && typeof legacy.answers === "object" && !Array.isArray(legacy.answers)) {
          const keys = new Set(questions.pages.flatMap(item => item.fields.map(field => field.key)));
          answers.value = Object.fromEntries(Object.entries(legacy.answers).filter(([key]) => keys.has(key))) as Answers;
          step.value = Number.isInteger(legacy.step) ? Math.max(0, Math.min(questions.pages.length - 1, legacy.step)) : 0;
          dirty.value = true; saved.value = "之前尚未提交的填写已恢复，保存后会成为账户草稿";
        }
      } catch { /* Ignore malformed legacy cache; never touch the submitted profile. */ }
    }
    if (conflict.value) error.value = "另一页面保存了更新版本。你的本机填写仍在，系统没有自动覆盖任何一方。";
    cache();
  } catch (cause) { if (issued === generation) error.value = errorText(cause); }
  finally { if (issued === generation) loading.value = false; }
}
function change(key: string, value: AnswerValue | undefined) {
  if (disabled.value) return;
  const next = { ...answers.value }; if (value === undefined) delete next[key]; else next[key] = value;
  answers.value = next; dirty.value = true; error.value = ""; cache(); scheduleSave();
}
function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (navigator.onLine && !conflict.value && !pending.value) void flush().catch(() => {}); }, 700);
}
async function flush() {
  clearTimeout(timer);
  if (queue) { await queue; if (!dirty.value) return; }
  if (!dirty.value || conflict.value || pending.value || !definition.value) return;
  const issued = generation;
  const current = (async () => {
    saving.value = true;
    try {
      while (dirty.value && !conflict.value && !pending.value) {
        const body = input(), before = JSON.stringify({ answers: body.answers, step: body.lastStepKey });
        const result = await request<ProfileState>("/api/app/v1/profile/draft", { method: "PUT", body });
        if (issued !== generation) return;
        revision.value = result.draftRevision;
        state.value = result;
        dirty.value = before !== JSON.stringify({ answers: answers.value, step: page.value?.stepKey || "step-1" });
        saved.value = `草稿已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
        error.value = ""; cache();
        try { sessionStorage.removeItem(legacyKey); } catch { /* The server draft is now authoritative. */ }
      }
    } catch (cause) {
      if (issued === generation) { error.value = errorText(cause); conflict.value = cause instanceof ApiError && ["PROFILE_DRAFT_CONFLICT", "PROFILE_VERSION_CONFLICT"].includes(cause.code); cache(); }
      throw cause;
    } finally { if (issued === generation) saving.value = false; }
  })();
  queue = current;
  try { await current; } finally { if (queue === current) queue = null; }
}
async function focusProblem() {
  await nextTick();
  const field = root.value?.querySelector<HTMLElement>(".field-error")?.closest<HTMLElement>(".profile-question");
  const target = field || root.value?.querySelector<HTMLElement>(".error-notice") || heading.value;
  target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  (field?.querySelector<HTMLElement>("input,select,textarea,button") || target)?.focus({ preventScroll: true });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) target?.animate([{ outline: "3px solid #4b50ff" }, { outline: "3px solid transparent" }], { duration: 1200 });
}
async function next(direction = 1) {
  if (disabled.value) return;
  showErrors.value = true;
  if (direction > 0 && page.value?.fields.some(field => partialProblem(field, answers.value[field.key]))) { await focusProblem(); return; }
  if (direction > 0 && step.value === definition.value!.pages.length - 1) { await submit(false); return; }
  step.value = Math.max(0, Math.min(definition.value!.pages.length - 1, step.value + direction));
  showErrors.value = false; dirty.value = true; cache(); scheduleSave(); await nextTick(); heading.value?.focus();
}
async function submit(skip: boolean) {
  if (busy.value || conflict.value || !definition.value) return;
  const issued = generation; busy.value = true; error.value = ""; clearTimeout(timer);
  try {
    if (!pending.value) {
      const invalid = definition.value.pages.findIndex(item => item.fields.some(field => partialProblem(field, answers.value[field.key])));
      if (invalid >= 0) { step.value = invalid; showErrors.value = true; await focusProblem(); return; }
      if (skip) { answers.value = skipUnanswered(definition.value, answers.value); dirty.value = true; cache(); }
      await flush();
      if (conflict.value || issued !== generation) return;
      pending.value = { body: input(), key: crypto.randomUUID() }; cache();
    }
    await request<ProfileSubmission>("/api/app/v1/profile/submit", { method: "POST", body: pending.value.body, key: pending.value.key });
    if (issued !== generation) return;
    pending.value = null; dirty.value = false; leaving = true;
    try { sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(legacyKey); } catch { /* Already saved on server. */ }
    cacheKey = ""; emit("done");
  } catch (cause) {
    if (issued === generation) {
      if (cause instanceof ApiError && cause.status > 0 && cause.status < 500 && cause.code !== "REQUEST_IN_PROGRESS") pending.value = null;
      conflict.value = cause instanceof ApiError && ["PROFILE_DRAFT_CONFLICT", "PROFILE_VERSION_CONFLICT"].includes(cause.code);
      error.value = errorText(cause); cache(); await focusProblem();
    }
  } finally { if (issued === generation) busy.value = false; }
}
async function later() {
  if (disabled.value) return;
  busy.value = true;
  try { await flush(); if (conflict.value) return; leaving = true; emit("cancel"); }
  catch { await focusProblem(); } finally { busy.value = false; }
}
async function cancel() {
  if (disabled.value || !window.confirm("取消这次修改并丢弃未提交草稿？当前正式资料和历史体验不会改变。")) return;
  busy.value = true; clearTimeout(timer);
  try {
    if (queue) await queue;
    const server = await request<ProfileState>("/api/app/v1/profile/draft/discard", { method: "POST", body: { expectedRevision: revision.value } });
    adopt(server); dirty.value = false; leaving = true;
    try { sessionStorage.removeItem(cacheKey); sessionStorage.removeItem(legacyKey); } catch { /* Server discard succeeded. */ }
    cacheKey = ""; emit("cancel");
  } catch (cause) { error.value = errorText(cause); conflict.value = cause instanceof ApiError && ["PROFILE_DRAFT_CONFLICT", "PROFILE_VERSION_CONFLICT"].includes(cause.code); await focusProblem(); }
  finally { busy.value = false; }
}
async function useServer() {
  if (!window.confirm("放弃本机未同步的填写，读取服务器上的最新草稿和资料？")) return;
  clearTimeout(timer); await load(true);
}
function connectivity() { offline.value = !navigator.onLine; if (navigator.onLine && dirty.value && !conflict.value && !pending.value) void flush().catch(() => {}); }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || pending.value) { event.preventDefault(); event.returnValue = ""; } }
watch(step, cache);
onMounted(() => { window.addEventListener("online", connectivity); window.addEventListener("offline", connectivity); window.addEventListener("beforeunload", beforeUnload); void load(); });
onBeforeUnmount(() => { generation++; clearTimeout(timer); unsubscribe(); window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); window.removeEventListener("beforeunload", beforeUnload); });
onBeforeRouteLeave(() => { if (!leaving && (dirty.value || pending.value) && !window.confirm("还有未同步或待确认的填写。本机草稿会保留，仍要离开吗？")) return false; });
</script>
<template>
  <section ref="root" class="background-editor">
    <p v-if="loading" role="status">正在恢复资料与填写进度…</p>
    <template v-else-if="page && state">
      <div class="editor-context"><p>每一题都可以跳过。自评只记录你的描述，不会被换算成能力评分。</p><p v-if="state.profile">当前正式资料为第 {{ state.profile.profileVersion }} 版；只有点击“保存资料”后才会形成新版本，已有任务和报告不变。</p><p v-if="mode === 'RESTART'">你正在从空白重新填写，旧版资料仍完整保留。</p></div>
      <div class="editor-status"><span>背景资料 · {{ step + 1 }} / {{ definition!.pages.length }}</span><span>可跳过</span></div>
      <h2 ref="heading" tabindex="-1">{{ page.title }}</h2><p class="question-why">{{ page.why }}</p>
      <div v-if="offline" class="notice" role="status">当前离线，未同步内容保留在本标签页。联网后再保存或提交。</div>
      <div v-if="error" class="error-notice" role="alert" tabindex="-1">{{ error }}</div>
      <div v-if="conflict" class="conflict-actions"><p>请先保留需要的本机内容，再读取新版本。不会自动覆盖另一页面。</p><details><summary>查看并复制本机填写</summary><pre>{{ JSON.stringify(answers, null, 2) }}</pre></details><button class="quiet-button" @click="useServer">放弃本机未同步更改，加载服务器版本</button></div>
      <div v-if="pending" class="notice"><p>上次提交的结果还未确认。请重试同一次提交，不会重复创建资料版本。</p><button class="quiet-button" :disabled="busy || offline" @click="submit(false)">确认上次提交结果</button></div>
      <form @submit.prevent="next(1)">
        <fieldset :disabled="disabled" class="question-body">
          <div v-for="field in page.fields" :key="field.key" class="profile-question">
            <p v-if="page.fields.length > 1" class="field-label">{{ profileLabels[field.key] || field.key }}</p>
            <QuestionField :field="field" :model-value="answers[field.key]" :error="showErrors ? partialProblem(field, answers[field.key]) : ''" @update:model-value="change(field.key, $event)" />
            <div class="question-skip"><span v-if="answers[field.key] === null">已主动跳过</span><button v-if="answers[field.key] !== null" type="button" class="text-link" @click="change(field.key, null)">跳过这题</button><button v-else type="button" class="text-link" @click="change(field.key, undefined)">重新回答这题</button></div>
          </div>
        </fieldset>
        <div class="intake-controls"><button v-if="step > 0" type="button" class="quiet-button" :disabled="disabled" @click="next(-1)">上一步</button><button type="submit" class="primary-button" :disabled="disabled || offline"><span>{{ busy ? '正在保存…' : step === definition!.pages.length - 1 ? '保存资料' : '保存并继续' }}</span><span class="action-arrow"><ArrowIcon /></span></button></div>
        <p class="save-state" aria-live="polite">{{ saving ? '正在保存草稿…' : dirty ? '本机草稿尚未同步' : saved || '正式资料尚未改变' }}</p>
        <div class="editor-secondary"><button type="button" class="text-link" :disabled="disabled || offline" @click="submit(true)">暂不填写，先去探索</button><button type="button" class="text-link" :disabled="disabled || offline" @click="later">保存草稿，稍后继续</button><button type="button" class="text-link" :disabled="disabled" @click="cancel">取消修改</button><button v-if="dirty && error && !conflict && !pending" type="button" class="text-link" :disabled="busy || offline" @click="flush().catch(() => {})">重试保存</button></div>
      </form>
    </template>
    <div v-else class="error-notice" role="alert">{{ error || '暂时无法读取问卷。' }} <button class="text-link" @click="load()">重试</button></div>
  </section>
</template>
<style scoped>
button.text-link{appearance:none;border:0;border-bottom:1px solid currentColor;background:transparent;padding:0 0 3px;text-align:left}button.text-link:disabled{cursor:default}
.background-editor{max-width:760px}.editor-context{padding:16px 0;margin-bottom:28px;border-bottom:1px solid var(--line);color:var(--muted);font-size:14px;line-height:1.8}.editor-context p{margin:6px 0}.editor-status{display:flex;justify-content:space-between;color:var(--muted);font-size:13px}.background-editor h2{font-size:30px;margin:20px 0 14px}.question-body{border:0;padding:0;margin:0;min-width:0}.profile-question{margin-bottom:28px}.question-skip{display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-top:12px;font-size:14px}.question-skip span{color:var(--muted)}.editor-secondary{display:flex;gap:20px 26px;flex-wrap:wrap;padding-top:24px;margin-top:22px;border-top:1px solid var(--line);font-size:14px}.conflict-actions{margin:20px 0}.conflict-actions pre{max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.conflict-actions button{margin-top:16px}.error-notice:focus{outline:2px solid var(--blue)}@media(max-width:600px){.background-editor h2{font-size:25px}.intake-controls{flex-wrap:wrap}.primary-button{width:100%}.editor-secondary{flex-direction:column;align-items:flex-start}}
</style>
