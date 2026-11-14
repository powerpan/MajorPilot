<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useIntake } from "../stores/intake";
import { errorText } from "../lib/api";
import { observeRecommendation } from "../lib/events";
import RecommendationDetails from "../components/RecommendationDetails.vue";
import ActionLink from "../components/ActionLink.vue";
const store = useIntake(),
  loading = ref(true),
  error = ref("");
let dispose: undefined | (() => void);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    await store.loadRecommendation();
    if (store.recommendation)
      dispose = observeRecommendation(
        store.recommendation.recommendationId,
        "public",
      );
  } catch (cause) {
    error.value = errorText(cause);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => dispose?.());
</script>
<template>
  <main class="recommendation-page">
    <div v-if="loading" class="loading-state" role="status">
      正在读取你的初始建议…
    </div>
    <div v-else-if="error" class="content-page">
      <h1 class="serif">继续你的探索</h1>
      <p class="error-notice" role="alert">{{ error }}</p>
      <div class="button-row">
        <button class="quiet-button" @click="load">重试</button
        ><RouterLink to="/intake/1" class="text-link">返回填写</RouterLink
        ><RouterLink to="/login" class="text-link"
          >资料已认领？登录继续</RouterLink
        >
      </div>
    </div>
    <template v-else-if="store.recommendation"
      ><RecommendationDetails :value="store.recommendation" editorial>
        <template #action
          ><div class="recommendation-action">
            <ActionLink to="/register">注册并保存建议</ActionLink>
            <p>当前可保存建议；专业任务即将开放。</p>
          </div></template
        >
      </RecommendationDetails></template
    >
    <section v-else class="content-page"><h1 class="serif">先保留你的起点。</h1><p>资料已保存，目前的信息不足以生成个性化推荐。注册并验证邮箱后，你仍可以自主选择已开放的专业。</p><div class="button-row"><ActionLink to="/register">注册并保存资料</ActionLink><RouterLink to="/intake/1" class="text-link">返回补充背景</RouterLink></div></section>
  </main>
</template>
