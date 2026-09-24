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
      ["先看例子，再找错例", "认识自动处理与人工复核，下载练习消息，找出一种值得改的错误。"],
      ["改一次，再比较", "调整一个设置，在同一批消息上比较效果与人工工作量。"],
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
      ["先看记录，再整理", "下载Excel，区分重复、空白和没开始，把关键结果与理由填回网站。"],
      ["比较之后，再问一句", "比较较早与较晚开始者，再按课程看看：这能说明原因吗？"],
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
      ["先算清是谁，再选重点", "先看比例小例子，再用Excel比较报名到完成的环节，选择先关注谁。"],
      ["先了解，或者试一个办法", "说清楚已知道什么、还要查什么，再决定怎么看办法有没有帮助。"],
    ],
    outcome: "有证据和验证计划的行动建议",
    description: "关注业务指标、优先问题与行动验证。",
  },
];
export function major(code: MajorCode | string | undefined) {
  return majors.find((item) => item.code === code) || majors[0]!;
}
