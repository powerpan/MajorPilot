import type { MajorCode } from "../types";
export const majors: {
  code: MajorCode;
  short: string;
  name: string;
  chinese: string;
  question: string;
  quote: string;
  steps: [string, string][];
  outcome: string;
  description: string;
}[] = [
  {
    code: "AI",
    short: "AI",
    name: "Artificial Intelligence",
    chinese: "人工智能",
    question: "为什么它把这条求助分错了？",
    quote: "我已经看过示例，但还是不理解这一步。",
    steps: [
      ["检查错误", "分析模型可能的判断依据，找出错误原因。"],
      ["调整分类规则", "基于分析结果，提出改进建议。"],
    ],
    outcome: "模型错误分析与改进建议",
    description: "关注模型判断、错误模式与有限迭代。",
  },
  {
    code: "DATA_SCIENCE",
    short: "DS",
    name: "Data Science",
    chinese: "数据科学",
    question: "数据里，哪些证据值得相信？",
    quote: "课程完成率下降了，现有数据足够解释原因吗？",
    steps: [
      ["检查数据质量", "识别缺失、重复与不一致，说明处理依据。"],
      ["探索关系与限制", "比较学习行为与完成情况，不把相关当作因果。"],
    ],
    outcome: "一份可复核的数据分析摘要",
    description: "关注数据质量、关系分析与不确定性。",
  },
  {
    code: "BUSINESS_ANALYTICS",
    short: "BA",
    name: "Business Analytics",
    chinese: "商业分析",
    question: "哪个行动值得先验证？",
    quote: "完成率发生变化，我们应该优先解决什么？",
    steps: [
      ["拆解指标变化", "比较不同群体，明确值得优先关注的问题。"],
      ["提出可验证的行动", "说明行动依据、验证方式和后续观察指标。"],
    ],
    outcome: "有证据和验证计划的行动建议",
    description: "关注业务指标、优先问题与行动验证。",
  },
];
export function major(code: MajorCode | string | undefined) {
  return majors.find((item) => item.code === code) || majors[0]!;
}
