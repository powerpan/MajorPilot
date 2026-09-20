<script setup lang="ts">
import { useRoute } from "vue-router";
const route = useRoute();
</script>
<template>
  <footer v-if="route.path.startsWith('/intake/')" class="intake-footer">
    你可以跨专业探索，这里没有标准答案。
  </footer>
  <footer v-else class="site-footer">
    <RouterLink to="/" class="footer-brand">MajorPilot</RouterLink>
    <div>
      <RouterLink to="/privacy">隐私政策</RouterLink
      ><span aria-hidden="true">|</span
      ><RouterLink to="/terms">使用条款</RouterLink>
    </div>
  </footer>
</template>
