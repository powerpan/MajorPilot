<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useAuth } from "../stores/auth";
import { intakePointer } from "../stores/intake";
import ActionLink from "../components/ActionLink.vue";
import ExploreSection from "../components/ExploreSection.vue";
import ProcessStrip from "../components/ProcessStrip.vue";
const auth = useAuth(),
  pointer = ref(intakePointer());
function updatePointer() {
  pointer.value = intakePointer();
}
onMounted(() => window.addEventListener("mp:identity-cleared", updatePointer));
onBeforeUnmount(() =>
  window.removeEventListener("mp:identity-cleared", updatePointer),
);
const start = computed(() =>
  auth.me
    ? "/app"
    : pointer.value
      ? `/intake/${pointer.value.step.replace("step-", "")}`
      : "/intake/1",
);
const label = computed(() =>
  auth.me ? "进入个人主页" : pointer.value ? "继续填写" : "找到我的第一站",
);
</script>
<template>
  <main class="home-view">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="hero-copy">
        <h1 id="home-title">
          别只看专业介绍。<br /><span class="serif blue">先试试，</span
          ><span class="hero-question">你会做什么。</span>
        </h1>
        <p class="hero-description">
          从 <span class="serif">AI、Data Science</span> 与
          <span class="serif">Business Analytics</span>
          开始，<br />在真实任务的简化情境中，感受不同专业的工作方式。
        </p>
        <ActionLink :to="start">{{ label }}</ActionLink
        ><RouterLink class="text-link hero-secondary" to="/majors"
          >先看看专业任务 ↗</RouterLink
        >
        <p class="hero-availability">当前可获取初始建议；专业任务即将开放。</p>
        <div class="hero-note serif">
          更清晰的选择，<br />从一次真实的尝试开始。
        </div>
      </div>
      <div class="hero-art">
        <div class="hero-callout callout-ai">
          <b class="serif">AI /</b><span>检查模型错误</span><i />
        </div>
        <div class="hero-callout callout-ds">
          <b class="serif">DS /</b><span>从数据中找证据</span><i />
        </div>
        <div class="hero-callout callout-ba">
          <b class="serif">BA /</b><span>把分析变成行动</span><i />
        </div>
        <img
          src="/assets/p1-hero-sculpture.png"
          alt="三片透明观察镜片分别呈现模型错误、数据证据和行动漏斗，象征三种专业视角"
          fetchpriority="high"
        />
      </div>
    </section>
    <section class="perspective-strip">
      <div class="perspective-count serif">03</div>
      <span class="perspective-english"
        >DISCIPLINES<br />PERSPECTIVES<br />POSSIBILITIES</span
      >
      <h2 class="serif">不是测出你是谁，<br />而是看见你愿意怎么做。</h2>
      <p>不同的专业<br />通向不同的思考方式<br />也通向不同的可能</p>
    </section>
    <ExploreSection /><ProcessStrip />
    <section class="closing-cta">
      <h2 class="serif">
        先给好奇心，<br /><span class="blue">一个起点。</span>
      </h2>
      <ActionLink :to="start">{{ label }}</ActionLink>
    </section>
  </main>
</template>
