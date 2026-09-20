<script setup lang="ts">
import { computed } from "vue";
import type { LearnerRow } from "../../../../shared/ds/ds-stats-v1.mjs";
import type { DsDictionary } from "../../lib/ds-display";
import { label } from "../../lib/ds-display";
const props = defineProps<{
  dictionary?: DsDictionary;
  rows?: LearnerRow[];
  expanded?: boolean;
  compact?: boolean;
}>();
const summary = computed(() => ({
  rows: props.rows?.length ?? 0,
  learners: new Set(props.rows?.map((row) => row.learner_id)).size,
  exactDuplicates:
    (props.rows?.length ?? 0) -
    new Set(props.rows?.map((row) => JSON.stringify(row))).size,
}));
function cell(row: LearnerRow, field: string) {
  const value = row[field as keyof LearnerRow];
  if (value === null)
    return row.lessons_started === 0 &&
      ["avg_session_minutes", "days_to_first_lesson"].includes(field)
      ? "不适用"
      : "记录缺失";
  if (typeof value === "boolean") return value ? "是" : "否";
  return label(value);
}
</script>
<template>
  <section
    v-if="dictionary"
    class="ds-references"
    :class="{ 'ds-references-compact': compact }"
  >
    <h2>原始数据概览</h2>
    <table>
      <tbody>
        <tr v-if="compact && rows">
          <th>{{ summary.rows }} 条</th>
          <td>
            {{ summary.learners }} 名合成学员，{{
              summary.exactDuplicates
            }}
            条完全重复记录
          </td>
        </tr>
        <tr v-if="!compact">
          <th>观察单位</th>
          <td>{{ dictionary.introduction }}</td>
        </tr>
        <tr v-if="!compact">
          <th>完成定义</th>
          <td>{{ dictionary.targetDefinition }}</td>
        </tr>
        <tr>
          <th>缺失与不适用</th>
          <td>分别计数，不把 null 当成 0；原始资产保持不变。</td>
        </tr>
      </tbody>
    </table>
    <details class="ds-details" :open="expanded">
      <summary>查看数据字典（13个字段）</summary>
      <template v-if="compact">
        <p>{{ dictionary.introduction }}</p>
        <p>{{ dictionary.targetDefinition }}</p>
      </template>
      <div class="ds-table-scroll">
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>含义与口径</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in dictionary.fields" :key="field.fieldKey">
              <th>
                {{ field.label }}<small>{{ field.fieldKey }}</small>
              </th>
              <td>{{ field.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
    <details v-if="rows" class="ds-details">
      <summary>
        查看原始合成记录（{{ rows.length }}条，未经当前方案处理）
      </summary>
      <div
        class="ds-table-scroll ds-raw-table"
        tabindex="0"
        aria-label="可横向滚动的完整原始合成记录"
      >
        <table>
          <thead>
            <tr>
              <th>原始行号</th>
              <th v-for="field in dictionary.fields" :key="field.fieldKey">
                {{ field.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="index">
              <th>{{ index + 1 }}</th>
              <td v-for="field in dictionary.fields" :key="field.fieldKey">
                {{ cell(row, field.fieldKey) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
