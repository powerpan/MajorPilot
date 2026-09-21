<script setup lang="ts">
import { onBeforeUnmount, ref, watch, nextTick } from "vue";
const props = defineProps<{ open: boolean; title: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let previous: HTMLElement | null = null;
watch(() => props.open, async open => {
  await nextTick();
  if (open) { previous = document.activeElement as HTMLElement; dialog.value?.showModal(); }
  else if (dialog.value?.open) { dialog.value.close(); previous?.focus(); }
}, { immediate: true });
function close(event?: Event) { if (props.busy) { event?.preventDefault(); return; } emit("close"); }
onBeforeUnmount(() => dialog.value?.close());
</script>
<template>
  <dialog ref="dialog" class="privacy-dialog" aria-labelledby="privacy-dialog-title" @cancel="close">
    <div class="privacy-dialog-heading"><h2 id="privacy-dialog-title" class="serif">{{ title }}</h2>
      <button type="button" class="quiet-button" :disabled="busy" @click="close">关闭</button></div>
    <slot />
  </dialog>
</template>
