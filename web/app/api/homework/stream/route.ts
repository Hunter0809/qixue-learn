import { homeworkRequestSchema } from "@/lib/schemas";
import { streamAgent, type AgentContentPart, type AgentMessage } from "@/lib/agent";
import { streamDeepSeek } from "@/lib/agent-deepseek";
import { getCachedHomeworkResponse, setCachedHomeworkResponse } from "@/lib/homework-response-cache";
import { logAgentResponse, logModuleRequest } from "@/lib/server-logger";

/**
 * 各功能对应的输出端卡片结构
 */
const featureBlueprints: Record<string, { sections: string[]; sectionsHint: string }> = {
  photo_search: {
    sections: ["题干识别", "答案结论", "推导链路", "同类变式"],
    sectionsHint: "题干识别(提取题目条件)、答案结论(最终答案)、推导链路(分步推理)、同类变式(变式训练)"
  },
  ai_answer: {
    sections: ["直接结论", "关键概念", "推理依据", "追问方向"],
    sectionsHint: "直接结论(答案)、关键概念(核心概念定义)、推理依据(推导过程)、追问方向(可追问的问题)"
  },
  homework_review: {
    sections: ["批改统计", "逐题反馈", "错因定位", "订正清单"],
    sectionsHint: "批改统计(得分率)、逐题反馈(每题批改)、错因定位(错误原因)、订正清单(正确解答)"
  },
  essay_correction: {
    sections: ["总体评分", "结构诊断", "语句润色", "范例改写"],
    sectionsHint: "总体评分(总分分项)、结构诊断(文章结构)、语句润色(修改建议)、范例改写(范文)"
  },
  oral_practice: {
    sections: ["发音表现", "节奏停顿", "表达替换", "跟读任务"],
    sectionsHint: "发音表现(音标重音)、节奏停顿(语调停顿)、表达替换(地道表达)、跟读任务(练习句子)"
  },
  word_lookup: {
    sections: ["释义词性", "词形变化", "例句语境", "易混辨析"],
    sectionsHint: "释义词性(释义)、词形变化(时态单复数)、例句语境(用法)、易混辨析(相近词)"
  },
  photo_translate: {
    sections: ["原文识别", "译文对照", "语法拆解", "表达替换"],
    sectionsHint: "原文识别(原文文字)、译文对照(逐句翻译)、语法拆解(语法结构)、表达替换(替换表达)"
  },
  mental_math_check: {
    sections: ["正确率", "错题列表", "速算规律", "强化练习"],
    sectionsHint: "正确率(统计)、错题列表(错误题目)、速算规律(速算技巧)、强化练习(练习建议)"
  },
  document_scan: {
    sections: ["结构提纲", "重点摘要", "待办事项", "归档标签"],
    sectionsHint: "结构提纲(层级结构)、重点摘要(关键内容)、待办事项(待办任务)、归档标签(建议标签)"
  },
  recitation: {
    sections: ["分段材料", "抽背题", "记忆提示", "复测安排"],
    sectionsHint: "分段材料(分段)、抽背题(遮词题目)、记忆提示(记忆技巧)、复测安排(复习安排)"
  },
  parent_report: {
    sections: ["学习概况", "风险提醒", "沟通建议", "下周计划"],
    sectionsHint: "学习概况(总体情况)、风险提醒(薄弱点)、沟通建议(沟通策略)、下周计划(学习计划)"
  },
  course_recommend: {
    sections: ["目标拆解", "资源排序", "练习路径", "复盘节点"],
    sectionsHint: "目标拆解(目标)、资源排序(推荐资源)、练习路径(学习路径)、复盘节点(复盘检查)"
  }
};

function streamWithResponseLog(stream: ReadableStream<string>, module: string, cacheKey?: string) {
  const reader = stream.getReader();
  let accumulated = "";
  const writeResponseLog = (payload: unknown) => {
    void logAgentResponse(module, payload).catch((error) => {
      console.error(`Failed to write ${module} stream log`, error);
    });
  };
  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        if (cacheKey) void setCachedHomeworkResponse(cacheKey, accumulated);
        writeResponseLog({ raw: accumulated });
        return;
      }
      accumulated += value;
      controller.enqueue(value);
    },
    async cancel(reason) {
      writeResponseLog({ raw: accumulated, cancelled: true, reason: reason instanceof Error ? reason.message : String(reason || "") });
      await reader.cancel(reason);
    }
  });
}

export async function POST(request: Request) {
  const body = homeworkRequestSchema.parse(await request.json());
  const logModule = `homework_stream_${body.feature}`;
  await logModuleRequest(logModule, body);
  const cacheKey = body.imageUrl ? "" : `homework_stream:${JSON.stringify(body)}`;
  const cached = cacheKey ? await getCachedHomeworkResponse(cacheKey) : null;
  if (typeof cached === "string") {
    return new Response(cached, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }
  const bp = featureBlueprints[body.feature];

  const sys = [
    '你是个性化学习助手。根据学生输入生成详细的学习反馈。',
    '除口语练习、词典查询、拍照翻译等语言需求相关板块中的例句、原文、译文、跟读文本外，其他内容全部使用中文。',
    '回答中使用 LaTeX 格式的数学公式，用 $...$ 包裹行内公式，$$...$$ 包裹独立公式。如果涉及函数，给出函数表达式如 y = x^2。',
    '在回答末尾固定输出 3 个知识点，用 [知识点: 学科 具体知识点, 学科 具体知识点, 学科 具体知识点] 格式列出，不能多也不能少；每个知识点尽量是一个词或短术语，不能是句子或建议，例如 [知识点: 物理 牛顿第二定律, 数学 顶点式, 英语 过去完成时]；不要输出"物理""力学""语法"这类过宽标签。',
    '',
    '【回答结构要求】你的回答必须按以下分节组织，每节使用 ## 作为 Markdown 二级标题：',
    bp ? bp.sections.map((s, i) => `## ${i + 1}. ${s}\n${bp.sectionsHint.split(")、")[i] || ""}`).join("\n\n") : "",
    '',
    '在回答最后，用 --- 分隔线后输出且只输出一个 [知识点: ...] 列表，列表内固定 3 个具体知识点。'
  ].filter(Boolean).join("\n");

  const messages: AgentMessage[] = body.imageUrl
    ? [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: JSON.stringify(body) } as AgentContentPart,
            { type: "image_url", image_url: { url: body.imageUrl } } as AgentContentPart
          ]
        }
      ]
    : [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(body) }
      ];

  // 有图片 → MIMO 流式；纯文本 → DeepSeek 流式
  const stream = body.imageUrl
    ? await streamAgent(messages, request.signal)
    : await streamDeepSeek(messages as { role: "system" | "user"; content: string }[], request.signal);

  return new Response(streamWithResponseLog(stream, logModule, cacheKey || undefined), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
