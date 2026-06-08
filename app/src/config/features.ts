import type { HomeworkFeature } from "../types/domain";

export type MobileFeatureConfig = {
  feature: HomeworkFeature;
  title: string;
  subject: string;
  placeholder: string;
};

export const mobileFeatures: MobileFeatureConfig[] = [
  { feature: "photo_search", title: "拍照搜题", subject: "数学", placeholder: "输入或粘贴题目内容" },
  { feature: "ai_answer", title: "AI 问答", subject: "数学", placeholder: "输入你的问题" },
  { feature: "homework_review", title: "作业批改", subject: "数学", placeholder: "输入作业答案或批改要求" },
  { feature: "essay_correction", title: "作文批改", subject: "语文", placeholder: "输入作文内容" },
  { feature: "oral_practice", title: "口语练习", subject: "英语", placeholder: "输入要跟读的句子" },
  { feature: "word_lookup", title: "词典查询", subject: "英语", placeholder: "输入单词或词组" },
  { feature: "photo_translate", title: "拍照翻译", subject: "英语", placeholder: "输入或粘贴识别出的原文" },
  { feature: "mental_math_check", title: "口算检查", subject: "数学", placeholder: "输入口算题和答案" },
  { feature: "document_scan", title: "文档整理", subject: "语文", placeholder: "输入文档内容" },
  { feature: "recitation", title: "背诵助手", subject: "语文", placeholder: "输入背诵材料" },
  { feature: "course_recommend", title: "课程推荐", subject: "数学", placeholder: "输入学习目标" },
  { feature: "parent_report", title: "家长报告", subject: "综合", placeholder: "输入学习记录摘要" }
];

export function getMobileFeature(feature: HomeworkFeature) {
  return mobileFeatures.find((item) => item.feature === feature) || mobileFeatures[0];
}
