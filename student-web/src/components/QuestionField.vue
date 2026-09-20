<script setup lang="ts">
import { computed } from "vue";
import type { Field, AnswerValue, Rank, MajorCode } from "../types";
const props = defineProps<{
  field: Field;
  modelValue: AnswerValue | undefined;
  error?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: AnswerValue] }>();
const selected = computed(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as string[]) : [],
);
const matrix = computed(() =>
  props.modelValue &&
  !Array.isArray(props.modelValue) &&
  typeof props.modelValue === "object"
    ? (props.modelValue as Record<string, string>)
    : {},
);
const ranks = computed(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as Rank[]) : [],
);
function toggle(code: string) {
  const values = selected.value.includes(code)
    ? selected.value.filter((value) => value !== code)
    : [...selected.value, code];
  if (values.length <= (props.field.maxItems || Infinity))
    emit("update:modelValue", values);
}
function rank(code: string, value: string) {
  const next = props.field.options.map((option) => ({
    majorCode: option.code as MajorCode,
    rank:
      option.code === code
        ? Number(value)
        : ranks.value.find((item) => item.majorCode === option.code)?.rank || 1,
  }));
  const levels = [...new Set(next.map((item) => item.rank))].sort();
  emit(
    "update:modelValue",
    next.map((item) => ({ ...item, rank: levels.indexOf(item.rank) + 1 })),
  );
}
function allTied() {
  emit(
    "update:modelValue",
    props.field.options.map((option) => ({
      majorCode: option.code as MajorCode,
      rank: 1,
    })),
  );
}
</script>
<template>
  <div class="question-field" :data-field="field.key">
    <template v-if="field.type === 'SINGLE' || field.type === 'MULTIPLE'"
      ><fieldset class="choice-list">
        <legend class="sr-only">
          {{
            field.key === "acquisitionChannel"
              ? "你从哪里知道我们？"
              : field.type === "MULTIPLE"
                ? "选择项目"
                : "选择一项"
          }}
        </legend>
        <label
          v-for="option in field.options"
          :key="option.code"
          class="choice-row"
          :class="{
            selected:
              field.type === 'SINGLE'
                ? modelValue === option.code
                : selected.includes(option.code),
          }"
          ><input
            :type="field.type === 'SINGLE' ? 'radio' : 'checkbox'"
            :name="field.key"
            :value="option.code"
            :checked="
              field.type === 'SINGLE'
                ? modelValue === option.code
                : selected.includes(option.code)
            "
            :disabled="
              field.type === 'MULTIPLE' &&
              !selected.includes(option.code) &&
              selected.length >= (field.maxItems || Infinity)
            "
            :aria-describedby="error ? `${field.key}-error` : undefined"
            @change="
              field.type === 'SINGLE'
                ? emit('update:modelValue', option.code)
                : toggle(option.code)
            "
          /><span>{{ option.label }}</span
          ><span class="choice-check" aria-hidden="true">{{
            (
              field.type === "SINGLE"
                ? modelValue === option.code
                : selected.includes(option.code)
            )
              ? "✓"
              : ""
          }}</span></label
        >
      </fieldset>
      <p v-if="field.type === 'MULTIPLE'" class="field-help">
        已选 {{ selected.length }} 项 · 最多 {{ field.maxItems }} 项
      </p></template
    ><template v-else-if="field.type === 'TEXT'"
      ><label :for="field.key" class="field-label">{{
        field.key === "mainQuestion"
          ? "想通过体验弄清的困惑（可选）"
          : "具体专业或方向（可选）"
      }}</label
      ><textarea
        :id="field.key"
        :value="typeof modelValue === 'string' ? modelValue : ''"
        :maxlength="(field.maxLength || 300) * 2"
        :rows="field.key === 'mainQuestion' ? 4 : 3"
        :aria-describedby="`${field.key}-help`"
        @input="
          emit(
            'update:modelValue',
            ($event.target as HTMLTextAreaElement).value,
          )
        "
      />
      <p :id="`${field.key}-help`" class="field-help">
        {{ typeof modelValue === "string" ? [...modelValue].length : 0 }} /
        {{ field.maxLength }} 字；不参与专业排序。
      </p></template
    >
    <div v-else-if="field.type === 'MATRIX'" class="matrix-list">
      <div v-for="row in field.rows" :key="row.code" class="matrix-row">
        <label :for="`${field.key}-${row.code}`">{{ row.label }}</label
        ><select
          :id="`${field.key}-${row.code}`"
          :value="matrix[row.code] || ''"
          @change="
            emit('update:modelValue', {
              ...matrix,
              [row.code]: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option disabled value="">请选择</option>
          <option
            v-for="option in field.options"
            :key="option.code"
            :value="option.code"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
    <div v-else-if="field.type === 'RANKING'" class="ranking-list">
      <p class="field-help">
        数字越小越想先尝试；可以并列。选择后会自动整理成连续顺序。
      </p>
      <div
        v-for="option in field.options"
        :key="option.code"
        class="ranking-row"
      >
        <label :for="`rank-${option.code}`">{{ option.label }}</label
        ><select
          :id="`rank-${option.code}`"
          :value="
            ranks.find((item) => item.majorCode === option.code)?.rank || 1
          "
          @change="
            rank(option.code, ($event.target as HTMLSelectElement).value)
          "
        >
          <option :value="1">第 1 优先</option>
          <option :value="2">第 2 优先</option>
          <option :value="3">第 3 优先</option>
        </select>
      </div>
      <button type="button" class="quiet-button" @click="allTied">
        三种情境同样想试
      </button>
    </div>
    <p v-if="error" :id="`${field.key}-error`" class="field-error" role="alert">
      {{ error }}
    </p>
  </div>
</template>
