import { routeJson } from "@/lib/api-route";
import { homeworkRequestSchema, homeworkResponseSchema } from "@/lib/schemas";
import { askAgentStreamCollect } from "@/lib/agent";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { runHomeworkAlgorithm } from "@/lib/homework-algorithms";
import { canonicalizeKnowledge, classifyKnowledgeFromText } from "@/lib/knowledge-catalog";
import { getCachedHomeworkResponse, setCachedHomeworkResponse } from "@/lib/homework-response-cache";
import { lookupStoredDictionary, type StoredDictionaryEntry } from "@/lib/server-db";

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

/**
 * 各功能对应的输出端卡片结构（sections 需按此处定义组织）
 */
const featureBlueprints: Record<string, { sections: { title: string; hint: string }[]; stepsTitle: string }> = {
  photo_search: {
    sections: [
      { title: "题干识别", hint: "完整提取题目文本、条件、问题" },
      { title: "答案结论", hint: "最终答案（数值/选项/结论）" },
      { title: "推导链路", hint: "分步推理过程" },
      { title: "同类变式", hint: "类似题目的变式训练建议" }
    ],
    stepsTitle: "解题步骤"
  },
  ai_answer: {
    sections: [
      { title: "直接结论", hint: "问题的直接答案或结论" },
      { title: "关键概念", hint: "解题涉及的核心概念定义" },
      { title: "推理依据", hint: "推导过程和逻辑依据" },
      { title: "追问方向", hint: "可以继续深入追问的方向" }
    ],
    stepsTitle: "推理依据"
  },
  homework_review: {
    sections: [
      { title: "批改统计", hint: "总题数、正确数、错误数、得分率" },
      { title: "逐题反馈", hint: "每道题的批改结果" },
      { title: "错因定位", hint: "每道错题的错误原因分析" },
      { title: "订正清单", hint: "需要订正的题目及正确解答" }
    ],
    stepsTitle: "错因定位"
  },
  essay_correction: {
    sections: [
      { title: "总体评分", hint: "总分、分项得分" },
      { title: "结构诊断", hint: "文章结构分析" },
      { title: "语句润色", hint: "具体语句修改建议" },
      { title: "范例改写", hint: "改写的范文示例" }
    ],
    stepsTitle: "修改顺序"
  },
  oral_practice: {
    sections: [
      { title: "发音表现", hint: "音标、重音、连读等评价" },
      { title: "节奏停顿", hint: "语调、停顿分析" },
      { title: "表达替换", hint: "更地道的表达方式" },
      { title: "跟读任务", hint: "需要反复练习的句子" }
    ],
    stepsTitle: "沟通建议"
  },
  word_lookup: {
    sections: [
      { title: "释义词性", hint: "词性和释义" },
      { title: "词形变化", hint: "时态、单复数等变化" },
      { title: "例句语境", hint: "在不同语境中的用法" },
      { title: "易混辨析", hint: "相近词辨析" }
    ],
    stepsTitle: ""
  },
  photo_translate: {
    sections: [
      { title: "原文识别", hint: "图片中的原文文字" },
      { title: "译文对照", hint: "逐句翻译对照" },
      { title: "语法拆解", hint: "重点语法结构分析" },
      { title: "表达替换", hint: "不同场景的表达替换" }
    ],
    stepsTitle: ""
  },
  mental_math_check: {
    sections: [
      { title: "正确率", hint: "正确率统计" },
      { title: "错题列表", hint: "错误题目及正确答案" },
      { title: "速算规律", hint: "可运用的速算技巧" },
      { title: "强化练习", hint: "有针对性的练习建议" }
    ],
    stepsTitle: "错因定位"
  },
  document_scan: {
    sections: [
      { title: "结构提纲", hint: "文档的层级结构" },
      { title: "重点摘要", hint: "关键内容摘要" },
      { title: "待办事项", hint: "提取的待办任务" },
      { title: "归档标签", hint: "建议的归档标签" }
    ],
    stepsTitle: "待办提取"
  },
  recitation: {
    sections: [
      { title: "分段材料", hint: "分段的背诵材料" },
      { title: "抽背题", hint: "遮词题目" },
      { title: "记忆提示", hint: "记忆技巧和联想方法" },
      { title: "复测安排", hint: "复习安排建议" }
    ],
    stepsTitle: "抽背顺序"
  },
  parent_report: {
    sections: [
      { title: "学习概况", hint: "总体学习情况" },
      { title: "风险提醒", hint: "薄弱点和退步警示" },
      { title: "沟通建议", hint: "与孩子的沟通策略" },
      { title: "下周计划", hint: "下周学习计划建议" }
    ],
    stepsTitle: "沟通建议"
  },
  course_recommend: {
    sections: [
      { title: "目标拆解", hint: "学习目标拆解" },
      { title: "资源排序", hint: "推荐资源排序" },
      { title: "练习路径", hint: "练习和学习路径" },
      { title: "复盘节点", hint: "复盘检查节点" }
    ],
    stepsTitle: "推理依据"
  }
};

function buildFeaturePrompt(feature: string): string {
  const bp = featureBlueprints[feature];
  if (!bp) return "";
  const sectionsDesc = bp.sections.map((s, i) =>
    `  ${i + 1}. "${s.title}"：${s.hint}`
  ).join("\n");
  return `\n【sections 输出要求】你必须输出且只输出以下 4 个分节卡片作为 sections 字段，每项包含 title(string) 和 items(string数组)，每个 items 数组至少包含一条实际内容：\n${sectionsDesc}`;
}

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = homeworkRequestSchema.parse(await request.json());

    if (body.feature === "word_lookup" && !body.forceAI) {
      const entries = lookupStoredDictionary(body.content, body.subject);
      if (entries.length) {
        return homeworkResponseSchema.parse({
          feature: body.feature,
          title: `${entries[0].term} 词典查询`,
          answer: dictionaryMarkdown(entries),
          sections: dictionarySections(entries),
          steps: [],
          knowledge: entries.map((entry) => `${body.subject} ${entry.term}`),
          similarPractice: [],
          nextAction: ""
        });
      }
      return homeworkResponseSchema.parse({
        feature: body.feature,
        title: "词典未查到",
        answer: `本地英语/汉语词典没有查到"${body.content.trim()}"。\n\n可以点击"未查到？询问 AI"继续调用智能体查询。`,
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
    const cached = getCachedHomeworkResponse(key, now);

    if (cached) return cached;

    const bp = featureBlueprints[body.feature];
    const sectionsPrompt = buildFeaturePrompt(body.feature);

    const taskPrompt = [
      "Homework Agent: 根据学生输入生成学习反馈。",
      "除 oral_practice、word_lookup、photo_translate 等语言需求相关板块中的例句、原文、译文、跟读文本外，其他所有自然语言内容必须使用中文。",
      "必须返回且只返回 JSON 对象，字段为 feature, title, answer, sections, steps, knowledge, similarPractice, nextAction。",
      'answer 字段必须保留清晰换行，可使用 Markdown 小标题和列表；拍照搜题的 answer 至少分为"题目识别""答案结论""关键思路"三段，不要把所有内容挤成一整段。',
      "sections 每项包含 title(string), items(string[])。",
      "similarPractice 每项包含 id, type('choice'|'blank'|'coding'|'short'), knowledge, difficulty('easy'|'medium'|'hard'), stem, options 可选。",
      "similarPractice 每项的 id 必须是字符串，不能是数字。",
      "知识点识别必须先按 request.profile.grade 判断学习层级（小学、初中、高中、大学），再限定在 request.subject 对应学科内，最后匹配具体知识点；不得返回其他学段或其他学科的知识点。",
      'knowledge 必须是具体、可复习的原子知识点数组，每项使用"学科 具体知识点"格式，具体知识点尽量是一个词或一个短术语，例如"物理 牛顿第二定律""数学 顶点式""英语 过去完成时"。不要返回"物理""力学""语法""函数"这类过宽标签，也不能写成句子、段落、学习建议或错因描述。',
      "不同 feature 的输出结构要贴合功能：拍照搜题突出识别、答案、步骤和相似题；批改突出错误定位和订正建议；词典突出释义、词形和例句；作文突出总评、结构、语言修改；口语突出发音、节奏和跟读任务；文档整理突出结构、待办和摘要。",
      "内容必须基于输入文本、算法分析和学习档案，不得编造用户没有提供的学习记录。",
      sectionsPrompt,
      bp ? `steps 字段用于存放"${bp.stepsTitle}"的详细内容。` : ""
    ].filter(Boolean).join("\n");

    // 有图片 → MIMO 多模态流式收集；纯文本 → DeepSeek 流式收集
    const generated = homeworkResponseSchema.parse(
      body.imageUrl
        ? await askAgentStreamCollect(taskPrompt, homeworkResponseSchema, { request: body, algorithm }, body.imageUrl)
        : await askDeepSeekStreamCollect(taskPrompt, homeworkResponseSchema, { request: body, algorithm })
    );
    const modelKnowledgeMatches = generated.knowledge.map((item) => canonicalizeKnowledge(item, body.subject, body.profile?.grade)).filter(Boolean);
    const behaviorMatches = body.feature === "photo_translate" || body.feature === "word_lookup" || body.feature === "oral_practice"
      ? []
      : classifyKnowledgeFromText(`${body.content}\n${algorithm.summary}\n${generated.answer}`, body.subject, body.profile?.grade);
    const catalogMatches = [
      ...modelKnowledgeMatches,
      ...behaviorMatches
    ];
    const normalizedKnowledge = Array.from(new Map(
      catalogMatches.map((item) => [`${item!.subject}:${item!.knowledge}`, `${item!.subject} ${item!.knowledge}`])
    ).values());
    const value = homeworkResponseSchema.parse({
      ...generated,
      knowledge: normalizedKnowledge
    });
    setCachedHomeworkResponse(key, value, now);
    return value;
  });
}
