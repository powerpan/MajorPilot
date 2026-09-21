<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { baLabel, rateText, type BaResult } from "../../lib/ba-display";
const props = defineProps<{ value: BaResult }>();
const container = ref<HTMLElement | null>(null),
  width = ref(700);
let observer: ResizeObserver;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    width.value = Math.max(420, Math.floor(entries[0]!.contentRect.width));
  });
  if (container.value) observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());
const trend = computed(() =>
  props.value.operationKey === "ba-metric" ? props.value.trend : null,
);
const rows = computed(() =>
  props.value.operationKey === "ba-funnel"
    ? props.value.stages.map((item) => ({
        key: item.stageKey,
        label: baLabel(item.stageKey).replace(/人数$/, ""),
        baseline: item.baseline.cumulativeRate,
        comparison: item.comparison.cumulativeRate,
        counts: `${item.baseline.count} / ${item.comparison.count}`,
      }))
    : props.value.operationKey === "ba-segments"
      ? props.value.segments.map((item) => ({
          key: item.segmentKey,
          label: baLabel(item.segmentKey),
          baseline: item.baseline.metric.rate,
          comparison: item.comparison.metric.rate,
          counts: `${item.baseline.metric.numeratorCount}/${item.baseline.metric.denominatorCount} · ${item.comparison.metric.numeratorCount}/${item.comparison.metric.denominatorCount}`,
        }))
      : [],
);
const left = computed(() =>
    trend.value ? 58 : Math.min(180, width.value * 0.28),
  ),
  right = 70,
  top = 48;
const plotWidth = computed(() => width.value - left.value - right);
const height = computed(() =>
  trend.value ? 250 : top + rows.value.length * 54 + 28,
);
const x = (rate: number) => left.value + rate * plotWidth.value;
const trendX = (week: number) =>
  left.value + ((week - 1) / 11) * plotWidth.value;
const trendY = (rate: number) => 198 - rate * 150;
const paths = computed(() => {
  const chunks: string[] = [];
  let current = "";
  for (const item of trend.value || []) {
    if (item.rate === null) {
      if (current) chunks.push(current);
      current = "";
    } else
      current += `${current ? " L" : "M"}${trendX(item.week)},${trendY(item.rate)}`;
  }
  if (current) chunks.push(current);
  return chunks;
});
</script>
<template>
  <div ref="container" class="ba-chart">
    <svg
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-labelledby="ba-chart-title ba-chart-description"
    >
      <title id="ba-chart-title">
        {{ trend ? "12个成熟入学批次的指标趋势" : "两期同比例刻度对照" }}
      </title>
      <desc id="ba-chart-description">
        比例轴固定从0到100%。不可计算值不画成0，精确分子分母在相邻原生表格中。{{
          trend
            ? "12个入学批次趋势，点为批次比例；不区分两期颜色。"
            : "蓝色为对比期，灰色为基准期。"
        }}
      </desc>
      <template v-if="trend">
        <g v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">
          <line
            :x1="left"
            :x2="width - right"
            :y1="trendY(tick)"
            :y2="trendY(tick)"
            class="ba-grid"
          />
          <text :x="left - 10" :y="trendY(tick) + 5" text-anchor="end">
            {{ tick * 100 }}%
          </text>
        </g>
        <path
          v-for="(path, index) in paths"
          :key="index"
          :d="path"
          fill="none"
          stroke="#304FFE"
          stroke-width="2"
        />
        <g v-for="item in trend" :key="item.week">
          <circle
            v-if="item.rate !== null"
            :cx="trendX(item.week)"
            :cy="trendY(item.rate)"
            r="4"
            fill="#304FFE"
          />
          <text :x="trendX(item.week)" y="224" text-anchor="middle">
            {{ item.week }}
          </text>
        </g>
        <text :x="width / 2" y="248" text-anchor="middle">
          入学批次周（全部已完成28天观察）
        </text>
      </template>
      <template v-else>
        <g v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">
          <line
            :x1="x(tick)"
            :x2="x(tick)"
            y1="33"
            :y2="height - 16"
            class="ba-grid"
          />
          <text :x="x(tick)" y="23" text-anchor="middle">
            {{ tick * 100 }}%
          </text>
        </g>
        <g
          v-for="(row, index) in rows"
          :key="row.key"
          :transform="`translate(0,${top + index * 54})`"
        >
          <text x="0" y="9">{{ row.label }}</text>
          <text x="0" y="30" class="ba-count-label">{{ row.counts }}</text>
          <rect
            v-if="row.baseline !== null"
            :x="left"
            y="0"
            :width="row.baseline * plotWidth"
            height="12"
            fill="#9CA3AF"
          />
          <text :x="row.baseline === null ? left : x(row.baseline) + 6" y="11">
            {{ rateText(row.baseline) }}
          </text>
          <rect
            v-if="row.comparison !== null"
            :x="left"
            y="20"
            :width="row.comparison * plotWidth"
            height="12"
            fill="#304FFE"
          />
          <text
            :x="row.comparison === null ? left : x(row.comparison) + 6"
            y="31"
            fill="#304FFE"
          >
            {{ rateText(row.comparison) }}
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>
