<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, errorText } from '../lib/api';
import { takeMailToken } from '../lib/mail-token';
import { identityRequest, useAuth } from '../stores/auth';
const auth = useAuth(), router = useRouter(), error = ref(''), busy = ref(true), noSession = ref(false);
const ticket = identityRequest();
let token = takeMailToken();
onMounted(async () => {
  try {
    if (!token) { error.value = '确认链接无效或已使用，请在账户设置中重新申请。'; return; }
    await auth.refresh(true); ticket.assertCurrent();
    if (!auth.me) { noSession.value = true; return; }
    await api('/api/app/v1/me/email/confirm', { method: 'POST', body: { token }, signal: ticket.signal });
    ticket.assertCurrent(); auth.clear(); await router.replace('/login?notice=email-changed');
  } catch (cause) { if (ticket.current()) error.value = errorText(cause); }
  finally { token = ''; busy.value = false; ticket.finish(); }
});
onBeforeUnmount(() => { token = ''; ticket.finish(); });
</script>
<template><main class="content-page privacy-receipt"><p class="eyebrow">ACCOUNT SECURITY</p><h1 class="serif">确认新邮箱</h1><p v-if="busy" role="status">正在安全确认…</p><template v-else-if="noSession"><p>请先登录原账户，再重新打开邮件中的确认链接。出于安全考虑，本页面不会保存或转发邮件令牌。</p><RouterLink to="/login" class="primary-button">先登录</RouterLink></template><p v-else-if="error" class="error-notice" role="alert">{{ error }}</p><RouterLink to="/app/settings" class="text-link">返回账户设置</RouterLink></main></template>
