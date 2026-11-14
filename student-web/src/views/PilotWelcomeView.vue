<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { api, errorText } from "../lib/api";
import { fetchProfile } from "../lib/profile";
import { useAuth, identityRequest, onIdentityChange } from "../stores/auth";
import type { PilotStatus } from "../lib/pilot";
import ArrowIcon from "../components/ArrowIcon.vue";
import BackgroundEditor from "../components/BackgroundEditor.vue";

const auth = useAuth(), router = useRouter();
const status = ref<PilotStatus | null>(null), busy = ref(false), loading = ref(true), error = ref("");
const terms = ref(false), privacy = ref(false), research = ref(false);
const unsubscribe = onIdentityChange(() => { status.value = null; terms.value = false; privacy.value = false; research.value = false; });
onBeforeUnmount(unsubscribe);
async function load() {
  const ticket = identityRequest(); loading.value = true; error.value = "";
  try {
    const loaded = await api<PilotStatus>("/api/app/v1/pilot", { signal: ticket.signal }); ticket.assertCurrent(); status.value = loaded;
    if (loaded.consented) {
      const profile = await fetchProfile(ticket.signal); ticket.assertCurrent();
      if (profile.profile) { await router.replace("/app"); return; }
    }
  } catch (cause) { if (ticket.current()) error.value = errorText(cause); }
  finally { if (ticket.current()) loading.value = false; ticket.finish(); }
}
async function accept() {
  if (busy.value || !terms.value || !privacy.value) return;
  const ticket = identityRequest(); busy.value = true; error.value = "";
  try {
    const result = await api<PilotStatus>("/api/app/v1/pilot/consent", { method: "POST", signal: ticket.signal, body: { consents: [
      { documentType: "TERMS", documentVersion: "pilot-v1", decision: "ACCEPTED" },
      { documentType: "PRIVACY", documentVersion: "pilot-v1", decision: "ACCEPTED" },
      { documentType: "RESEARCH", documentVersion: "pilot-v1", decision: research.value ? "ACCEPTED" : "DECLINED" },
    ] } });
    ticket.assertCurrent(); status.value = result; await auth.refresh(true);
  } catch (cause) { if (ticket.current()) error.value = errorText(cause); }
  finally { if (ticket.current()) busy.value = false; ticket.finish(); }
}
onMounted(load);
</script>
<template>
  <main class="pilot-welcome">
    <RouterLink to="/" class="page-back">← MajorPilot</RouterLink>
    <p class="eyebrow">A SMALL INVITATION, A REAL EXPLORATION</p>
    <h1 class="serif">先说说你的起点。</h1>
    <p class="pilot-lead">这里不是考试。你可以不了解这个专业，也可以在体验中发现自己暂时没弄懂的地方。</p>
    <p v-if="error" class="error-notice" role="alert" tabindex="-1">{{ error }} <button v-if="!status" class="text-link" @click="load">重新读取</button></p>
    <p v-if="loading" role="status">正在读取测试账户…</p>
    <form v-else-if="status && !status.consented" class="pilot-card" @submit.prevent="accept">
      <h2>开始之前，由你决定。</h2>
      <p>这是邀请测试版：每个账户可生成 3 次单专业报告、2 次比较报告。阅读已有报告不占次数。模型请求发出后若失败，这次仍会计入额度；作答会保留。</p>
      <p>确认必要的条款与隐私说明后，背景问题都可以跳过。研究授权始终由你决定。</p>
      <div class="consent-list">
        <label><input v-model="terms" type="checkbox" required /><span>我已阅读并同意<RouterLink to="/terms" target="_blank">使用条款（pilot-v1）</RouterLink>。</span></label>
        <label><input v-model="privacy" type="checkbox" required /><span>我已阅读并同意<RouterLink to="/privacy" target="_blank">隐私说明（pilot-v1）</RouterLink>，了解报告生成需要将本次作答交给 AI 服务处理。</span></label>
        <label><input v-model="research" type="checkbox" /><span>可选：同意将去标识化的体验资料用于产品研究。拒绝不影响体验，之后可以撤回。</span></label>
      </div>
      <button class="primary-button" :disabled="busy"><span>{{ busy ? '正在保存…' : '确认，继续了解我的起点' }}</span><span class="action-arrow"><ArrowIcon /></span></button>
    </form>
    <BackgroundEditor v-else-if="status?.consented" class="pilot-card" @done="router.replace('/app')" @cancel="router.replace('/app')" />
  </main>
</template>
<style scoped>
.pilot-welcome{max-width:860px;margin:0 auto;padding:48px 24px 96px}.eyebrow{margin-top:60px}.pilot-welcome h1{font-size:clamp(40px,7vw,72px);margin:18px 0}.pilot-lead{font-size:20px;line-height:1.8;max-width:650px}.pilot-card{margin-top:40px;padding-top:32px;border-top:1px solid var(--ink,#232629);line-height:1.8}.pilot-card h2{font-size:28px}.pilot-card .consent-list{margin:28px 0}.pilot-card :deep(input[type=checkbox]){flex-shrink:0}
</style>
