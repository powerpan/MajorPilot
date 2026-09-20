<script setup lang="ts">
import type { DsResult } from "../../../../shared/ds/ds-stats-v1.mjs";
import DsChart from "./DsChart.vue";
import { label, numberText, percentText } from "../../lib/ds-display";
defineProps<{ value: DsResult | null; stale: boolean }>();
</script>
<template>
  <section class="ds-results" aria-label="数据分析结果">
    <p v-if="stale" class="result-stale" role="status">
      结果已过期：输入或来源版本发生变化。以下保留历史记录，请重新运行后再解释当前方案。
    </p>
    <p v-if="!value" class="ds-empty" role="status">
      尚未运行。选择方案后运行分析，这里将显示经过服务端复算的实际统计；不使用示意数值。
    </p>
    <template v-else>
      <p class="ds-stat-line">
        原始 {{ value.inputRows }} 条 · 保留 {{ value.retainedRows }} 条记录 ·
        独立学员 {{ value.uniqueLearners }} 名 ·
        {{
          value.operationKey === "ds-quality-clean"
            ? "本次质量检查覆盖"
            : "本分析有效"
        }}
        {{ value.analysisRows }} 条
      </p>
      <p class="muted">
        分析排除 {{ value.exclusions.total }} 条：仅缺失
        {{ value.exclusions.missingOnly }}、仅不适用
        {{ value.exclusions.notApplicableOnly }}、两者兼有
        {{ value.exclusions.both }}。保留重复时，比例分母是记录而非独立学员。
      </p>
      <template v-if="value.operationKey === 'ds-quality-clean'">
        <h2>质量处理前后</h2>
        <div class="ds-table-scroll">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>处理前 有效 / 缺失 / 不适用</th>
                <th>处理后 有效 / 缺失 / 不适用</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(field, index) in value.quality.before"
                :key="field.fieldKey"
              >
                <th>{{ label(field.fieldKey) }}</th>
                <td>
                  {{ field.validCount }} / {{ field.missingCount }} /
                  {{ field.notApplicableCount }}
                </td>
                <td>
                  {{ value.quality.after[index]?.validCount }} /
                  {{ value.quality.after[index]?.missingCount }} /
                  {{ value.quality.after[index]?.notApplicableCount }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          原始精确重复 {{ value.quality.duplicateRows }} 条，删除
          {{ value.quality.removedDuplicateRows }} 条；删除记录缺失
          {{ value.quality.removedMissingRows }} 条。会话缩尾
          {{ value.quality.cappedRows }} 条，阈值
          {{ numberText(value.quality.capValue) }} 分钟。
        </p>
        <details class="ds-details">
          <summary>查看填补与重复明细</summary>
          <ul>
            <li v-for="item in value.quality.imputations" :key="item.fieldKey">
              {{ label(item.fieldKey) }}：填补 {{ item.count }} 条，中位数
              {{ numberText(item.median) }}
            </li>
            <li
              v-for="group in value.quality.duplicateGroups"
              :key="group.learnerId"
            >
              {{ group.learnerId }}：原始行 {{ group.rowNumbers.join("、") }}
            </li>
          </ul>
        </details>
      </template>
      <template v-if="value.profile">
        <p>
          完成 {{ value.profile.completion.completedCount }} /
          {{ value.profile.completion.n }} 条，完成率
          {{ percentText(value.profile.completion.completionRate) }}；Wilson
          95%区间 {{ percentText(value.profile.completion.ciLower) }} –
          {{ percentText(value.profile.completion.ciUpper) }}。
        </p>
        <p>
          所选字段有效 n={{ value.profile.validCount }}；缺失
          {{ value.profile.missingCount }}，不适用
          {{ value.profile.notApplicableCount }}。均值
          {{ numberText(value.profile.mean) }} · 中位数
          {{ numberText(value.profile.median) }} · Q1
          {{ numberText(value.profile.q25) }} · Q3
          {{ numberText(value.profile.q75) }} · 最小
          {{ numberText(value.profile.minimum) }} · 最大
          {{ numberText(value.profile.maximum) }}。
        </p>
        <DsChart
          :profile="value.profile"
          :heading="label(value.profile.distributionField) + '的分箱频数'"
        />
      </template>
      <DsChart
        v-if="value.relationship"
        :relationship="value.relationship"
        :heading="
          value.relationship.relationshipMode === 'GROUP_COMPLETION'
            ? '按' + label(value.relationship.groupBy) + '比较完成率'
            : '两个变量的成对关系'
        "
      />
      <template v-if="value.stratified">
        <h2>整体与分层对照</h2>
        <template
          v-if="
            value.stratified.overall.relationshipMode === 'GROUP_COMPLETION'
          "
        >
          <DsChart :relationship="value.stratified.overall" heading="整体" />
          <div v-for="stratum in value.stratified.strata" :key="stratum.key">
            <DsChart
              :relationship="stratum.summary"
              :heading="label(stratum.key)"
            />
            <p class="muted">
              本层保留 {{ stratum.retainedRows }} 条；分析有效
              {{ stratum.summary.analysisRows }}，排除
              {{ stratum.summary.exclusions.total }}（仅缺失
              {{ stratum.summary.exclusions.missingOnly }} / 仅不适用
              {{ stratum.summary.exclusions.notApplicableOnly }} / 两者
              {{ stratum.summary.exclusions.both }}）。
            </p>
          </div>
        </template>
        <div v-else class="ds-table-scroll">
          <table class="ds-stratified-scatter">
            <caption>
              同一对变量：{{
                label(value.stratified.overall.xField)
              }}
              ×
              {{
                label(value.stratified.overall.yField)
              }}；逐层重算，不平均r
            </caption>
            <thead>
              <tr>
                <th>群体</th>
                <th>成对 n</th>
                <th>横轴均值</th>
                <th>纵轴均值</th>
                <th>Pearson r</th>
                <th>排除 缺失 / 不适用 / 两者</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>整体</th>
                <td>{{ value.stratified.overall.scatter?.n }}</td>
                <td>
                  {{ numberText(value.stratified.overall.scatter?.meanX) }}
                </td>
                <td>
                  {{ numberText(value.stratified.overall.scatter?.meanY) }}
                </td>
                <td>{{ numberText(value.stratified.overall.scatter?.r) }}</td>
                <td>
                  {{ value.stratified.overall.exclusions.missingOnly }} /
                  {{ value.stratified.overall.exclusions.notApplicableOnly }} /
                  {{ value.stratified.overall.exclusions.both }}
                </td>
              </tr>
              <tr v-for="stratum in value.stratified.strata" :key="stratum.key">
                <th>{{ label(stratum.key) }}</th>
                <td>{{ stratum.summary.scatter?.n }}</td>
                <td>{{ numberText(stratum.summary.scatter?.meanX) }}</td>
                <td>{{ numberText(stratum.summary.scatter?.meanY) }}</td>
                <td>{{ numberText(stratum.summary.scatter?.r) }}</td>
                <td>
                  {{ stratum.summary.exclusions.missingOnly }} /
                  {{ stratum.summary.exclusions.notApplicableOnly }} /
                  {{ stratum.summary.exclusions.both }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted">
          各层样本量更小；比例区间或相关变化都不能消除选择偏差与混杂，也不证明因果。散点相关不附二项区间。
        </p>
      </template>
      <details class="ds-details">
        <summary>查看数据与清洗版本</summary>
        <p class="ds-hash">数据 SHA256 {{ value.datasetSha256 }}</p>
        <p class="ds-hash">清洗配置 SHA256 {{ value.cleaningConfigSha256 }}</p>
      </details>
    </template>
  </section>
</template>
