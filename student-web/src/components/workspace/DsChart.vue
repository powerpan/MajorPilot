<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import type {
  Profile,
  Relationship,
} from "../../../../shared/ds/ds-stats-v1.mjs";
import {
  label,
  numberText,
  percentText,
  numericDomain,
  linearPosition,
} from "../../lib/ds-display";
const props = defineProps<{
  profile?: Profile;
  relationship?: Relationship;
  heading: string;
}>();
const host = ref<HTMLElement | null>(null),
  width = ref(700);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(300, entry.contentRect.width);
  });
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
const groups = computed(() => props.relationship?.groups || []);
const grouped = computed(
  () => props.relationship?.relationshipMode === "GROUP_COMPLETION",
);
const height = computed(() =>
  grouped.value ? groups.value.length * 56 + 95 : 320,
);
const left = computed(() => (grouped.value ? 130 : 62)),
  right = computed(() => width.value - 24),
  top = 25;
const bottom = computed(() => height.value - 65);
const maxCount = computed(() =>
  Math.max(1, ...(props.profile?.histogram.map((value) => value.count) || [1])),
);
const bars = computed(() => {
  const rows = props.profile?.histogram || [];
  return rows.map((row, index) => ({
    ...row,
    x: left.value + (index * (right.value - left.value)) / rows.length,
    w: (right.value - left.value) / rows.length,
    y: linearPosition(row.count, [0, maxCount.value], [bottom.value, top]),
  }));
});
const x = computed(() =>
  props.relationship?.xField
    ? numericDomain(props.relationship.xField)
    : ([0, 1] as [number, number]),
);
const y = computed(() =>
  props.relationship?.yField
    ? numericDomain(props.relationship.yField)
    : ([0, 1] as [number, number]),
);
const xPos = (value: number) =>
  linearPosition(value, x.value, [left.value, right.value]);
const yPos = (value: number) =>
  linearPosition(value, y.value, [bottom.value, top]);
const ratePos = (value: number) =>
  linearPosition(value, [0, 1], [left.value, right.value]);
const ticks = [0, 0.25, 0.5, 0.75, 1];
</script>
<template>
  <figure ref="host" class="ds-chart">
    <figcaption>{{ heading }}</figcaption>
    <svg
      v-if="
        (profile && profile.validCount > 0) ||
        grouped ||
        relationship?.points?.length
      "
      :viewBox="'0 0 ' + width + ' ' + height"
      role="img"
      :aria-label="heading"
    >
      <title>{{ heading }}</title>
      <desc>
        精确数值和统计口径见下方可展开数据表。空值不会绘制为零，颜色不代表因果或对错。
      </desc>
      <template v-if="profile">
        <g v-for="fraction in ticks" :key="fraction" class="ds-axis">
          <line
            :x1="left"
            :x2="right"
            :y1="bottom - fraction * (bottom - top)"
            :y2="bottom - fraction * (bottom - top)"
          />
          <text
            :x="left - 9"
            :y="bottom - fraction * (bottom - top) + 5"
            text-anchor="end"
          >
            {{ numberText(maxCount * fraction, 1) }}
          </text>
        </g>
        <g v-for="(bar, index) in bars" :key="bar.lower">
          <rect
            :x="bar.x + 2"
            :y="bar.y"
            :width="Math.max(0, bar.w - 4)"
            :height="bottom - bar.y"
            class="ds-bar"
          />
          <text
            :x="bar.x + bar.w / 2"
            :y="Math.max(16, bar.y - 8)"
            text-anchor="middle"
          >
            {{ bar.count }}
          </text>
          <text :x="bar.x + bar.w / 2" :y="bottom + 23" text-anchor="middle">
            {{ bar.lower }}–{{ bar.upper
            }}{{ index === bars.length - 1 ? "含" : "" }}
          </text>
        </g>
        <text :x="(left + right) / 2" :y="height - 12" text-anchor="middle">
          {{ label(profile.distributionField) }}
        </text>
        <text x="8" y="15">记录数</text>
      </template>
      <template v-else-if="grouped">
        <g v-for="(group, index) in groups" :key="group.key">
          <text x="0" :y="top + index * 56 + 18">{{ label(group.key) }}</text>
          <text x="0" :y="top + index * 56 + 38">
            {{ group.completedCount }} / {{ group.n }} 条
          </text>
          <line
            class="ds-grid"
            :x1="left"
            :x2="right"
            :y1="top + index * 56 + 14"
            :y2="top + index * 56 + 14"
          />
          <template
            v-if="
              group.completionRate !== null &&
              group.ciLower !== null &&
              group.ciUpper !== null
            "
          >
            <line
              class="ds-interval"
              :x1="ratePos(group.ciLower)"
              :x2="ratePos(group.ciUpper)"
              :y1="top + index * 56 + 14"
              :y2="top + index * 56 + 14"
            />
            <line
              v-for="bound in [group.ciLower, group.ciUpper]"
              :key="bound"
              class="ds-interval"
              :x1="ratePos(bound)"
              :x2="ratePos(bound)"
              :y1="top + index * 56 + 8"
              :y2="top + index * 56 + 20"
            />
            <circle
              class="ds-point"
              :cx="ratePos(group.completionRate)"
              :cy="top + index * 56 + 14"
              r="5"
            />
          </template>
          <text v-else :x="left + 10" :y="top + index * 56 + 18">
            n=0，无可计算比例
          </text>
        </g>
        <g v-for="fraction in ticks" :key="fraction" class="ds-axis">
          <line
            :x1="ratePos(fraction)"
            :x2="ratePos(fraction)"
            :y1="bottom"
            :y2="bottom + 6"
          />
          <text :x="ratePos(fraction)" :y="bottom + 25" text-anchor="middle">
            {{ fraction * 100 }}%
          </text>
        </g>
        <text :x="(left + right) / 2" :y="height - 10" text-anchor="middle">
          完成率与 Wilson 95% 区间
        </text>
      </template>
      <template v-else-if="relationship?.points">
        <g v-for="fraction in ticks" :key="fraction" class="ds-axis">
          <line
            :x1="left"
            :x2="right"
            :y1="yPos(y[1] * fraction)"
            :y2="yPos(y[1] * fraction)"
          />
          <text :x="left - 10" :y="yPos(y[1] * fraction) + 5" text-anchor="end">
            {{ numberText(y[1] * fraction, 2) }}
          </text>
          <text
            :x="xPos(x[1] * fraction)"
            :y="bottom + 24"
            text-anchor="middle"
          >
            {{ numberText(x[1] * fraction, 2) }}
          </text>
        </g>
        <circle
          v-for="point in relationship.points"
          :key="point.rowNumber"
          class="ds-scatter-point"
          :cx="xPos(point.x)"
          :cy="yPos(point.y)"
          r="3.5"
        />
        <text :x="(left + right) / 2" :y="height - 10" text-anchor="middle">
          {{ label(relationship.xField) }}
        </text>
        <text
          x="8"
          :y="(top + bottom) / 2"
          :transform="'rotate(-90 8 ' + (top + bottom) / 2 + ')'"
          text-anchor="middle"
        >
          {{ label(relationship.yField) }}
        </text>
      </template>
    </svg>
    <p v-else class="ds-empty" role="status">
      {{
        profile
          ? "没有有效记录，不绘制频数柱。统计量为无可计算值。"
          : "没有成对有效记录，不绘制散点。均值和相关系数为无可计算值。"
      }}
    </p>
    <p v-if="profile" class="muted">
      数值区间跨度不同，以等宽分箱类别显示；柱高表示记录数，不是密度。
      区间左闭右开，最后一格包含最大值；频数合计 n={{ profile.validCount }}。
    </p>
    <p v-if="relationship?.scatter" class="ds-stat-line">
      成对有效 n={{ relationship.scatter.n }} · Pearson r={{
        numberText(relationship.scatter.r)
      }}
      · 横轴均值 {{ numberText(relationship.scatter.meanX) }} · 纵轴均值
      {{ numberText(relationship.scatter.meanY)
      }}<span v-if="relationship.scatter.r === null"
        >。少于两条或变量为常量时，r无可计算值。</span
      >
    </p>
    <details class="ds-details">
      <summary>查看图表数据与口径</summary>
      <p v-if="grouped">
        以各组实际记录为分母。Wilson
        95%区间基于二项独立观测假设，不能消除重复、非随机样本、缺失和混杂。
      </p>
      <p v-else-if="!profile">
        每点是一条成对有效记录，不抖动、不连趋势线。均值与r使用同一个成对集合，相关关系不证明因果。
      </p>
      <div class="ds-table-scroll">
        <table v-if="profile">
          <thead>
            <tr>
              <th>区间</th>
              <th>记录数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in profile.histogram" :key="row.lower">
              <td>
                [{{ row.lower }}, {{ row.upper
                }}{{ row.upperInclusive ? "]" : ")" }}
              </td>
              <td>{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else-if="grouped">
          <thead>
            <tr>
              <th>群体</th>
              <th>完成数 / 分母 n</th>
              <th>完成率</th>
              <th>Wilson 95%区间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.key">
              <td>{{ label(group.key) }}</td>
              <td>{{ group.completedCount }} / {{ group.n }}</td>
              <td>{{ percentText(group.completionRate) }}</td>
              <td>
                {{ percentText(group.ciLower) }} –
                {{ percentText(group.ciUpper) }}
              </td>
            </tr>
          </tbody>
        </table>
        <table v-else>
          <thead>
            <tr>
              <th>原始行号</th>
              <th>{{ label(relationship?.xField) }}</th>
              <th>{{ label(relationship?.yField) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="point in relationship?.points" :key="point.rowNumber">
              <td>{{ point.rowNumber }}</td>
              <td>{{ numberText(point.x, 6) }}</td>
              <td>{{ numberText(point.y, 6) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>
