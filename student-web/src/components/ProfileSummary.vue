<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, errorText } from "../lib/api";
import { fetchProfile, answerText, profileField, type ProfileView } from "../lib/profile";
import { identityRequest, onIdentityChange } from "../stores/auth";
import type { Questionnaire } from "../types";
const profile = ref<ProfileView | null>(null), definition = ref<Questionnaire | null>(null);
const loading = ref(true), error = ref("");
const unsubscribe = onIdentityChange(() => { profile.value = null; definition.value = null; error.value = ""; });
async function load() {
  const ticket = identityRequest(); loading.value = true; error.value = "";
  try {
    const [state, questions] = await Promise.all([fetchProfile(ticket.signal), api<Questionnaire>("/api/public/v1/questionnaires/current", { signal: ticket.signal })]);
    ticket.assertCurrent(); profile.value = state.profile; definition.value = questions;
  } catch (cause) { if (ticket.current()) error.value = errorText(cause); }
  finally { if (ticket.current()) loading.value = false; ticket.finish(); }
}
onMounted(load);
onBeforeUnmount(unsubscribe);
</script>
<template>
  <section class="profile-summary" aria-labelledby="profile-summary-title">
    <div class="summary-heading"><div><p class="eyebrow">YOUR STARTING POINT</p><h2 id="profile-summary-title" class="serif">我的资料</h2></div><span v-if="!loading && !error" class="profile-completeness">{{ profile?.complete ? '资料已填写完整' : profile ? '资料待补充' : '尚未填写资料' }}</span></div>
    <p v-if="loading" role="status">正在读取已提交的资料…</p>
    <p v-else-if="error" class="error-notice" role="alert">{{ error }} <button class="text-link" @click="load">重试</button></p>
    <dl v-else class="summary-facts">
      <div v-for="[key, label] in [['applicationStage', '申请阶段'], ['currentField', '学习或工作背景'], ['consideredMajors', '考虑方向']]" :key="key"><dt>{{ label }}</dt><dd>{{ answerText(profileField(definition, key!), profile?.answers[key!]) }}</dd></div>
    </dl>
    <div class="summary-links"><RouterLink to="/app/profile" class="text-link">查看完整资料</RouterLink><RouterLink to="/app/profile/edit" class="text-link">修改资料</RouterLink></div>
  </section>
</template>
<style scoped>
button.text-link{appearance:none;border:0;border-bottom:1px solid currentColor;background:transparent;padding:0 0 3px;text-align:left}
.profile-summary{margin:0 0 40px;padding:26px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.summary-heading{display:flex;justify-content:space-between;align-items:center;gap:20px}.summary-heading h2{font-size:32px;margin:6px 0 20px}.eyebrow{font-size:11px;letter-spacing:.14em;margin:0}.profile-completeness{font-size:13px;color:var(--muted)}.summary-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin:0 0 20px}.summary-facts dt{font-size:12px;color:var(--muted);margin-bottom:8px}.summary-facts dd{font-size:17px;margin:0;line-height:1.7;overflow-wrap:anywhere}.summary-links{display:flex;flex-wrap:wrap;gap:24px}@media(max-width:600px){.summary-heading{align-items:flex-start}.summary-heading h2{font-size:28px}.summary-facts{grid-template-columns:1fr;gap:16px}.profile-completeness{margin-top:24px;white-space:nowrap}}
</style>
