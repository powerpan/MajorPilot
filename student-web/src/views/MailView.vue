<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError, errorText } from "../lib/api";
import { takeMailToken } from "../lib/mail-token";
import { useAuth } from "../stores/auth";
const route = useRoute(),
  auth = useAuth(),
  reset = computed(() => route.path === "/reset-password");
const deliveryNeedsRetry = history.state?.delivery === "RETRY_REQUIRED";
let token = takeMailToken();
const busy = ref(false),
  error = ref(""),
  done = ref(false),
  email = ref(""),
  password = ref(""),
  confirm = ref(""),
  notice = ref("");
async function verify() {
  if (!token) return;
  busy.value = true;
  try {
    await api("/api/public/v1/auth/verify-email", {
      method: "POST",
      body: { token },
    });
    done.value = true;
    token = null;
  } catch (cause) {
    error.value = errorText(cause);
    token = null;
  } finally {
    busy.value = false;
  }
}
async function submitReset() {
  error.value = "";
  if ([...password.value].length < 15 || [...password.value].length > 128) {
    error.value = "新密码需要15–128个字符。";
    return;
  }
  if (password.value !== confirm.value) {
    error.value = "两次输入的密码不一致。";
    return;
  }
  busy.value = true;
  try {
    await api("/api/public/v1/auth/password/reset", {
      method: "POST",
      body: { token, newPassword: password.value },
    });
    token = null;
    password.value = "";
    confirm.value = "";
    done.value = true;
    auth.clear();
  } catch (cause) {
    error.value = errorText(cause);
    if (cause instanceof ApiError && cause.code === "EMAIL_TOKEN_INVALID") {
      token = null;
      password.value = "";
      confirm.value = "";
    }
  } finally {
    busy.value = false;
  }
}
async function resend() {
  error.value = "";
  busy.value = true;
  try {
    await api(
      `/api/public/v1/auth/${reset.value ? "password/forgot" : "verify-email/resend"}`,
      { method: "POST", body: { email: email.value } },
    );
    notice.value =
      "如果该邮箱符合条件，邮件将发送到收件箱。请同时检查垃圾邮件。";
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  if (!reset.value && token) void verify();
});
onBeforeUnmount(() => {
  token = null;
  password.value = "";
  confirm.value = "";
});
</script>
<template>
  <main class="mail-page content-page">
    <p class="page-back"><RouterLink to="/login">← 返回登录</RouterLink></p>
    <h1 class="serif">
      {{ reset ? "重新设置密码。" : "让探索有一个可靠的归处。" }}
    </h1>
    <div v-if="busy" class="notice" role="status">正在处理，请稍候…</div>
    <p v-if="!done && !reset && deliveryNeedsRetry && !token" class="notice">
      账户和资料已保存，但验证邮件暂未发出。请使用下方入口重发邮件。
    </p>
    <template v-if="done"
      ><h2>{{ reset ? "密码已更新" : "邮箱已验证" }}</h2>
      <p>
        {{
          reset
            ? "所有旧会话已退出，请使用新密码登录。"
            : "你的问卷和初始建议已经保存。验证不会自动登录，请继续登录账户。"
        }}
      </p>
      <RouterLink to="/login" class="primary-button"
        >前往登录 →</RouterLink
      ></template
    ><template v-else
      ><p v-if="!reset">
        {{
          token
            ? "正在确认邮箱…"
            : "资料已保存。请打开邮箱中的验证链接；中断验证不会丢失问卷。"
        }}
      </p>
      <p v-if="error" class="error-notice" role="alert">{{ error }}</p>
      <form
        v-if="reset && token"
        class="mail-form"
        @submit.prevent="submitReset"
      >
        <label for="new-password">新密码</label
        ><input
          id="new-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          maxlength="256"
        />
        <p class="field-help">15–128个字符，不要求混合字符类型。</p>
        <label for="new-password-confirm">确认新密码</label
        ><input
          id="new-password-confirm"
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          maxlength="256"
        /><button class="primary-button" :disabled="busy" type="submit">
          更新密码
        </button>
      </form>
      <template v-else
        ><p v-if="reset">没有可用的重置链接。你可以重新申请邮件。</p>
        <p v-if="notice" class="success-notice" role="status">{{ notice }}</p>
        <form class="mail-form" @submit.prevent="resend">
          <label for="resend-email">注册邮箱</label
          ><input
            id="resend-email"
            v-model.trim="email"
            type="email"
            autocomplete="email"
            required
          /><button class="quiet-button" :disabled="busy" type="submit">
            {{ reset ? "重新发送重置邮件" : "重新发送验证邮件" }}
          </button>
        </form></template
      ></template
    >
    <p class="small muted">
      邮件链接只使用一次。此页不会加载第三方资源，也不会将邮件令牌存入浏览器持久化存储。
    </p>
  </main>
</template>
