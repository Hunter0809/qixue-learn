import textbookKnowledge from "@/lib/generated-textbook-knowledge.json";

export type Stage = "primary" | "middle" | "high" | "university";

export type KnowledgeNode = {
  id: string;
  subject: string;
  name: string;
  aliases: string[];
  stage: Stage[];
  grade?: string;
  publisher?: string;
  textbook?: string;
  sourceUrl?: string;
};

const SUBJECTS = [
  "数学",
  "语文",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "政治",
  "科学",
  "道德与法治",
  "信息科技",
  "计算机类",
  "电子信息类",
  "机械类",
  "土木建筑类",
  "医学类",
  "经济管理类",
  "法学类",
  "外语类"
];

const NON_KNOWLEDGE_PATTERNS = [
  /建议|计划|任务|资源|课程|视频|讲义|练习|错因|总结|报告|答案|步骤|方法|用户|行为|点击|浏览|收藏|搜索/,
  /正确率|完成率|学习时长|连续学习|今日|本周|推荐/
];

const database = (textbookKnowledge.items || []) as KnowledgeNode[];

export function stageForGradeText(grade: string | undefined): Stage | null {
  if (!grade) return null;
  if (grade.includes("小学")) return "primary";
  if (grade.includes("初")) return "middle";
  if (grade.includes("高")) return "high";
  if (grade.includes("大学") || grade.includes("研究生")) return "university";
  return null;
}

export function normalizeSubject(subject: string) {
  const cleaned = subject.trim();
  return SUBJECTS.find((item) => cleaned.includes(item) || item.includes(cleaned)) || cleaned;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, "")
    .replace(/第[一二三四五六七八九十百\d]+[章节课单元]/g, "")
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "");
}

function isKnowledgeLike(value: string) {
  const cleaned = value.trim();
  if (cleaned.length < 2 || cleaned.length > 30) return false;
  if (NON_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(cleaned))) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(cleaned);
}

function subjectMatches(node: KnowledgeNode, subject: string) {
  return node.subject === subject || subject.includes(node.subject) || node.subject.includes(subject);
}

function stageMatches(node: KnowledgeNode, stage: Stage | null) {
  return !stage || node.stage.includes(stage);
}

function scoreNode(node: KnowledgeNode, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const names = [node.name, ...node.aliases].map(normalizeText).filter(Boolean);
  let lexicalScore = 0;
  for (const name of names) {
    if (name === normalizedQuery) lexicalScore = Math.max(lexicalScore, 12);
    else if (name.length >= 3 && normalizedQuery.includes(name)) lexicalScore = Math.max(lexicalScore, 8);
    else if (normalizedQuery.length >= 3 && name.includes(normalizedQuery)) {
      lexicalScore = Math.max(lexicalScore, 8);
    }
  }
  return lexicalScore;
}

export function canonicalizeKnowledge(rawKnowledge: string, rawSubject: string, rawGrade?: string) {
  const subject = normalizeSubject(rawSubject);
  const stage = stageForGradeText(rawGrade);
  const cleaned = rawKnowledge
    .replace(/^[\s:：\-—·]+/, "")
    .replace(new RegExp(`^(${SUBJECTS.join("|")})[\\s:：\\-—·]+`), "")
    .trim();

  if (!isKnowledgeLike(cleaned)) return null;
  const stageScoped = database.filter((node) => stageMatches(node, stage));
  const subjectScoped = subject && subject !== "综合"
    ? stageScoped.filter((node) => subjectMatches(node, subject))
    : stageScoped;
  const candidates = subjectScoped
    .map((node) => ({ node, score: scoreNode(node, cleaned) }))
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0]?.node;
  return best ? { subject: best.subject, knowledge: best.name, node: best } : null;
}

export function classifyKnowledgeFromText(text: string, subject: string, grade?: string) {
  const normalizedSubject = normalizeSubject(subject);
  const chunks = Array.from(new Set(
    text
      .split(/[,\n，。；;、：:\s]+/)
      .map((item) => item.trim())
      .filter(isKnowledgeLike)
  ));
  const matched = chunks
    .map((chunk) => canonicalizeKnowledge(chunk, normalizedSubject, grade))
    .filter((item): item is NonNullable<typeof item> => !!item);
  return Array.from(new Map(matched.map((item) => [item.knowledge, item])).values());
}

export function textbookKnowledgeStats() {
  const byStage = database.reduce<Record<string, number>>((acc, node) => {
    for (const stage of node.stage) acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  const bySubject = database.reduce<Record<string, number>>((acc, node) => {
    acc[node.subject] = (acc[node.subject] || 0) + 1;
    return acc;
  }, {});
  return { total: database.length, byStage, bySubject, updatedAt: textbookKnowledge.updatedAt };
}
