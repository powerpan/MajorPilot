<script setup lang="ts">
// Keep saved/bookmarked old URLs useful, but never create another engineering preview.
import { onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, errorText } from "../lib/api";
import { identityRequest, onIdentityChange } from "../stores/auth";
import { majors } from "../data/majors";
import type { PreviewTask, Run } from "../types/workspace";
const route = useRoute(), router = useRouter(), error = ref("");
let epoch = 0;
const unsubscribe = onIdentityChange(() => { epoch++; error.value = ""; });
async function request<T>(path: string) {
  const ticket = identityRequest();
  try {
    const value = await api<T>(path, { signal: ticket.signal });
    ticket.assertCurrent();
    return value;
  } finally { ticket.finish(); }
}
async function openExperience() {
  const issued = ++epoch;
  error.value = "";
  const taskId = typeof route.params.taskVersionId === "string" ? route.params.taskVersionId : "";
  if (!taskId) { await router.replace("/app"); return; }
  try {
    const runs = await request<Run[]>("/api/app/v1/experience-runs");
    let code = [...runs].reverse().find((run) => run.taskVersionId === taskId)?.majorCode;
    if (!code) {
      // Read-only compatibility with an old bookmarked task, including a disabled preview catalog.
      const tasks = await request<PreviewTask[]>("/api/app/v1/review-preview-tasks").catch(() => []);
      code = tasks.find((task) => task.taskVersionId === taskId)?.majorCode;
    }
    if (issued === epoch) await router.replace(majors.some((major) => major.code === code) ? `/app/experiences/${code}` : "/app");
  } catch (cause) { if (issued === epoch) error.value = errorText(cause); }
}
watch(() => route.fullPath, openExperience, { immediate: true });
onBeforeUnmount(() => { epoch++; unsubscribe(); });
</script>
<template>
  <main class="content-page">
    <p v-if="!error" role="status">正在打开专业体验与已保存进度…</p>
    <div v-else class="error-notice" role="alert">{{ error }}<button class="plain-button text-link" @click="openExperience">重试</button></div>
    <RouterLink to="/app" class="text-link">返回个人主页</RouterLink>
  </main>
</template>
