import { routeJson } from "@/lib/api-route";
import { homeworkRequestSchema, homeworkResponseSchema, homeworkTutorResponseSchema } from "@/lib/schemas";
import { askAgentStreamCollect } from "@/lib/agent";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { runHomeworkAlgorithm } from "@/lib/homework-algorithms";
import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import { getCachedHomeworkResponse, setCachedHomeworkResponse } from "@/lib/homework-response-cache";
import { lookupStoredDictionary, type StoredDictionaryEntry } from "@/lib/server-db";
import { logModuleRequest } from "@/lib/server-logger";
import { persistHomeworkOutcome } from "@/lib/learning-persistence";
import { z } from "zod";

const featureSectionTitles: Record<string, string[]> = {
  photo_search: ["题干识别", "答案结论", "推导链路", "同类变式"],
  ai_answer: ["直接结论", "关键概念", "推理依据", "追问方向"],
  homework_review: ["批改统计", "逐题反馈", "错因定位", "订正清单"],
  essay_correction: ["总体评分", "结构诊断", "语句润色", "范例改写"],
  oral_practice: ["发音表现", "节奏停顿", "表达替换", "跟读任务"],
  word_lookup: ["释义词性", "词形变化", "例句语境", "易混辨析"],
  photo_translate: ["原文识别", "译文对照", "语法拆解", "表达替换"],
  mental_math_check: ["正确率", "错题列表", "速算规律", "强化练习"],
  document_scan: ["结构提纲", "重点摘要", "待办事项", "归档标签"],
  recitation: ["分段材料", "抽背题", "记忆提示", "复测安排"],
  course_recommend: ["目标拆解", "资源排序", "练习路径", "复盘节点"],
  parent_report: ["学习概况", "风险提醒", "沟通建议", "下周计划"]
};

function answerSections(answer: string) {
  const sections: { title: string; items: string[] }[] = [];
  let current: { title: string; items: string[] } | null = null;
  answer.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].replace(/^\d+[.)、]\s*/, "").trim(), items: [] };
    } else if (current && line.trim()) {
      current.items.push(line.trim());
    }
  });
  if (current) sections.push(current);
  return sections.filter((section) => section.items.length);
}

function normalizeFeatureSections(feature: string, sections: { title: string; items: string[] }[] | undefined, answer: string, fallbackItems: string[][] = []) {
  const expected = featureSectionTitles[feature];
  if (!expected) return sections || [];
  const parsed = answerSections(answer);
  return expected.map((title, index) => {
    const source = parsed[index]?.items.length ? parsed[index] : sections?.[index];
    return { title, items: source?.items?.filter(Boolean) || fallbackItems[index] || [] };
  });
}
const dictionaryExamplesSchema = z.object({
  examples: z.array(z.string()).min(2).max(6)
});

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

async function withAgentExamples(entries: StoredDictionaryEntry[], subject: string, content: string) {
  const primary = entries[0];
  if (!primary || primary.examples.length) return entries;
  try {
    const generated = await askDeepSeekStreamCollect(
      [
        "Dictionary Example Agent: 根据词典查询结果生成自然、适合学生理解的例句。",
        "只返回 JSON，字段为 examples(string[])。",
        "英文词给英文例句；中文词给中文例句；必要时可附简短中文语境。",
        "例句必须围绕查询词本身，不要输出 Markdown。"
      ].join("\n"),
      dictionaryExamplesSchema,
      { subject, query: content, entry: primary },
      "word_lookup_examples"
    );
    return entries.map((entry, index) => index === 0 ? { ...entry, examples: generated.examples } : entry);
  } catch (error) {
    throw new Error("Dictionary example agent unavailable", { cause: error });
  }
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
  let next = value.trim();
  [normalizedSubject, subject].filter(Boolean).forEach((prefix) => {
    if (next.startsWith(prefix)) {
      next = next.slice(prefix.length).replace(/^\s*[:：\-—]*\s*/, "").trim();
    }
  });
  return next;

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
        const enrichedEntries = await withAgentExamples(entries, body.subject, body.content);
        entries.splice(0, entries.length, ...enrichedEntries);
        const value = homeworkResponseSchema.parse({
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
        await persistHomeworkOutcome(body, value);
        return value;
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
    const key = body.imageUrl ? "" : JSON.stringify({ body, algorithm });
    const now = Date.now();
    const cached = key ? await getCachedHomeworkResponse(key, now) : null;

    const requiresTutorArtifacts = body.feature !== "word_lookup" || body.forceAI === true;
    if (cached) {
      const cachedResult = requiresTutorArtifacts ? homeworkTutorResponseSchema.safeParse(cached) : homeworkResponseSchema.safeParse(cached);
      if (cachedResult.success) return cachedResult.data;
    }

    const taskPrompt = [
      "Homework Agent: 根据学生输入生成学习反馈。",
      "除 oral_practice、word_lookup、photo_translate 等语言需求相关板块中的例句、原文、译文、跟读文本外，其他所有自然语言内容必须使用中文。",
      "必须返回且只返回 JSON 对象，字段为 feature, title, answer, artifacts, sections, steps, knowledge, similarPractice, nextAction；artifacts 是必填对象，必须包含 diagram、videoScript、animationStoryboard。",
      "视觉请求必须输出紧凑 JSON，字段顺序优先为 feature,title,answer,artifacts,sections,steps,knowledge,similarPractice,nextAction；answer 不超过 700 字，sections 恰好 2 项且每项最多 2 条，steps 最多 4 条，similarPractice 最多 1 题，knowledge 恰好 3 项。",
      "artifacts 必须包含 diagram、videoScript、animationStoryboard 三个非空字符串：diagram 是可读的中文图解或 Mermaid/ASCII 结构（不超过 300 字）；videoScript 是 30-60 秒短视频讲解脚本（不超过 400 字）；animationStoryboard 是 3-4 个关键帧、含画面旁白交互提示的动画分镜（不超过 500 字）。三者都必须围绕本次输入，不能写占位符。",
      'answer 字段必须保留清晰换行，可使用 Markdown 小标题和列表；拍照搜题的 answer 至少分为\u201C题目识别\u201D\u201C答案结论\u201D\u201C关键思路\u201D三段，不要把所有内容挤成一整段。',
      "sections 每项包含 title(string), items(string[])。",
      "similarPractice 每项包含 id, type('choice'|'blank'|'coding'|'short'), knowledge, difficulty('easy'|'medium'|'hard'), stem, options 可选。",
      "similarPractice 每项的 id 必须是字符串，不能是数字。",
      "知识点识别必须先按 request.profile.grade 判断学习层级（小学、初中、高中、大学），再限定在 request.subject 对应学科内，最后匹配具体知识点；不得返回其他学段或其他学科的知识点。",
      'knowledge 必须固定返回 3 个具体、可复习的原子知识点，不能多也不能少；每项使用\u201C学科 具体知识点\u201D格式，具体知识点尽量是一个词或一个短术语，例如\u201C物理 牛顿第二定律\u201D\u201C数学 顶点式\u201D\u201C英语 过去完成时\u201D。不要返回\u201C物理\u201D\u201C力学\u201D\u201C语法\u201D\u201C函数\u201D这类过宽标签，也不能写成句子、段落、学习建议或错因描述。',
      "不同 feature 的输出结构要贴合功能：拍照搜题突出识别、答案、步骤和相似题；批改突出错误定位和订正建议；词典突出释义、词形和例句；作文突出总评、结构、语言修改；口语突出发音、节奏和跟读任务；文档整理突出结构、待办和摘要。",
      "内容必须基于输入文本、算法分析和学习档案，不得编造用户没有提供的学习记录。"
    ].join("\n");

    // 有图片 → MIMO 多模态流式收集；纯文本 → DeepSeek 流式收集；两条链路统一校验多模态产物
    const responseSchema = requiresTutorArtifacts ? homeworkTutorResponseSchema : homeworkResponseSchema;
    const agentContext = body.imageUrl ? { request: { ...body, imageUrl: undefined }, algorithm } : { request: body, algorithm };
    const generated = responseSchema.parse(
      body.imageUrl
        ? await askAgentStreamCollect(taskPrompt, responseSchema, agentContext, body.imageUrl, logModule, request.signal)
        : await askDeepSeekStreamCollect(taskPrompt, responseSchema, agentContext, logModule, request.signal)
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
    const value = responseSchema.parse({
      ...generated,
      sections: normalizeFeatureSections(body.feature, generated.sections, generated.answer, [[], [], generated.steps || [], generated.similarPractice?.map((question) => question.stem).filter(Boolean) || []]),
      knowledge: normalizedKnowledge
    });
    await persistHomeworkOutcome(body, value);
    if (key) await setCachedHomeworkResponse(key, value, now);
    return value;
  });
}







