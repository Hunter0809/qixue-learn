import { routeJson } from "@/lib/api-route";
import { homeworkRequestSchema, homeworkResponseSchema } from "@/lib/schemas";
import { askAgentStreamCollect } from "@/lib/agent";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { runHomeworkAlgorithm } from "@/lib/homework-algorithms";
import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import { getCachedHomeworkResponse, setCachedHomeworkResponse } from "@/lib/homework-response-cache";
import { lookupStoredDictionary, type StoredDictionaryEntry } from "@/lib/server-db";
import { logModuleRequest } from "@/lib/server-logger";

function cleanDictionaryText(value: string) {
  return value
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n|\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function dictionaryListItems(value: string) {
  return cleanDictionaryText(value)
    .split(/\n+|;+/)
    .map((item) => item.replace(/^>\s*/, "").trim())
    .filter(Boolean);
}

function markdownList(title: string, items: string[]) {
  if (!items.length) return "";
  return [`**${title}：**`, ...items.map((item) => `- ${item}`)].join("\n");
}

function dictionaryMarkdown(entries: StoredDictionaryEntry[]) {
  return entries.map((entry) => {
    const translations = dictionaryListItems(entry.translation);
    const definitions = dictionaryListItems(entry.definition);
    const lines = [
      `### ${entry.term}${entry.phonetic ? ` /${entry.phonetic}/` : ""}`,
      markdownList("翻译", translations),
      markdownList("英文释义", definitions),
      markdownList("单词组合", entry.combinations.map(cleanDictionaryText).filter(Boolean)),
      markdownList("例句", entry.examples.map(cleanDictionaryText).filter(Boolean)),
      `**来源：** ${entry.source}`
    ].filter(Boolean);
    return lines.join("\n\n");
  }).join("\n\n");
}

function dictionarySections(entries: StoredDictionaryEntry[]) {
  const primary = entries[0];
  const translations = entries.flatMap((entry) => dictionaryListItems(entry.translation).map((item) => `${entry.term}：${item}`));
  const definitions = entries.flatMap((entry) => dictionaryListItems(entry.definition).map((item) => `${entry.term}：${item}`));
  return [
    { title: "翻译", items: translations.length ? translations : ["词典中暂无翻译"] },
    { title: "释义", items: definitions.length ? definitions : ["词典中暂无释义"] },
    { title: "单词组合", items: primary?.combinations.length ? primary.combinations.map(cleanDictionaryText) : ["词典中暂无固定组合"] },
    { title: "例句", items: primary?.examples.length ? primary.examples.map(cleanDictionaryText) : ["词典中暂无例句"] }
  ];
}

function isSpecificKnowledgeCandidate(value: string) {
  const cleaned = value.trim();
  if (cleaned.length < 2 || cleaned.length > 30) return false;
  const broad = new Set(["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "综合", "函数", "语法", "阅读", "写作", "练习", "题目", "答案"]);
  if (broad.has(cleaned)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(cleaned);
}

function stripSubjectPrefix(value: string, subject: string) {
  const normalizedSubject = normalizeSubject(subject);
  return value
    .replace(new RegExp(`^\\s*${normalizedSubject}\\s*[:：\\-—]*\\s*`), "")
    .replace(new RegExp(`^\\s*${subject}\\s*[:：\\-—]*\\s*`), "")
    .trim();
}

function addKnowledgeCandidate(map: Map<string, string>, raw: string, subject: string, grade?: string) {
  const canonical = canonicalizeKnowledge(raw, subject, grade);
  if (canonical) {
    const knowledge = canonical.knowledge.replace(/^[\s.\d、-]+/, "").trim();
    map.set(`${canonical.subject}:${knowledge}`, `${canonical.subject} ${knowledge}`);
    return;
  }
  const normalizedSubject = normalizeSubject(subject);
  const cleaned = stripSubjectPrefix(raw, normalizedSubject)
    .replace(/^[\s,，、;；.。:：-]+/, "")
    .trim();
  if (!isSpecificKnowledgeCandidate(cleaned)) return;
  map.set(`${normalizedSubject}:${cleaned}`, `${normalizedSubject} ${cleaned}`);
}

function ensureThreeKnowledgePoints(params: {
  subject: string;
  grade?: string;
  content: string;
  answer?: string;
  algorithmSummary?: string;
  knowledge?: string[];
  similarPractice?: { knowledge: string }[];
}) {
  const map = new Map<string, string>();
  (params.knowledge || []).forEach((item) => addKnowledgeCandidate(map, item, params.subject, params.grade));
  (params.similarPractice || []).forEach((item) => addKnowledgeCandidate(map, item.knowledge, params.subject, params.grade));
  const behaviorText = [params.content, params.algorithmSummary, params.answer].filter(Boolean).join("\n");
  classifyKnowledgeFromText(behaviorText, params.subject, params.grade).forEach((item) => {
    map.set(`${item.subject}:${item.knowledge}`, `${item.subject} ${item.knowledge}`);
  });
  const contentTerm = params.content.trim();
  if (map.size < 3 && contentTerm) {
    addKnowledgeCandidate(map, `${params.subject} ${contentTerm}`, params.subject, params.grade);
    addKnowledgeCandidate(map, `${params.subject} ${contentTerm} 释义`, params.subject, params.grade);
    addKnowledgeCandidate(map, `${params.subject} ${contentTerm} 例句`, params.subject, params.grade);
  }
  return Array.from(map.values()).slice(0, 3);
}

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = homeworkRequestSchema.parse(await request.json());
    const logModule = `homework_${body.feature}`;
    await logModuleRequest(logModule, body);

    if (body.feature === "word_lookup" && !body.forceAI) {
      const entries = await lookupStoredDictionary(body.content, body.subject);
      if (entries.length) {
        return homeworkResponseSchema.parse({
          feature: body.feature,
          title: `${entries[0].term} 词典查询`,
          answer: dictionaryMarkdown(entries),
          sections: dictionarySections(entries),
          steps: [],
          knowledge: ensureThreeKnowledgePoints({
            subject: body.subject,
            grade: body.profile?.grade,
            content: body.content,
            answer: dictionaryMarkdown(entries),
            knowledge: entries.flatMap((entry) => [
              `${body.subject} ${entry.term}`,
              `${body.subject} ${entry.term} 释义`,
              `${body.subject} ${entry.term} 例句`
            ])
          }),
          similarPractice: [],
          nextAction: ""
        });
      }
      return homeworkResponseSchema.parse({
        feature: body.feature,
        title: "词典未查到",
        answer: `本地英语/汉语词典没有查到“${body.content.trim()}”。\n\n可以点击“未查到？询问 AI”继续调用智能体查询。`,
        sections: [
          { title: "查询词", items: [body.content.trim()] },
          { title: "本地词典", items: ["未命中"] }
        ],
        steps: [],
        knowledge: [],
        similarPractice: [],
        nextAction: "ASK_AI_WORD_LOOKUP"
      });
    }

    const algorithm = runHomeworkAlgorithm(body);
    const key = JSON.stringify({ body, algorithm });
    const now = Date.now();
    const cached = await getCachedHomeworkResponse(key, now);

    if (cached) return cached;

    const taskPrompt = [
      "Homework Agent: 根据学生输入生成学习反馈。",
      "除 oral_practice、word_lookup、photo_translate 等语言需求相关板块中的例句、原文、译文、跟读文本外，其他所有自然语言内容必须使用中文。",
      "必须返回且只返回 JSON 对象，字段为 feature, title, answer, sections, steps, knowledge, similarPractice, nextAction。",
      'answer 字段必须保留清晰换行，可使用 Markdown 小标题和列表；拍照搜题的 answer 至少分为\u201C题目识别\u201D\u201C答案结论\u201D\u201C关键思路\u201D三段，不要把所有内容挤成一整段。',
      "sections 每项包含 title(string), items(string[])。",
      "similarPractice 每项包含 id, type('choice'|'blank'|'coding'|'short'), knowledge, difficulty('easy'|'medium'|'hard'), stem, options 可选。",
      "similarPractice 每项的 id 必须是字符串，不能是数字。",
      "知识点识别必须先按 request.profile.grade 判断学习层级（小学、初中、高中、大学），再限定在 request.subject 对应学科内，最后匹配具体知识点；不得返回其他学段或其他学科的知识点。",
      'knowledge 必须固定返回 3 个具体、可复习的原子知识点，不能多也不能少；每项使用\u201C学科 具体知识点\u201D格式，具体知识点尽量是一个词或一个短术语，例如\u201C物理 牛顿第二定律\u201D\u201C数学 顶点式\u201D\u201C英语 过去完成时\u201D。不要返回\u201C物理\u201D\u201C力学\u201D\u201C语法\u201D\u201C函数\u201D这类过宽标签，也不能写成句子、段落、学习建议或错因描述。',
      "不同 feature 的输出结构要贴合功能：拍照搜题突出识别、答案、步骤和相似题；批改突出错误定位和订正建议；词典突出释义、词形和例句；作文突出总评、结构、语言修改；口语突出发音、节奏和跟读任务；文档整理突出结构、待办和摘要。",
      "内容必须基于输入文本、算法分析和学习档案，不得编造用户没有提供的学习记录。"
    ].join("\n");

    // 有图片 → MIMO 多模态流式收集；纯文本 → DeepSeek 流式收集
    const generated = homeworkResponseSchema.parse(
      body.imageUrl
        ? await askAgentStreamCollect(taskPrompt, homeworkResponseSchema, { request: body, algorithm }, body.imageUrl, logModule, request.signal)
        : await askDeepSeekStreamCollect(taskPrompt, homeworkResponseSchema, { request: body, algorithm }, logModule, request.signal)
    );
    const normalizedKnowledge = ensureThreeKnowledgePoints({
      subject: body.subject,
      grade: body.profile?.grade,
      content: body.content,
      answer: generated.answer,
      algorithmSummary: algorithm.summary,
      knowledge: generated.knowledge,
      similarPractice: generated.similarPractice
    });
    const value = homeworkResponseSchema.parse({
      ...generated,
      knowledge: normalizedKnowledge
    });
    await setCachedHomeworkResponse(key, value, now);
    return value;
  });
}
