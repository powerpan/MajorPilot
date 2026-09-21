<script setup lang="ts">
import { computed, ref } from "vue";
import {
  baLabel,
  rateText,
  ppText,
  supportText,
  metricTitle,
  sortTransitions,
  type BaResult,
} from "../../lib/ba-display";
import BaChart from "./BaChart.vue";
const props = defineProps<{ value: BaResult | null; stale: boolean }>();
const mode = ref<"LOSS" | "DELTA">("LOSS");
const transitions = computed(() =>
  props.value?.operationKey === "ba-funnel"
    ? sortTransitions(props.value.transitions, mode.value)
    : [],
);
</script>
<template>
  <section class="ba-results" :class="{ 'is-stale': stale }">
    <p v-if="!value" class="workspace-empty">
      尚未计算。先保存允许的参数，再运行；这里不会显示示例数字。
    </p>
    <template v-else>
      <p v-if="stale" class="warning-notice" role="status">
        历史结果：输入或来源已改变，需重新运行。以下数值不是当前配置结果。
      </p>
      <p class="ba-window-summary">
        基准批次 {{ value.windows.baseline.startWeek }}–{{
          value.windows.baseline.endWeek
        }}　｜　对比批次 {{ value.windows.comparison.startWeek }}–{{
          value.windows.comparison.endWeek
        }}　｜　每人完整28天观察
      </p>
      <template v-if="value.operationKey === 'ba-metric'">
        <h2>{{ metricTitle(value.denominator) }}</h2>
        <div class="ba-table-scroll">
          <table>
            <thead>
              <tr>
                <th>批次</th>
                <th>完成人数</th>
                <th>{{ baLabel(value.denominator) }}</th>
                <th>{{ metricTitle(value.denominator) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="period in ['baseline', 'comparison'] as const"
                :key="period"
              >
                <th>{{ period === "baseline" ? "基准" : "对比" }}</th>
                <td>{{ value[period].numeratorCount }}</td>
                <td>{{ value[period].denominatorCount }}</td>
                <td>{{ rateText(value[period].rate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          变化：{{ ppText(value.deltaPercentagePoints) }}；相对变化：{{
            rateText(value.relativeChange)
          }}。
        </p>
        <p class="muted">
          先合计人数，再计算比例；不能平均每周百分比。条件分母与整体分母回答不同问题。
        </p>
        <h3>12个成熟批次趋势</h3>
        <BaChart :value="value" />
        <details class="ba-details">
          <summary>查看全部批次的精确计数（图表替代）</summary>
          <div class="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>入学批次周</th>
                  <th>完成人数</th>
                  <th>{{ baLabel(value.denominator) }}</th>
                  <th>比例</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in value.trend" :key="item.week">
                  <th>{{ item.week }}</th>
                  <td>{{ item.numeratorCount }}</td>
                  <td>{{ item.denominatorCount }}</td>
                  <td>{{ rateText(item.rate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>
      <template v-else-if="value.operationKey === 'ba-funnel'">
        <h2>各环节累计到达率对比</h2>
        <p class="ba-legend">
          <span>灰色：基准期</span><span>蓝色：对比期</span>　人数按基准 /
          对比显示
        </p>
        <BaChart :value="value" />
        <p class="muted">
          累计到达率以报名为分母；相邻转化率以上一环节为分母。“开课首周活跃”从首次开课算起，且仍在报名28天观察期内。差异不是原因。
        </p>
        <details class="ba-details">
          <summary>六阶段人数与累计到达率（图表替代）</summary>
          <div class="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>基准人数 / 累计率</th>
                  <th>对比人数 / 累计率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in value.stages" :key="item.stageKey">
                  <th>{{ baLabel(item.stageKey) }}</th>
                  <td>
                    {{ item.baseline.count }} /
                    {{ rateText(item.baseline.cumulativeRate) }}
                  </td>
                  <td>
                    {{ item.comparison.count }} /
                    {{ rateText(item.comparison.cumulativeRate) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <label class="ba-sort"
          >相邻环节排序<select v-model="mode" name="funnelSort">
            <option value="LOSS">对比期人数损失：从多到少</option>
            <option value="DELTA">转化率百分点变化：从小到大</option>
          </select></label
        >
        <div class="ba-table-scroll">
          <table class="ba-transition-table">
            <thead>
              <tr>
                <th>相邻环节</th>
                <th>基准：到达 / 上一环节 · 转化率</th>
                <th>对比：到达 / 上一环节 · 转化率</th>
                <th>损失人数（基准 / 对比）</th>
                <th>转化率变化</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in transitions"
                :key="item.transitionKey"
                :data-transition="item.transitionKey"
              >
                <th>{{ baLabel(item.transitionKey) }}</th>
                <td>
                  {{ item.baseline.numeratorCount }} /
                  {{ item.baseline.denominatorCount }} ·
                  {{ rateText(item.baseline.conversionRate) }}
                </td>
                <td>
                  {{ item.comparison.numeratorCount }} /
                  {{ item.comparison.denominatorCount }} ·
                  {{ rateText(item.comparison.conversionRate) }}
                </td>
                <td>
                  {{ item.baseline.lossCount }} /
                  {{ item.comparison.lossCount }}
                </td>
                <td>{{ ppText(item.deltaPercentagePoints) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted">
          不可计算值置后；并列按固定漏斗顺序。排序不替你选择重点，也不消耗计算次数。
        </p>
      </template>
      <template v-else>
        <h2>
          按{{ baLabel(value.segmentBy) }}比较{{
            metricTitle(value.denominator)
          }}
        </h2>
        <p class="ba-legend">
          <span>灰色：基准期</span><span>蓝色：对比期</span>　标签为分子 / 分母
        </p>
        <BaChart :value="value" />
        <p>所选相邻环节：{{ baLabel(value.focusTransitionKey) }}</p>
        <div class="ba-table-scroll">
          <table class="ba-segment-table">
            <caption>
              群体两期精确结果（图表替代）
            </caption>
            <thead>
              <tr>
                <th>群体 / 时期</th>
                <th>报名人数 / 占同期报名</th>
                <th>主指标：分子 / 分母 · 率</th>
                <th>相邻环节：到达 / 上一环节 · 率</th>
                <th>支持联系次数 / 每100报名者</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in value.segments" :key="item.segmentKey"
                ><tr
                  v-for="period in ['baseline', 'comparison'] as const"
                  :key="item.segmentKey + period"
                >
                  <th>
                    {{ baLabel(item.segmentKey) }} ·
                    {{ period === "baseline" ? "基准" : "对比" }}
                  </th>
                  <td>
                    {{ item[period].stageCounts.enrolled_count }} /
                    {{ rateText(item[period].enrolledShare) }}
                  </td>
                  <td>
                    {{ item[period].metric.numeratorCount }} /
                    {{ item[period].metric.denominatorCount }} ·
                    {{ rateText(item[period].metric.rate) }}
                  </td>
                  <td>
                    {{ item[period].focusTransition.numeratorCount }} /
                    {{ item[period].focusTransition.denominatorCount }} ·
                    {{ rateText(item[period].focusTransition.conversionRate) }}
                  </td>
                  <td>
                    {{ item[period].supportContactCount }}次 /
                    {{
                      supportText(item[period].supportContactsPer100Enrolled)
                    }}
                  </td>
                </tr>
                <tr>
                  <th>{{ baLabel(item.segmentKey) }}变化</th>
                  <td>—</td>
                  <td>{{ ppText(item.metricDeltaPercentagePoints) }}</td>
                  <td>{{ ppText(item.transitionDeltaPercentagePoints) }}</td>
                  <td>联系是次数，不是人数</td>
                </tr></template
              >
            </tbody>
          </table>
        </div>
        <details class="ba-details">
          <summary>各群体六阶段原始人数</summary>
          <div class="ba-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>群体 / 时期</th>
                  <th
                    v-for="key in Object.keys(
                      value.segments[0]?.comparison.stageCounts || {},
                    )"
                    :key="key"
                  >
                    {{ baLabel(key) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="item in value.segments" :key="item.segmentKey"
                  ><tr
                    v-for="period in ['baseline', 'comparison'] as const"
                    :key="period"
                  >
                    <th>
                      {{ baLabel(item.segmentKey) }} ·
                      {{ period === "baseline" ? "基准" : "对比" }}
                    </th>
                    <td
                      v-for="(count, key) in item[period].stageCounts"
                      :key="key"
                    >
                      {{ count }}
                    </td>
                  </tr></template
                >
              </tbody>
            </table>
          </div>
        </details>
        <p class="muted">
          先看人数与构成，再读比例。差异本身不能证明某群体或渠道是原因；缺分母显示不可计算，不补成0。
        </p>
      </template>
    </template>
  </section>
</template>
