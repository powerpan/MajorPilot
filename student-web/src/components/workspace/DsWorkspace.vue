<script setup lang="ts">
import { computed } from "vue";
import { useWorkspace } from "../../stores/workspace";
import DsFields from "./DsFields.vue";
import DsResults from "./DsResults.vue";
import DsDataReferences from "./DsDataReferences.vue";
const workspace = useWorkspace();
const emit = defineEmits<{ execute: [] }>();
const operation = computed(() => workspace.step?.definition.operationKey || "");
const buttonText = computed(
  () =>
    ({
      "ds-quality-clean": "运行质量检查",
      "ds-profile": "运行分布分析",
      "ds-relationship": "运行关系分析",
      "ds-stratify": "运行分层检查",
    })[operation.value] || "运行分析",
);
const mode = computed(
  () =>
    workspace.answer.relationshipMode ||
    workspace.bindingConfiguration.relationshipMode,
);
const python = computed(() =>
  workspace.dsPython?.snippets.find(
    (value) =>
      value.operationKey === operation.value &&
      (!value.relationshipMode || value.relationshipMode === mode.value),
  ),
);
const sources = computed(() =>
  [
    ...new Set(
      workspace.step?.inputBindings.map(
        (value) => value.sourceStepKey + " · r" + value.sourceRevision,
      ) || [],
    ),
  ].join("、"),
);
</script>
<template>
  <div v-if="workspace.step" class="ds-workspace">
    <DsDataReferences
      v-if="['d1-context', 'd2-quality'].includes(workspace.selectedStep)"
      :dictionary="workspace.dsDictionary"
      :rows="workspace.dsRows"
      :compact="workspace.selectedStep === 'd2-quality'"
    />
    <DsFields
      :step-key="workspace.selectedStep"
      :schema="workspace.step.definition.inputSchema"
      :model-value="workspace.answer"
      :bindings="workspace.bindingConfiguration"
      :disabled="workspace.readOnly || workspace.executing || workspace.busy"
      @update:model-value="workspace.edit"
    >
      <template #analysis>
        <div class="ds-run-actions" data-field-path="execution" data-attention-region>
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
            {{ workspace.executing ? "正在隔离计算并复核…" : buttonText }}
          </button>
          <button
            v-if="workspace.executing"
            class="plain-button text-link"
            @click="workspace.cancelExecution"
          >
            取消运行
          </button>
          <span v-if="sources">来自已保存的 {{ sources }}</span>
        </div>
        <p class="muted">
          固定计算器；服务端复核结果。每种操作最多30种成功配置，重复配置复用不扣次数。<span
            v-if="workspace.execution"
            >剩余 {{ workspace.execution.remainingEvaluations }} 种 ·
            {{
              workspace.execution.reused ? "本次复用已有结果" : "新结果已记录"
            }}</span
          >
        </p>
        <p v-if="workspace.executionError" class="error-notice" role="alert">
          {{ workspace.executionError }}
        </p>
        <DsResults :value="workspace.dsResult" :stale="workspace.resultStale" />
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
          ds-stats-v1
        </p>
        <details v-if="python" class="ds-details ds-python">
          <summary>查看等价 Python 说明（只读，不执行）</summary>
          <p>{{ workspace.dsPython?.executionNotice }}</p>
          <h3>{{ python.title }}</h3>
          <pre><code>{{python.code}}</code></pre>
          <p v-if="mode">
            当前分析分支：{{
              mode === "SCATTER" ? "散点关系" : "分组完成率"
            }}。本说明不会执行，也不接受输入代码。
          </p>
        </details>
      </template>
    </DsFields>
  </div>
</template>
