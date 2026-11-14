<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import BackgroundEditor from "../components/BackgroundEditor.vue";
const route = useRoute(), router = useRouter();
</script>
<template>
  <main class="content-page profile-edit-page"><RouterLink to="/app/profile" class="text-link">← 查看已提交资料</RouterLink><h1 class="serif">{{ route.query.mode === 'blank' ? '从空白重新填写。' : '补充你的起点。' }}</h1><BackgroundEditor :key="route.fullPath" :blank="route.query.mode === 'blank'" @done="router.replace('/app/profile')" @cancel="router.replace('/app/profile')" /></main>
</template>
<style scoped>.profile-edit-page{max-width:860px}.profile-edit-page h1{font-size:clamp(38px,7vw,64px);margin:44px 0 24px}</style>
