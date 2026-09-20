<script setup lang="ts">
import { ref } from "vue";
import type { Hint } from "../../types/workspace";
defineProps<{
  hints: Hint[];
  busy?: boolean;
  disabled?: boolean;
  boundary?: string;
}>();
const emit = defineEmits<{ request: [level: number] }>();
const titles = ["概念方向", "操作思路", "一个具体线索"];
const confirmation = ref<HTMLDialogElement | null>(null),
  level = ref(1);
function request(next: number) {
  level.value = next;
  if (next === 1) emit("request", next);
  else confirmation.value?.showModal();
}
function confirm() {
  confirmation.value?.close();
  emit("request", level.value);
}
</script>
<template>
  <div class="workspace-hints">
    <h2>需要一点提示？</h2>
    <p>先自己尝试。你可以按需逐层查看提示。</p>
    <div class="hint-levels">
      <div v-for="(title, index) in titles" :key="title" class="hint-level">
        <div>
          <span class="serif">0{{ index + 1 }}</span
          ><strong>{{ title }}</strong
          ><span aria-hidden="true">⌄</span>
        </div>
        <template v-if="hints.find((value) => value.hintLevel === index + 1)"
          ><p>
            {{
              hints.find((value) => value.hintLevel === index + 1)?.response
                ?.hintText || "提示正在准备，请稍后重试。"
            }}
          </p>
          <small
            >{{
              hints.find((value) => value.hintLevel === index + 1)?.status ===
              "STATIC_FALLBACK"
                ? "静态备用提示"
                : "任务提示"
            }}
            · 不扣分</small
          ></template
        >
      </div>
    </div>
    <button
      class="workspace-outline"
      :disabled="busy || disabled || hints.length >= 3"
      @click="request(Math.min(3, hints.length + 1))"
    >
      {{
        busy
          ? "正在读取提示…"
          : hints.length >= 3
            ? "已查看全部提示"
            : `查看${["一", "二", "三"][hints.length]}级提示`
      }}
    </button>
    <p v-if="hints.length" class="hint-boundary">
      提示帮助你理解方向，核心判断仍由你完成。
    </p>
    <small class="workspace-demo-note">{{
      boundary || "演示不生成专业报告"
    }}</small>
    <dialog
      ref="confirmation"
      class="workspace-dialog"
      aria-labelledby="hint-confirm-title"
    >
      <h2 id="hint-confirm-title">
        查看{{ level === 2 ? "二" : "三" }}级提示？
      </h2>
      <p>提示会更具体，但仍需要你完成自己的操作与判断。查看提示不会扣分。</p>
      <div class="button-row">
        <button class="quiet-button" @click="confirmation?.close()">
          先自己尝试</button
        ><button class="workspace-outline" @click="confirm">确认查看</button>
      </div>
    </dialog>
  </div>
</template>
