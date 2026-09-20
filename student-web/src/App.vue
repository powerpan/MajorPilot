<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "./stores/auth";
import SiteHeader from "./components/SiteHeader.vue";
import SiteFooter from "./components/SiteFooter.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuth();
const p0 = computed(() => route.path === "/p0");
const identityTransition = ref(false);
let identityNavigation = 0;
function identityCleared(event: Event) {
  const detail = (event as CustomEvent<{ remote?: boolean }>).detail;
  if (
    !detail?.remote ||
    !(
      route.meta.private ||
      /^\/(intake(?:\/|$)|recommendation$|register$)/.test(route.path)
    )
  )
    return;
  // Unmount private/local-draft views before navigating: their component-local
  // responses must not stay visible after another tab changes the identity.
  const generation = ++identityNavigation;
  identityTransition.value = true;
  void router.replace("/login").finally(() => {
    if (generation === identityNavigation) identityTransition.value = false;
  });
}
onMounted(() => {
  window.addEventListener("mp:identity-cleared", identityCleared);
  if (!p0.value)
    void auth.refresh().catch(() => {
      /* Public copy stays readable during an API outage. */
    });
});
onBeforeUnmount(() =>
  window.removeEventListener("mp:identity-cleared", identityCleared),
);
</script>
<template>
  <RouterView v-if="p0" /><template v-else
    ><a class="skip-link" href="#main-content">跳到主要内容</a><SiteHeader v-if="!route.meta.workspace" />
    <div id="main-content" tabindex="-1">
      <p v-if="identityTransition" class="loading-state" role="status">
        会话已在其他页面更新，正在清理当前页面…
      </p>
      <RouterView v-else />
    </div>
    <SiteFooter v-if="!route.meta.workspace"
  /></template>
</template>
