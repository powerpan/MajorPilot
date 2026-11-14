<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, errorText } from "../lib/api";
import { fetchProfile, answerText, profileField, profileGroups, profileLabels, type ProfileState } from "../lib/profile";
import { identityRequest, onIdentityChange, useAuth } from "../stores/auth";
import type { Questionnaire } from "../types";
const router = useRouter(), auth = useAuth();
const state = ref<ProfileState | null>(null), definition = ref<Questionnaire | null>(null), loading = ref(true), error = ref("");
const unsubscribe = onIdentityChange(() => { state.value = null; definition.value = null; error.value = ""; });
async function load() {
  const ticket = identityRequest(); loading.value = true; error.value = "";
  try {
    const [profile, questions] = await Promise.all([fetchProfile(ticket.signal), api<Questionnaire>("/api/public/v1/questionnaires/current", { signal: ticket.signal })]);
    ticket.assertCurrent(); state.value = profile; definition.value = questions;
  } catch (cause) { if (ticket.current()) error.value = errorText(cause); }
  finally { if (ticket.current()) loading.value = false; ticket.finish(); }
}
async function restart() {
  if (!window.confirm("从空白问卷重新填写？当前正式资料会保留，直到你主动提交新版；已有未提交草稿将由新的填写替换。")) return;
  try { sessionStorage.removeItem(`mp:profile-editor:${auth.me!.studentId}`); } catch { /* Server version checks still apply. */ }
  await router.push({ path: "/app/profile/edit", query: { mode: "blank" } });
}
function status(key: string) {
  const value = state.value?.profile?.answers[key];
  if (value === null) return "主动跳过";
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "尚未填写";
  return state.value?.profile?.answerStates[key] === "UNSURE" ? "用户选择不确定" : "用户自述";
}
onMounted(load); onBeforeUnmount(unsubscribe);
</script>
<template>
  <main class="content-page profile-page">
    <RouterLink to="/app" class="text-link">← 返回个人主页</RouterLink>
    <header class="profile-header"><p class="eyebrow">YOUR STARTING POINT</p><h1 class="serif">我的资料</h1><p>这里展示你提交的申请背景和个人偏好，不是能力评定或专业适配结论。</p></header>
    <p v-if="loading" role="status">正在读取最新已提交的资料…</p>
    <p v-else-if="error" class="error-notice" role="alert">{{ error }} <button class="text-link" @click="load">重试</button></p>
    <template v-else-if="state">
      <div class="profile-version"><span>{{ state.profile ? `第 ${state.profile.profileVersion} 版 · ${state.profile.complete ? '资料已填写完整' : '资料待补充'}` : '尚未提交背景资料' }}</span><time v-if="state.profile?.submittedAt">{{ new Date(state.profile.submittedAt).toLocaleString('zh-CN') }}</time></div>
      <div class="profile-actions"><RouterLink to="/app/profile/edit" class="quiet-button">修改资料</RouterLink><button class="text-link" @click="restart">从空白重新填写</button></div>
      <aside v-if="state.draft" class="notice"><p>还有一份尚未提交的填写。下方仍显示正式资料，草稿不会改变已有体验与报告。</p><RouterLink to="/app/profile/edit" class="text-link">继续未提交的填写 →</RouterLink></aside>
      <p v-if="!state.profile?.recommendationReady" class="profile-note">用于初始推荐的信息还不足，因此暂不提供个性化推荐。你仍可以在主页自行选择开放的专业。</p>
      <section v-for="group in profileGroups" :key="group.title" class="profile-group"><h2 class="serif">{{ group.title }}</h2><dl><div v-for="key in group.keys" :key="key" class="profile-answer"><dt>{{ profileLabels[key] }}</dt><dd><p>{{ answerText(profileField(definition, key), state.profile?.answers[key]) }}</p><small>{{ status(key) }}</small></dd></div></dl></section>
      <p class="profile-note">提交修改后会保留旧版本。已开始的任务和已有报告继续使用当时的背景版本，不会被追溯改写。</p>
      <RouterLink to="/app/settings" class="text-link">密码、研究授权和账户删除请前往「账户与数据」 →</RouterLink>
    </template>
  </main>
</template>
<style scoped>
button.text-link{appearance:none;border:0;border-bottom:1px solid currentColor;background:transparent;padding:0 0 3px;text-align:left}
.profile-page{max-width:1020px}.profile-header{margin:44px 0 28px}.profile-header h1{font-size:clamp(44px,7vw,72px);margin:16px 0}.profile-header>p:last-child{max-width:680px;line-height:1.8;color:var(--muted)}.profile-version{display:flex;gap:16px;justify-content:space-between;border-top:1px solid var(--line);padding-top:20px;font-size:13px;color:var(--muted)}.profile-actions{display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin:24px 0}.profile-group{border-top:1px solid var(--line);padding:28px 0 12px;margin-top:28px;display:grid;grid-template-columns:200px 1fr;gap:24px}.profile-group h2{font-size:28px;margin:0}.profile-group dl{margin:0}.profile-answer{padding:0 0 20px;margin-bottom:18px;border-bottom:1px solid var(--line)}.profile-answer:last-child{border-bottom:0;margin-bottom:0}.profile-answer dt{font-size:13px;color:var(--muted)}.profile-answer dd{margin:8px 0 0;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}.profile-answer p{margin:0}.profile-answer small{color:var(--muted);font-size:11px}.profile-note{font-size:14px;color:var(--muted);line-height:1.8}.notice{margin:28px 0}@media(max-width:600px){.profile-group{grid-template-columns:1fr;gap:20px}.profile-version{flex-direction:column}.profile-header{margin-top:32px}}
</style>
