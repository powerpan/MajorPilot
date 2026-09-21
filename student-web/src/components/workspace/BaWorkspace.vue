<script setup lang="ts">
import { computed } from "vue";
import { useWorkspace } from "../../stores/workspace";
import { baLabel } from "../../lib/ba-display";
import BaFields from "./BaFields.vue";
import BaResults from "./BaResults.vue";
const workspace = useWorkspace();
const emit = defineEmits<{ execute: [] }>();
const operation = computed(() => workspace.step?.definition.operationKey || "");
const sql = computed(() =>
  workspace.baSql?.snippets.find(
    (item) => item.operationKey === operation.value,
  ),
);
const button = computed(
  () =>
    ({
      "ba-metric": "计算指标",
      "ba-funnel": "计算漏斗",
      "ba-segments": "计算群体比较",
    })[operation.value] || "计算",
);
const sources = computed(() =>
  [
    ...new Set(
      workspace.step?.inputBindings.map(
        (item) => `${item.sourceStepKey} · r${item.sourceRevision}`,
      ) || [],
    ),
  ].join("、"),
);
const rawValue = (row: unknown, key: string) =>
  (row as Record<string, unknown>)[key];
</script>
<template>
  <div v-if="workspace.step" class="ba-workspace">
    <template v-if="workspace.selectedStep === 'b1-context'">
      <section v-if="workspace.baBrief" class="ba-brief">
        <h2>{{ workspace.baBrief.title }}</h2>
        <p>{{ workspace.baBrief.problem }}</p>
        <p>{{ workspace.baBrief.observationWindow }}</p>
        <details class="ba-details">
          <summary>本次范围与未知事项</summary>
          <ul>
            <li v-for="item in workspace.baBrief.scope" :key="item">
              {{ item }}
            </li>
          </ul>
          <p>
            当前未观测：{{
              workspace.baBrief.unavailable.join("、")
            }}。没有的数据不能补成0。
          </p>
          <p>{{ workspace.baBrief.actionBoundary }}</p>
        </details>
      </section>
      <details v-if="workspace.baDictionary" class="ba-details">
        <summary>查看数据字典与72行合成业务表</summary>
        <p>
          每行是入学批次 × 课程方向 ×
          来源渠道。所有12批次都已成熟，观察每人入组后的前28天。支持联系是事件次数，不是人数，也不是漏斗阶段。
        </p>
        <div class="ba-table-scroll">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>含义与口径</th>
                <th>单位</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="field in workspace.baDictionary.fields"
                :key="field.fieldKey"
              >
                <th>
                  {{ field.label }}<br /><code>{{ field.fieldKey }}</code>
                </th>
                <td>{{ field.description }}</td>
                <td>{{ field.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ba-table-scroll">
          <table class="ba-raw-table">
            <caption>
              72个聚合组合，含真实0；全部数据合成
            </caption>
            <thead>
              <tr>
                <th
                  v-for="field in workspace.baDictionary.fields"
                  :key="field.fieldKey"
                >
                  {{ field.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in workspace.baRows" :key="index">
                <td
                  v-for="field in workspace.baDictionary.fields"
                  :key="field.fieldKey"
                >
                  {{ rawValue(row, field.fieldKey) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
    <section
      v-if="workspace.selectedStep === 'b6-action'"
      class="ba-context"
      data-field-path="context"
      data-attention-region
      :class="{ 'is-stale': workspace.baContextStale }"
    >
      <p v-if="workspace.baContextStale" class="warning-notice" role="status">
        行动依据已过期：上游版本已改变。旧基线不再用于目标判断；方案文字仍保留。
      </p>
      <template v-else-if="workspace.baActionContext"
        ><p>
          <strong>当前重点群体：</strong
          >{{ baLabel(workspace.baActionContext.parameters.segmentBy) }} ·
          {{ baLabel(workspace.baActionContext.prioritySegmentKey) }}
        </p>
        <p>
          <strong>参考证据：</strong>所选群体对比批次
          {{ workspace.baActionContext.parameters.comparisonStartWeek }}–{{
            workspace.baActionContext.parameters.comparisonEndWeek
          }}，每名学员前28天。来源
          {{
            Object.entries(workspace.baActionContext.sourceRevisions)
              .map(
                ([key, revision]) =>
                  key.slice(0, 2).toUpperCase() + " r" + revision,
              )
              .join(" / ")
          }}
        </p>
        <p>已由服务端读取当前已验证结果；目标仍是学生的试验设想。</p></template
      >
      <p v-else>
        尚无当前已复核依据。请返回 B4 重算，方案不会由旧历史结果补齐。
      </p>
      <div class="ba-context-actions">
        <button
          class="workspace-outline"
          :disabled="workspace.baContextLoading || workspace.busy"
          @click="workspace.reloadBaContext"
        >
          {{
            workspace.baContextLoading ? "正在读取…" : "重新读取当前依据"
          }}</button
        ><button
          v-if="workspace.baActionContext && !workspace.baContextStale"
          class="workspace-outline"
          :disabled="
            workspace.baContextConfirmed ||
            workspace.baContextLoading ||
            workspace.readOnly
          "
          data-attention-control
          @click="workspace.confirmBaContext"
        >
          {{
            workspace.baContextConfirmed
              ? "已确认当前依据"
              : "我已查看并确认当前依据"
          }}</button
        ><button
          v-if="!workspace.baActionContext || workspace.baContextStale"
          class="plain-button text-link"
          @click="workspace.select('b4-segment').catch(workspace.handle)"
        >
          返回 B4 复核
        </button>
      </div>
    </section>
    <BaFields
      :step-key="workspace.selectedStep"
      :schema="workspace.step.definition.inputSchema"
      :model-value="workspace.answer"
      :disabled="workspace.readOnly || workspace.executing || workspace.busy"
      :context="workspace.baActionContext"
      :context-stale="workspace.baContextStale"
      @update:model-value="workspace.edit"
    >
      <template #analysis
        ><div class="ba-analysis">
          <div class="ba-run-actions" data-field-path="execution" data-attention-region>
            <button
              class="workspace-outline"
              :disabled="
                workspace.readOnly ||
                workspace.executing ||
                workspace.busy ||
                !!workspace.recovered
              "
              data-attention-control
              @click="emit('execute')"
            >
              {{ workspace.executing ? "正在隔离计算并复核…" : button }}</button
            ><button
              v-if="workspace.executing"
              class="plain-button text-link"
              @click="workspace.cancelExecution"
            >
              取消运行</button
            ><span v-if="sources">沿用已保存的 {{ sources }}</span>
          </div>
          <p class="muted">
            每种操作最多30种成功配置，默认配置计次；相同配置复用免费。<span
              v-if="workspace.execution"
              >剩余 {{ workspace.execution.remainingEvaluations }} 种 ·
              {{
                workspace.execution.reused
                  ? "本次复用已有结果"
                  : "执行记录已返回"
              }}</span
            >
          </p>
          <p v-if="workspace.executionError" class="error-notice" role="alert">
            {{ workspace.executionError }}
          </p>
          <BaResults
            :value="workspace.baResult"
            :stale="workspace.resultStale"
          />
          <p v-if="workspace.execution" class="muted">
            {{
              workspace.execution.trustLevel === "SERVER_VERIFIED"
                ? "服务端已复算确认"
                : "结果待确认"
            }}
            · 回答 r{{ workspace.execution.inputRevision }} · 当前绑定 r{{
              workspace.execution.appliedToRevision ?? "无"
            }}
            · 来源 {{ JSON.stringify(workspace.execution.sourceRevisions) }} ·
            ba-metrics-v1
          </p>
          <details v-if="sql" class="ba-details ba-sql">
            <summary>查看等价 SQL 说明（只读，不执行）</summary>
            <p>{{ workspace.baSql?.executionNotice }}</p>
            <h3>{{ sql.title }}</h3>
            <pre><code>{{sql.code}}</code></pre>
          </details>
        </div></template
      >
    </BaFields>
  </div>
</template>
