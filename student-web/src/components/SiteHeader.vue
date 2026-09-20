<script setup lang="ts">
import { useAuth } from "../stores/auth";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
const auth = useAuth();
const route = useRoute();
const mobileNavigation = ref<HTMLDetailsElement | null>(null);
watch(
  () => route.fullPath,
  () => {
    if (mobileNavigation.value) mobileNavigation.value.open = false;
  },
);
const isIntake = computed(() => route.path.startsWith("/intake/"));
const isRecommendation = computed(() => route.path === "/recommendation");
const step = computed(() =>
  Math.min(12, Math.max(1, Number(route.params.step) || 1)),
);
</script>
<template>
  <header class="site-header">
    <RouterLink to="/" class="brand" aria-label="MajorPilot 首页"
      ><svg viewBox="0 0 44 40" aria-hidden="true">
        <path d="M3 28 31 5 23 25Z" fill="#304FFE" />
        <path d="m33 5 10 35-18-12Z" fill="#F45B35" /></svg
      ><span>MajorPilot</span></RouterLink
    >
    <div v-if="isIntake" class="header-progress" aria-label="填写进度">
      <div
        role="progressbar"
        aria-label="填写进度"
        :aria-valuenow="step"
        :aria-valuemin="1"
        :aria-valuemax="12"
      >
        <span :style="{ width: `${(step / 12) * 100}%` }" />
      </div>
      <span>{{ step }} / 12</span>
    </div>
    <nav v-else-if="!isRecommendation" aria-label="主导航">
      <RouterLink to="/how-it-works">如何体验</RouterLink
      ><RouterLink to="/majors">探索专业</RouterLink>
    </nav>
    <details
      v-if="!isIntake && !isRecommendation"
      ref="mobileNavigation"
      class="mobile-navigation"
    >
      <summary aria-label="打开导航">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 6h18M3 12h18M3 18h18"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </summary>
      <nav aria-label="手机导航">
        <RouterLink to="/how-it-works">如何体验</RouterLink
        ><RouterLink to="/majors">探索专业</RouterLink>
      </nav>
    </details>
    <RouterLink v-if="isIntake" class="account-link" to="/"
      >返回首页</RouterLink
    >
    <RouterLink v-else-if="isRecommendation" class="account-link" to="/intake/1"
      >修改我的回答</RouterLink
    >
    <RouterLink v-else class="account-link" :to="auth.me ? '/app' : '/login'">{{
      auth.me ? "个人主页" : "登录"
    }}</RouterLink>
  </header>
</template>
