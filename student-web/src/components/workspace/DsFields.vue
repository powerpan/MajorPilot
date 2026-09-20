<script setup lang="ts">
import { computed } from "vue";
import type { Answer, InputSchema } from "../../types/workspace";
import { label, changeRelationshipMode } from "../../lib/ds-display";
const props = defineProps<{
  stepKey: string;
  schema: InputSchema;
  modelValue: Answer;
  disabled: boolean;
  bindings: Answer;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const set = (key: string, value: unknown) =>
  emit("update:modelValue", { ...props.modelValue, [key]: value });
const string = (key: string) => String(props.modelValue[key] ?? "");
const options = (key: string) => props.schema.properties[key]?.enum || [];
const optionsForFindings = (key: string) =>
  props.schema.properties.findings?.items?.properties?.[key]?.enum || [];
const limit = (key: string) => props.schema.properties[key]?.maxLength;
function select(key: string, event: Event) {
  set(key, (event.target as HTMLSelectElement).value);
}
function toggle(key: string, value: string) {
  const current = (props.modelValue[key] || []) as string[];
  set(
    key,
    current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value],
  );
}
const findings = computed(() =>
  Array.isArray(props.modelValue.findings)
    ? (props.modelValue.findings as Answer[])
    : [{}, {}],
);
function finding(index: number, key: string, value: string) {
  const next = findings.value.map((item) => ({ ...item }));
  next[index]![key] = value;
  set("findings", next);
}
const qualityRows = [
  ["duplicatePolicy", "重复记录"],
  ["missingPolicy", "记录缺失"],
  ["extremePolicy", "极端值"],
] as const;
const textLabels: Record<string, string> = {
  duplicateReason: "重复处理的理由",
  missingReason: "缺失处理的理由",
  sampleInterpretation: "这些分母说明了什么？",
  observation: "你观察到了什么？",
  uncertaintyComment: "哪些不确定性仍然存在？",
  unsupportedCausalClaim: "一个不能由当前数据推出的因果结论",
  limitations: "当前分析的限制",
  nextQuestion: "下一步值得验证的问题",
};
</script>
<template>
  <div class="ds-fields">
    <template v-if="stepKey === 'd1-context'">
      <label class="workspace-check"
        ><input
          name="acknowledged"
          type="checkbox"
          :checked="modelValue.acknowledged === true"
          :disabled="disabled"
          @change="
            set('acknowledged', ($event.target as HTMLInputElement).checked)
          "
        />我已阅读数据定义与分析边界</label
      >
      <div class="ds-two-columns">
        <label v-for="key in ['observationUnit', 'targetField']" :key="key"
          >{{
            key === "observationUnit"
              ? "一行记录代表什么？"
              : "本次问题的目标字段是什么？"
          }}<select
            :name="key"
            :value="string(key)"
            :disabled="disabled"
            @change="select(key, $event)"
          >
            <option value="" disabled>请选择</option>
            <option
              v-for="option in options(key)"
              :key="option"
              :value="option"
            >
              {{ label(option) }}
            </option>
          </select></label
        >
      </div>
    </template>
    <template v-if="stepKey === 'd2-quality'">
      <fieldset class="ds-issues" :disabled="disabled">
        <legend>发现了哪些问题？（至少两项）</legend>
        <label
          v-for="option in schema.properties.identifiedIssues?.items?.enum"
          :key="option"
          ><input
            name="identifiedIssues"
            type="checkbox"
            :value="option"
            :checked="
              ((modelValue.identifiedIssues || []) as string[]).includes(
                String(option),
              )
            "
            @change="toggle('identifiedIssues', String(option))"
          />{{ label(option) }}</label
        >
      </fieldset>
      <div class="ds-policy-rows">
        <label v-for="[key, title] in qualityRows" :key="key"
          ><span>{{ title }}</span
          ><select
            :name="key"
            :value="string(key!)"
            :disabled="disabled"
            @change="select(key!, $event)"
          >
            <option value="" disabled>请选择</option>
            <option
              v-for="option in options(key!)"
              :key="option"
              :value="option"
            >
              {{
                option === "KEEP"
                  ? key === "duplicatePolicy"
                    ? "保留记录"
                    : "保留原值"
                  : label(option)
              }}
            </option>
          </select></label
        >
        <p class="muted">缩尾会改变测量值，不代表极端值就是错误。</p>
      </div>
      <div class="ds-two-columns">
        <label v-for="key in ['duplicateReason', 'missingReason']" :key="key"
          >{{ textLabels[key]
          }}<textarea
            :name="key"
            :maxlength="limit(key)"
            :value="string(key)"
            :disabled="disabled"
            rows="3"
            @input="set(key, ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
      </div>
      <slot name="analysis" />
    </template>
    <template v-if="stepKey === 'd3-profile'">
      <label class="ds-inline-select"
        >分布字段<select
          name="distributionField"
          :value="string('distributionField')"
          :disabled="disabled"
          @change="select('distributionField', $event)"
        >
          <option value="" disabled>请选择</option>
          <option
            v-for="option in options('distributionField')"
            :key="option"
            :value="option"
          >
            {{ label(option) }}
          </option>
        </select></label
      >
      <slot name="analysis" />
      <label
        >{{ textLabels.sampleInterpretation
        }}<textarea
          name="sampleInterpretation"
          :maxlength="limit('sampleInterpretation')"
          :value="string('sampleInterpretation')"
          :disabled="disabled"
          rows="3"
          @input="
            set(
              'sampleInterpretation',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        />
      </label>
    </template>
    <template v-if="stepKey === 'd4-relationship'">
      <fieldset class="ds-modes" :disabled="disabled">
        <legend class="sr-only">分析模式</legend>
        <label v-for="mode in options('relationshipMode')" :key="mode"
          ><input
            type="radio"
            name="relationshipMode"
            :value="mode"
            :checked="modelValue.relationshipMode === mode"
            @change="
              emit(
                'update:modelValue',
                changeRelationshipMode(modelValue, String(mode)),
              )
            "
          />{{ label(mode) }}</label
        >
      </fieldset>
      <label
        v-if="modelValue.relationshipMode === 'GROUP_COMPLETION'"
        class="ds-inline-select"
        >分组依据<select
          name="groupBy"
          :value="string('groupBy')"
          :disabled="disabled"
          @change="select('groupBy', $event)"
        >
          <option value="" disabled>请选择</option>
          <option
            v-for="option in options('groupBy')"
            :key="option"
            :value="option"
          >
            {{ label(option) }}
          </option></select
        ><span>目标固定为按期完成 completed。</span></label
      >
      <div
        v-else-if="modelValue.relationshipMode === 'SCATTER'"
        class="ds-two-columns"
      >
        <label v-for="key in ['xField', 'yField']" :key="key"
          >{{ key === "xField" ? "横轴变量" : "纵轴变量"
          }}<select
            :name="key"
            :value="string(key)"
            :disabled="disabled"
            @change="select(key, $event)"
          >
            <option value="" disabled>请选择</option>
            <option
              v-for="option in options(key)"
              :key="option"
              :value="option"
              :disabled="
                option === modelValue[key === 'xField' ? 'yField' : 'xField']
              "
            >
              {{ label(option) }}
            </option>
          </select></label
        >
      </div>
      <slot name="analysis" />
      <label
        >{{ textLabels.observation
        }}<textarea
          name="observation"
          :maxlength="limit('observation')"
          :value="string('observation')"
          :disabled="disabled"
          rows="3"
          @input="
            set('observation', ($event.target as HTMLTextAreaElement).value)
          "
        />
      </label>
    </template>
    <template v-if="stepKey === 'd5-stratify'">
      <label class="ds-inline-select"
        >分层依据<select
          name="stratifyBy"
          :value="string('stratifyBy')"
          :disabled="disabled"
          @change="select('stratifyBy', $event)"
        >
          <option value="" disabled>请选择</option>
          <option
            v-for="option in options('stratifyBy')"
            :key="option"
            :value="option"
            :disabled="
              bindings.relationshipMode === 'GROUP_COMPLETION' &&
              bindings.groupBy === option
            "
          >
            {{ label(option) }}
          </option>
        </select></label
      >
      <p class="muted">沿用已保存的关系定义和质量处理方案。</p>
      <slot name="analysis" />
      <label class="ds-inline-select"
        >这份数据支持因果结论吗？<select
          name="causalJudgment"
          :value="string('causalJudgment')"
          :disabled="disabled"
          @change="select('causalJudgment', $event)"
        >
          <option value="" disabled>请选择</option>
          <option
            v-for="option in options('causalJudgment')"
            :key="option"
            :value="option"
          >
            {{ label(option) }}
          </option>
        </select></label
      >
      <label
        >{{ textLabels.uncertaintyComment
        }}<textarea
          name="uncertaintyComment"
          :maxlength="limit('uncertaintyComment')"
          :value="string('uncertaintyComment')"
          :disabled="disabled"
          rows="3"
          @input="
            set(
              'uncertaintyComment',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        />
      </label>
    </template>
    <template v-if="stepKey === 'd6-conclusion'">
      <fieldset
        v-for="(item, index) in findings"
        :key="index"
        class="ds-finding"
        :disabled="disabled"
      >
        <legend>发现 {{ index + 1 }}</legend>
        <label
          >陈述<textarea
            :name="'finding-' + index + '-statement'"
            rows="3"
            :maxlength="
              schema.properties.findings?.items?.properties?.statement
                ?.maxLength
            "
            :value="String(item.statement || '')"
            @input="
              finding(
                index,
                'statement',
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
        </label>
        <div class="ds-two-columns">
          <label v-for="key in ['evidenceStepKey', 'verdict']" :key="key"
            >{{ key === "evidenceStepKey" ? "引用的分析步骤" : "证据判断"
            }}<select
              :name="'finding-' + index + '-' + key"
              :value="String(item[key] || '')"
              @change="
                finding(index, key, ($event.target as HTMLSelectElement).value)
              "
            >
              <option value="" disabled>请选择</option>
              <option
                v-for="option in optionsForFindings(key)"
                :key="option"
                :value="option"
              >
                {{ label(option) }}
              </option>
            </select></label
          >
        </div>
        <button
          v-if="findings.length > 2"
          class="plain-button text-link"
          @click="
            set(
              'findings',
              findings.filter((_, i) => i !== index),
            )
          "
        >
          移除本项发现
        </button>
      </fieldset>
      <button
        v-if="findings.length < 3"
        class="workspace-outline"
        :disabled="disabled"
        @click="set('findings', [...findings, {}])"
      >
        增加第三项发现（可选）
      </button>
      <label
        v-for="key in ['unsupportedCausalClaim', 'limitations', 'nextQuestion']"
        :key="key"
        >{{ textLabels[key]
        }}<textarea
          :name="key"
          :maxlength="limit(key)"
          :value="string(key)"
          :disabled="disabled"
          rows="3"
          @input="set(key, ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
    </template>
  </div>
</template>
