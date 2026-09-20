<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { api, errorText } from "../lib/api";
import { useAuth } from "../stores/auth";
import type { Consent } from "../types";
const auth = useAuth(),
  consents = ref<Consent[]>([]),
  error = ref(""),
  busy = ref(false),
  done = ref(false);
const latest = computed(() =>
  consents.value.filter((value) => value.documentType === "RESEARCH").at(-1),
);
async function load() {
  try {
    await auth.refresh();
    consents.value = await api<Consent[]>("/api/app/v1/consents");
  } catch (cause) {
    error.value = errorText(cause);
  }
}
async function withdraw() {
  busy.value = true;
  error.value = "";
  try {
    await api("/api/app/v1/consents/research/withdraw", {
      method: "POST",
      body: {},
    });
    await load();
    done.value = true;
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <main class="content-page">
    <RouterLink to="/app" class="page-back">← 返回个人主页</RouterLink>
    <h1 class="serif">账户与数据</h1>
    <h2>账户安全</h2>
    <p>{{ auth.me?.email }}</p>
    <p>
      如需更换密码，可通过验证邮箱使用密码重置入口。重置成功后所有设备会退出。
    </p>
    <RouterLink to="/forgot-password" class="text-link"
      >发送密码重置邮件</RouterLink
    >
    <h2>可选产品研究授权</h2>
    <p>研究授权独立于核心服务；拒绝或撤回都不影响保存建议与选择。</p>
    <p v-if="latest">
      当前状态：{{
        latest.decision === "ACCEPTED" ? "已同意" : "未授权 / 已撤回"
      }}（{{ latest.documentVersion }}）
    </p>
    <button
      v-if="latest?.decision === 'ACCEPTED'"
      class="quiet-button"
      :disabled="busy"
      @click="withdraw"
    >
      撤回研究授权
    </button>
    <p v-if="done" class="success-notice" role="status">
      研究授权已撤回，不影响核心服务。
    </p>
    <p v-if="error" class="error-notice" role="alert">{{ error }}</p>
    <h2>数据范围与当前边界</h2>
    <p>
      当前可用功能为信息收集、首次推荐和账户恢复。个人数据导出、邮箱变更与账户删除操作将在隐私功能阶段提供；当前页面不会伪造这些操作已完成。
    </p>
    <RouterLink to="/privacy" class="text-link">查看完整隐私说明</RouterLink>
  </main>
</template>
