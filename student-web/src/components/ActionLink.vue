<script setup lang="ts">
import ArrowIcon from "./ArrowIcon.vue";
defineProps<{ to: string; small?: boolean }>();
</script>
<template>
  <RouterLink :to="to" class="action-link" :class="{ 'action-small': small }"
    ><span><slot /></span><span class="action-arrow"><ArrowIcon /></span
  ></RouterLink>
</template>
