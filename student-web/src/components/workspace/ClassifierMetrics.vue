<script setup lang="ts">
import type {
  Comparison,
  Metrics,
} from "../../../../shared/classifier/classifier-v1.mjs";
defineProps<{
  value?: Comparison | null;
  baseline?: Metrics;
  practice?: boolean;
}>();
const names: Record<string, string> = {
  technical_issue: "技术问题",
  concept_confusion: "概念困惑",
  schedule_constraint: "时间安排",
  motivation_support: "学习支持",
  MANUAL_REVIEW: "人工复核",
};
const rows = [
  { key: "coverage", label: "自动路由覆盖率" },
  { key: "autoAccuracy", label: "自动路由准确率" },
  { key: "totalCorrectAutoRate", label: "全体正确自动路由率" },
  { key: "manualReviewCount", label: "人工复核数" },
] as const;
function format(
  value: number | null | undefined,
  count = false,
  delta = false,
) {
  if (value === undefined) return "—";
  if (value === null) return "无可计算分母";
  return `${delta && value > 0 ? "+" : ""}${count ? value : (value * 100).toFixed(1)}${count ? "" : delta ? "个百分点" : "%"}`;
}
</script>
<template>
  <section
    class="classifier-metrics"
    :aria-label="practice ? '公开练习比较' : '固定评价集比较'"
  >
    <table>
      <thead>
        <tr>
          <th>指标</th>
          <th>基线</th>
          <th>本次</th>
          <th>变化</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th>{{ row.label }}</th>
          <td>
            {{
              format(
                (value?.baseline || baseline)?.[row.key],
                row.key === "manualReviewCount",
              )
            }}
          </td>
          <td :data-testid="`metric-${row.key}`">
            {{
              format(value?.candidate[row.key], row.key === "manualReviewCount")
            }}
          </td>
          <td>
            {{
              format(
                value?.delta[row.key],
                row.key === "manualReviewCount",
                true,
              )
            }}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="muted">
      {{
        practice
          ? "仅24条公开练习，不代表隐藏评价结果，不消耗正式次数。"
          : value
            ? "服务端固定隐藏集重算；仅聚合结果，不提供逐条隐藏答案。"
            : "尚未运行；运行后显示服务端复算结果。"
      }}
    </p>
    <details v-if="value">
      <summary>查看混淆矩阵与各类 precision / recall</summary>
      <p>行是真实类别，列是路由结果；人工复核不计作正确自动路由。</p>
      <div
        class="classifier-matrix"
        v-for="(metrics, index) in [value.baseline, value.candidate]"
        :key="index"
      >
        <h3>{{ index ? "本次" : "基线" }} · {{ metrics.sampleCount }}条</h3>
        <table>
          <thead>
            <tr>
              <th>真实 / 路由</th>
              <th v-for="label in metrics.confusionMatrix.columns" :key="label">
                {{ names[label] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(counts, row) in metrics.confusionMatrix.counts"
              :key="row"
            >
              <th>{{ names[metrics.confusionMatrix.labelOrder[row]!] }}</th>
              <td v-for="(count, col) in counts" :key="col">{{ count }}</td>
            </tr>
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>类别</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>样本数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in metrics.perLabel" :key="item.label">
              <th>{{ names[item.label] }}</th>
              <td>{{ format(item.precision) }}</td>
              <td>{{ format(item.recall) }}</td>
              <td>{{ item.supportCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>错误类别变化</h3>
      <table>
        <thead>
          <tr>
            <th>真实 → 路由</th>
            <th>基线</th>
            <th>本次</th>
            <th>变化</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in value.errorCategoryChanges"
            :key="`${item.trueLabel}-${item.predictedLabel}`"
          >
            <th>
              {{ names[item.trueLabel] }} → {{ names[item.predictedLabel] }}
            </th>
            <td>{{ item.baselineCount }}</td>
            <td>{{ item.candidateCount }}</td>
            <td>{{ format(item.change, true, true) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>
</template>
