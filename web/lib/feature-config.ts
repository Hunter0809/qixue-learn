import {
  BookMarked,
  Camera,
  CheckSquare,
  FilePenLine,
  FileScan,
  Languages,
  MessageCircleQuestion,
  Mic,
  Sigma,
  SpellCheck,
  UsersRound
} from "lucide-react";
import type { HomeworkFeature } from "@/lib/types";

export type FeatureConfig = {
  feature: HomeworkFeature;
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  subjectDefault: string;
  subjects: string[];
  placeholder: string;
  inputLabel: string;
  submitLabel: string;
  icon: typeof Camera;
  primary: boolean;
};

const allSubjects = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "综合"];

export const featureConfigs: FeatureConfig[] = [
  {
    feature: "photo_search",
    href: "/photo-search",
    label: "拍照搜题",
    eyebrow: "Photo Search",
    title: "拍照搜题",
    description: "",
    subjectDefault: "数学",
    subjects: allSubjects,
    placeholder: "上传或拍摄题目后会自动识别，也可以直接输入题目。",
    inputLabel: "题目内容",
    submitLabel: "开始搜题",
    icon: Camera,
    primary: true
  },
  {
    feature: "ai_answer",
    href: "/ai-answer",
    label: "智能答疑",
    eyebrow: "AI Tutor",
    title: "智能答疑",
    description: "",
    subjectDefault: "数学",
    subjects: allSubjects,
    placeholder: "输入你的问题，例如：为什么判别式小于 0 时没有实数根？",
    inputLabel: "学习问题",
    submitLabel: "开始答疑",
    icon: MessageCircleQuestion,
    primary: true
  },
  {
    feature: "homework_review",
    href: "/homework-review",
    label: "作业批改",
    eyebrow: "Homework Review",
    title: "作业批改",
    description: "",
    subjectDefault: "数学",
    subjects: allSubjects,
    placeholder: "粘贴作业题目与学生答案，逐题换行。",
    inputLabel: "作业与答案",
    submitLabel: "提交批改",
    icon: CheckSquare,
    primary: true
  },
  {
    feature: "essay_correction",
    href: "/essay-correction",
    label: "作文批改",
    eyebrow: "Essay Coach",
    title: "作文批改",
    description: "",
    subjectDefault: "语文",
    subjects: ["语文", "英语"],
    placeholder: "粘贴作文全文，或输入作文题目和草稿。",
    inputLabel: "作文内容",
    submitLabel: "批改作文",
    icon: FilePenLine,
    primary: false
  },
  {
    feature: "oral_practice",
    href: "/oral-practice",
    label: "口语练习",
    eyebrow: "Oral Practice",
    title: "口语练习",
    description: "",
    subjectDefault: "英语",
    subjects: ["英语", "语文"],
    placeholder: "输入口语练习文本，或点击语音录入。",
    inputLabel: "口语文本",
    submitLabel: "分析口语",
    icon: Mic,
    primary: false
  },
  {
    feature: "word_lookup",
    href: "/word-lookup",
    label: "词典查询",
    eyebrow: "Word Lookup",
    title: "词典查询",
    description: "",
    subjectDefault: "英语",
    subjects: ["英语", "语文"],
    placeholder: "输入单词、短语或句子。",
    inputLabel: "词句",
    submitLabel: "查询",
    icon: SpellCheck,
    primary: false
  },
  {
    feature: "photo_translate",
    href: "/photo-translate",
    label: "拍照翻译",
    eyebrow: "Photo Translate",
    title: "拍照翻译",
    description: "",
    subjectDefault: "英语",
    subjects: ["英语", "语文"],
    placeholder: "上传或拍摄外语文本后会自动识别，也可以直接输入文本。",
    inputLabel: "待翻译文本",
    submitLabel: "翻译",
    icon: Languages,
    primary: false
  },
  {
    feature: "mental_math_check",
    href: "/mental-math",
    label: "口算批改",
    eyebrow: "Mental Math",
    title: "口算批改",
    description: "",
    subjectDefault: "数学",
    subjects: ["数学"],
    placeholder: "例如：12×8=96；45+37=72；63÷7=8。",
    inputLabel: "口算记录",
    submitLabel: "批改口算",
    icon: Sigma,
    primary: false
  },
  {
    feature: "document_scan",
    href: "/document-scan",
    label: "文档扫描",
    eyebrow: "Document Scan",
    title: "文档扫描",
    description: "",
    subjectDefault: "综合",
    subjects: allSubjects,
    placeholder: "上传或拍摄文档后会自动识别，也可以粘贴文本。",
    inputLabel: "文档文本",
    submitLabel: "整理文档",
    icon: FileScan,
    primary: false
  },
  {
    feature: "recitation",
    href: "/recitation",
    label: "背诵助手",
    eyebrow: "Recitation",
    title: "背诵助手",
    description: "",
    subjectDefault: "语文",
    subjects: ["语文", "英语", "历史", "综合"],
    placeholder: "输入要背诵的课文、单词表或知识点。",
    inputLabel: "背诵材料",
    submitLabel: "生成抽背",
    icon: BookMarked,
    primary: false
  },
  {
    feature: "course_recommend",
    href: "/course-recommend",
    label: "课程推荐",
    eyebrow: "Course Plan",
    title: "课程推荐",
    description: "",
    subjectDefault: "数学",
    subjects: allSubjects,
    placeholder: "输入薄弱知识点、目标分数或最近错题情况。",
    inputLabel: "学习情况",
    submitLabel: "推荐课程",
    icon: BookMarked,
    primary: false
  },
  {
    feature: "parent_report",
    href: "/parent-report",
    label: "家长报告",
    eyebrow: "Parent Report",
    title: "家长报告",
    description: "",
    subjectDefault: "综合",
    subjects: allSubjects,
    placeholder: "输入本周完成情况、错题情况和课堂反馈。",
    inputLabel: "学习记录",
    submitLabel: "生成报告",
    icon: UsersRound,
    primary: false
  }
];

export function getFeatureConfig(feature: HomeworkFeature) {
  const config = featureConfigs.find((item) => item.feature === feature);
  if (!config) throw new Error(`Unknown feature: ${feature}`);
  return config;
}
