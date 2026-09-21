export const majorNames: Record<string, string> = { AI: 'AI · 人工智能', DATA_SCIENCE: 'DS · 数据科学', BUSINESS_ANALYTICS: 'BA · 商业分析' }
export function major(value: string | null) { return value ? majorNames[value] || value : '—' }
export function rate(value: number | null | undefined) { return value == null ? '—' : `${(value * 100).toFixed(1)}%` }
export function time(value: string | null | undefined) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
export function cell(row: object, key: string): string {
  const value: unknown = Reflect.get(row, key)
  if (value === null || value === undefined) return '—'
  if (key.endsWith('At')) return time(String(value))
  if (key === 'majorCode') return major(String(value))
  return String(value)
}
export const stageNames: Record<string, string> = {
  PROFILE_SUBMITTED: '提交信息收集', FIRST_EXPERIENCE_STARTED: '开始首次体验', FIRST_EXPERIENCE_CLOSED: '关闭首次体验', FIRST_REPORT_SURVEY_SUBMITTED: '提交首报告价值答卷', COMPARISON_REPORT_READY: '比较报告生成', COMPARISON_REPORT_VIEWED: '查看比较报告', TASK_STARTED: '开始任务',
  INTAKE_STARTED: '开始信息收集', INTAKE_SUBMITTED: '提交信息收集', REGISTERED: '完成注册', EMAIL_VERIFIED: '验证邮箱',
  RECOMMENDATION_VIEWED: '查看首次建议', FIRST_RUN_STARTED: '开始首次体验', FIRST_RUN_CLOSED: '关闭首次体验',
  FIRST_REPORT_READY: '首报告生成', FIRST_REPORT_VIEWED: '查看首报告', NEXT_RECOMMENDATION_VIEWED: '查看下一建议',
  SECOND_MAJOR_STARTED: '开始第二专业', SECOND_MAJOR_CLOSED: '关闭第二专业', COMPARISON_READY: '比较报告生成', COMPARISON_VIEWED: '查看比较报告'
}
const terms: Record<string,string> = {
  FIRST_FORMAL_RECOVERY_CHAIN_STARTED_AT:'首条正式体验恢复链最早开始时间',
  FIRST_VALUE:'首次价值',POST_REPORT_COMPARISON:'报告后比较',INTAKE_JOURNEY_THEN_UNIQUE_STUDENT:'匿名填写旅程；认领后按学生去重',UNIQUE_STUDENT:'学生去重',INTAKE_STARTED_AT:'信息收集开始时间',FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT:'首份逻辑体验报告首次就绪时间',FORMAL_TASK_STARTED_AT:'正式任务开始时间',
  RETAINED_RECORDS_AS_OF_NOT_HISTORICAL_RESTORE:'按截止时刻重算现存记录，不代表历史数据恢复。',CURRENT_EXCLUSIONS_APPLY_TO_ALL_AS_OF_VALUES:'当前排除标记适用于所有统计截止时刻。',STANDARD_MAJOR_ONLY:'产品指标仅包含正式专业体验。',OPTIONAL_RESEARCH_CONSENT_DOES_NOT_FILTER_OPERATIONAL_METRICS:'可选研究授权不影响必要运行统计的纳入。',OBSERVATIONS_USE_RECEIVED_AT_AND_MAY_BE_MISSING:'页面观察按服务端接收时间计算，可能存在缺失。',RATES_ARE_RATIOS_NOT_PERCENTAGES:'接口比率在此转为百分比，分子与分母同时保留。',NO_BASELINE_TARGET_OR_CAUSAL_INFERENCE:'没有真实基线或增长目标，不作因果推断。',SMALL_SAMPLES_MUST_BE_READ_WITH_COUNTS:'小样本需结合实际人数理解。',INTAKE_JOURNEYS_NOT_UNIQUE_VISITORS:'匿名阶段按填写旅程计数，不等于独立访客人数。',CLAIMED_STUDENT_COUNTED_ONCE:'认领后同一学生只计一次。',ORDERED_PATH_MISSING_OBSERVATION_IS_NOT_PROOF_OF_INACTION:'有序漏斗中的观察缺失不证明用户没有行动。',NARROWED_TO_STARTED_JOURNEYS_UNREGISTERED_CANNOT_BE_CLASSIFIED_BY_DOWNSTREAM_DIMENSIONS:'当前版本/专业筛选仅能归类已开始的旅程，未注册者不能按下游维度归类。',ORDERED_POST_REPORT_PATH_ONLY:'这里只统计报告之后的有序路径。',BEFORE_REPORT_EXPLORATION_REPORTED_SEPARATELY:'报告前的第二专业探索单独统计。',OBSERVATION_ABSENCE_IS_NOT_BUSINESS_FACT_ABSENCE:'页面观察缺失不等于业务事实不存在。',MANIFEST_STEP_ORDER:'按该固定任务版本的步骤顺序。',MISSING_VIEW_DOES_NOT_CANCEL_COMPLETION_FACT:'缺少查看观察不会取消已完成的业务事实。'
}
export function term(value:string){return terms[value] || value}
export function stage(value:string){return stageNames[value] || value.replace(/:VIEWED$/, ' · 查看').replace(/:COMPLETED$/, ' · 完成')}
