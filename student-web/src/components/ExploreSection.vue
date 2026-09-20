<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { majors, major } from "../data/majors";
import type { MajorCode } from "../types";
import ArrowIcon from "./ArrowIcon.vue";
const props = defineProps<{ initial?: MajorCode }>();
const selected = ref<MajorCode>(props.initial || "AI");
async function navigate(event: KeyboardEvent) {
  const index = majors.findIndex((item) => item.code === selected.value);
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 2
        : ["ArrowRight", "ArrowDown"].includes(event.key)
          ? (index + 1) % 3
          : ["ArrowLeft", "ArrowUp"].includes(event.key)
            ? (index + 2) % 3
            : -1;
  if (target < 0) return;
  event.preventDefault();
  selected.value = majors[target]!.code;
  await nextTick();
  document.getElementById(`tab-${selected.value}`)?.focus();
}
watch(
  () => props.initial,
  (value) => {
    if (value) selected.value = value;
  },
);
</script>
<template>
  <section class="explore-section" aria-labelledby="explore-heading">
    <div class="explore-intro">
      <h2 id="explore-heading">同一个问题，三种专业视角。</h2>
      <p>
        <span class="serif">LumenLearn</span>
        是一个虚构的在线学习平台。<br />课程完成率下降了——你想从哪里开始？
      </p>
    </div>
    <div class="explore-grid">
      <div class="major-tabs" role="tablist" aria-label="专业任务预览">
        <button
          v-for="item in majors"
          :id="`tab-${item.code}`"
          :key="item.code"
          role="tab"
          :aria-selected="selected === item.code"
          :aria-controls="`preview-${item.code}`"
          :tabindex="selected === item.code ? 0 : -1"
          :class="{ active: selected === item.code }"
          @click="selected = item.code"
          @keydown="navigate"
        >
          <span class="major-tab-name"
            ><b class="serif">{{ item.short }}</b
            ><strong class="serif">{{ item.chinese }}</strong></span
          ><span>{{ item.question }}</span
          ><ArrowIcon />
        </button>
      </div>
      <article
        :id="`preview-${selected}`"
        class="task-preview"
        role="tabpanel"
        :aria-labelledby="`tab-${selected}`"
      >
        <img
          class="task-paper-art"
          src="/assets/p1-task-paper.png"
          alt=""
          width="1448"
          height="1086"
        />
        <div class="preview-top">
          <span class="serif">{{ major(selected).short }} · 任务预览</span><i />
        </div>
        <h3 class="serif">{{ major(selected).question }}</h3>
        <blockquote class="serif">{{ major(selected).quote }}</blockquote>
        <ol>
          <li v-for="(step, index) in major(selected).steps" :key="step[0]">
            <span class="step-number">{{ index + 1 }}</span>
            <div>
              <h4>{{ step[0] }}</h4>
              <p>{{ step[1] }}</p>
            </div>
          </li>
        </ol>
        <div class="preview-bottom">
          <strong>体验成果：{{ major(selected).outcome }}</strong
          ><span>专业任务即将开放</span>
        </div>
      </article>
    </div>
  </section>
</template>
