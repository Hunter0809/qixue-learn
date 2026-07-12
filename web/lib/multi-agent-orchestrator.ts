import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { resourceSchema } from "@/lib/schemas";
import type { LearnerProfile, Resource, ResourceAgentTrace, ResourceType } from "@/lib/types";

export type ResourceAgentSpec = {
  agentId: string;
  role: string;
  type: ResourceType;
  focus: string;
  titleHint: string;
};

const RESOURCE_AGENT_SPECS: ResourceAgentSpec[] = [
  { agentId: "course-lecturer", role: "课程讲解 Agent", type: "lecture", focus: "核心概念、定义、公式、易错点", titleHint: "专业课程讲解文档" },
  { agentId: "mind-map", role: "思维导图 Agent", type: "diagram", focus: "知识结构、前置关系、分支路径", titleHint: "知识点思维导图" },
  { agentId: "question-designer", role: "题库 Agent", type: "exercise", focus: "基础题、变式题、综合题和答案", titleHint: "分层练习题库" },
  { agentId: "reading-curator", role: "拓展阅读 Agent", type: "reading", focus: "相关背景、应用案例、可靠检索方向", titleHint: "拓展阅读材料" },
  { agentId: "video-director", role: "视频教学 Agent", type: "video", focus: "可录制的讲解脚本、镜头、旁白和字幕", titleHint: "多模态视频讲解脚本" },
  { agentId: "animation-designer", role: "动画设计 Agent", type: "animation", focus: "动画分镜、画面变化、交互提示和配音", titleHint: "知识点动画分镜方案" },
  { agentId: "code-practitioner", role: "代码实操 Agent", type: "code", focus: "可运行代码、输入输出、验证步骤和实践项目", titleHint: "代码实操案例" }
];

export function resourceAgentSpecs() {
  return RESOURCE_AGENT_SPECS.slice();
}

function artifactRules(spec: ResourceAgentSpec) {
  const rules: Record<ResourceType, string> = {
    lecture: "必须包含定义、关键规则或公式、课堂例题和易错点。",
    diagram: "必须用树状文本或 Mermaid 兼容结构表达节点、关系和学习顺序。",
    exercise: "必须包含至少 3 道不同难度题目、答案和解析，覆盖基础、变式、综合。",
    analogy: "必须用一个准确类比解释抽象概念，并指出类比的边界。",
    reading: "必须包含拓展阅读主题、背景、应用案例、阅读问题和可检索的资料方向，不能伪造具体来源。",
    video: "必须包含视频时长、分镜序号、画面、旁白、字幕、互动停顿和结尾练习。",
    animation: "必须包含动画时长、关键帧、元素变化、旁白/音效、学生操作提示和验收标准。",
    code: "必须包含实践目标、环境、完整可运行代码、输入输出示例、验证步骤、常见错误和拓展项目。"
  };
  return rules[spec.type];
}

function artifactHeadings(spec: ResourceAgentSpec) {
  const headings: Record<ResourceType, string> = {
    lecture: "## 课程讲解",
    diagram: "## 思维导图",
    exercise: "## 题库与解析",
    analogy: "## 类比解释",
    reading: "## 拓展阅读",
    video: "## 视频脚本\n## 分镜",
    animation: "## 动画分镜\n## 交互说明",
    code: "## 实操案例\n## 代码\n## 验证结果"
  };
  return headings[spec.type];
}
function resourcePrompt(spec: ResourceAgentSpec, subject: string, knowledge: string, profileText: string) {
  return [
    `${spec.role}：你是多智能体资源编排中的专职角色，只负责生成一种资源产物。`,
    `资源类型固定为 ${spec.type}，产物定位为：${spec.titleHint}。`,
    `学科固定为：${subject}；知识点固定为：${knowledge}。`,
    `用户画像：${profileText || "未提供，不能臆造学生信息"}。`,
    "必须结合用户的专业、地区、年级、目标、知识基础和学习偏好调整内容；没有证据的内容不要编造。",
    `本 Agent 的专职重点：${spec.focus}。${artifactRules(spec)}`,
    "返回 JSON 对象，字段为 id(string), title(string), type(string), subject(string), knowledge(string), difficulty(string), summary(string), content(string)。",
    "content 必须使用中文，并包含以下通用分节：## 知识点、## 核心解释、## 相关课程、## 例题（含答案）、## 练习题。",
    `content 还必须包含本角色专属分节：${artifactHeadings(spec)}；专属分节必须写入可直接学习或执行的具体产物，不得只写“见上文”。`,
    "content 必须是真实可学习的具体内容，不得返回模板、占位符或泛泛建议。",
    "必须只返回一个 JSON 对象，不要输出 Markdown 代码围栏或额外解释。"
  ].join("\n");
}

export async function generateResourceBundle(input: {
  knowledge: string;
  subject: string;
  profile?: LearnerProfile;
  profileText: string;
  request: unknown;
  signal?: AbortSignal;
}) {
  const traceMap = new Map<string, ResourceAgentTrace>();
  const resources = await Promise.all(RESOURCE_AGENT_SPECS.map(async (spec, index) => {
    const startedAt = Date.now();
    const generated = await askDeepSeekStreamCollect(
      resourcePrompt(spec, input.subject, input.knowledge, input.profileText),
      resourceSchema,
      {
        orchestration: { agentId: spec.agentId, role: spec.role, sequence: index + 1, total: RESOURCE_AGENT_SPECS.length },
        request: input.request,
        profile: input.profile,
        artifact: { type: spec.type, focus: spec.focus }
      },
      `resource_${spec.agentId}`,
      input.signal
    );
    traceMap.set(spec.agentId, {
      agentId: spec.agentId,
      role: spec.role,
      artifactType: spec.type,
      status: "completed",
      latencyMs: Date.now() - startedAt
    });
    const resource: Resource = {
      ...generated,
      id: `${spec.type}_${index + 1}_${input.knowledge}`,
      subject: input.subject,
      type: spec.type,
      knowledge: input.knowledge
    };
    return resource;
  }));

  return {
    resources,
    agents: RESOURCE_AGENT_SPECS.map((spec) => traceMap.get(spec.agentId) as ResourceAgentTrace)
  };
}


