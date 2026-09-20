<script setup lang="ts">
import type { Recommendation } from "../types";
import { major } from "../data/majors";
defineProps<{ value: Recommendation; editorial?: boolean }>();
</script>
<template>
  <div
    class="recommendation-details"
    :class="{ 'editorial-recommendation': editorial }"
  >
    <header v-if="editorial" class="recommendation-intro">
      <h1 class="serif">你的第一站，不必是最后的答案。</h1>
      <p>先试一个方向，再通过体验比较。你仍然可以选择另外两个专业。</p>
    </header>
    <div class="recommendation-content">
      <div class="recommendation-main">
        <div class="recommendation-title">
          <span class="recommendation-code serif">{{
            major(value.primaryMajor).short
          }}</span>
          <div>
            <p>{{ editorial ? "先从这里开始" : "建议先体验" }}</p>
            <h2 class="primary-major-name serif">
              {{ major(value.primaryMajor).name }}
            </h2>
            <h2>{{ major(value.primaryMajor).chinese }}</h2>
          </div>
        </div>
        <section class="reason-section">
          <h2 class="serif" :class="{ 'sr-only': editorial }">
            为什么从这里开始
          </h2>
          <ol class="reason-list">
            <li
              v-for="(reason, index) in value.reasons"
              :key="reason.code"
              :class="{ 'reason-boundary': reason.reasonType === 'BOUNDARY' }"
            >
              <span class="reason-number serif">{{
                String(index + 1).padStart(2, "0")
              }}</span>
              <div>
                <span class="reason-type">{{
                  reason.reasonType === "RANKING"
                    ? "推荐依据"
                    : reason.reasonType === "CONTEXT"
                      ? "背景说明"
                      : "建议边界"
                }}</span>
                <p>{{ reason.text }}</p>
              </div>
            </li>
          </ol>
          <p
            v-if="value.explanationStatus === 'STRUCTURED_ONLY'"
            class="small muted"
          >
            以上为基于固定规则的说明；个性化 AI 润色暂未提供，不影响建议或注册。
          </p>
        </section>
        <div class="recommendation-bottom">
          <slot name="action" />
          <div class="support-notes">
            <p v-for="note in value.supportNotes" :key="note">{{ note }}</p>
          </div>
        </div>
      </div>
      <section class="other-majors">
        <h2 class="serif">另外两个方向，有什么不同？</h2>
        <div
          v-for="code in value.alternativeMajors"
          :key="code"
          class="alternative-row"
        >
          <div class="alternative-copy">
            <b class="serif">{{ major(code).short }}</b>
            <section>
              <h3>{{ major(code).name }}</h3>
              <p>
                {{
                  value.majorDifferences.find((item) => item.majorCode === code)
                    ?.description
                }}
              </p>
            </section>
          </div>
          <div
            v-if="editorial"
            class="lens-crop"
            :class="`lens-${major(code).short.toLowerCase()}`"
          >
            <img
              src="/assets/p1-hero-sculpture.png"
              alt=""
              width="1448"
              height="1086"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
