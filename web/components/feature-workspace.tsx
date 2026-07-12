"use client";

import { type ChangeEvent, FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRMutation from "swr/mutation";
import {
  Camera,
  CheckCircle2,
  Eye,
  ImageUp,
  ListChecks,
  Mic,
  Search,
  Send,
  Sparkles,
  Target,
  VideoOff
} from "lucide-react";
import { postJson } from "@/lib/fetcher";
import { emitServiceWarning } from "@/lib/client-warning";
import type { HomeworkFeature, HomeworkJobAccepted, HomeworkRequest, HomeworkResponse } from "@/lib/types";
import { getFeatureConfig } from "@/lib/feature-config";
import { getLearnerProfile, loadCurrentUsername, saveLearningHistory } from "@/lib/profile-storage";
import { useLearningStore, addWeakPoint, getWeakPoints, type WeakPoint } from "@/lib/store";
import { getCachedResources } from "@/lib/resource-cache";
import { ImageCropSelector } from "@/components/image-crop-selector";
import { ErrorBlock } from "@/components/status";
import { MarkdownRenderer } from "@/components/markdown-renderer";

type LayoutMode = "scan" | "dialog" | "review" | "essay" | "dictionary" | "oral" | "study";
type SpeechRecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getLayoutMode(feature: HomeworkFeature): LayoutMode {
  if (feature === "photo_search" || feature === "photo_translate" || feature === "document_scan") return "scan";
  if (feature === "ai_answer") return "dialog";
  if (feature === "word_lookup") return "dictionary";
  if (feature === "oral_practice") return "oral";
  if (feature === "essay_correction" || feature === "parent_report") return "essay";
  if (feature === "homework_review" || feature === "mental_math_check") return "review";
  return "study";
}

function modeTitle(mode: LayoutMode) {
  const labels: Record<LayoutMode, string> = {
    scan: "采集",
    dialog: "提问",
    review: "批改",
    essay: "文本",
    dictionary: "查询",
    oral: "朗读",
    study: "规划"
  };
  return labels[mode];
}

function KnowledgePillWithTracking({ item, isTracked, onClick }: { item: string; isTracked: boolean; onClick: (k: string) => void }) {
  return (
    <span className={`knowledge-pill pill${isTracked ? " tracked" : ""}`} onClick={() => onClick(item)} title={isTracked ? "已追踪" : "点击追踪为薄弱点"}>
      {item}{isTracked ? " ✓" : ""}
    </span>
  );
}

function ResultCard({ title, children, filled = false }: { title: string; children: ReactNode; filled?: boolean }) {
  return (
    <section className={`result-card${filled ? " filled" : ""}`}>
      <div className="result-card-head">
        <CheckCircle2 size={16} />
        <h4>{title}</h4>
      </div>
      <div className="result-card-body">{children}</div>
    </section>
  );
}

function emptyBlueprint(feature: HomeworkFeature): { title: string; cards: string[]; tone: string } {
  const map: Partial<Record<HomeworkFeature, { title: string; cards: string[]; tone: string }>> = {
    photo_search: { title: "拍照搜题结果", cards: ["题干识别", "答案结论", "推导链路", "同类变式"], tone: "scan" },
    ai_answer: { title: "智能答疑结果", cards: ["直接结论", "关键概念", "推理依据", "追问方向"], tone: "dialog" },
    homework_review: { title: "作业批改结果", cards: ["批改统计", "逐题反馈", "错因定位", "订正清单"], tone: "review" },
    essay_correction: { title: "作文批改结果", cards: ["总体评分", "结构诊断", "语句润色", "范例改写"], tone: "essay" },
    oral_practice: { title: "口语练习结果", cards: ["发音表现", "节奏停顿", "表达替换", "跟读任务"], tone: "oral" },
    word_lookup: { title: "词典查询结果", cards: ["释义词性", "词形变化", "例句语境", "易混辨析"], tone: "dictionary" },
    photo_translate: { title: "拍照翻译结果", cards: ["原文识别", "译文对照", "语法拆解", "表达替换"], tone: "translate" },
    mental_math_check: { title: "口算批改结果", cards: ["正确率", "错题列表", "速算规律", "强化练习"], tone: "review" },
    document_scan: { title: "文档整理结果", cards: ["结构提纲", "重点摘要", "待办事项", "归档标签"], tone: "organize" },
    recitation: { title: "背诵助手结果", cards: ["分段材料", "抽背题", "记忆提示", "复测安排"], tone: "recitation" },
    parent_report: { title: "家长报告结果", cards: ["学习概况", "风险提醒", "沟通建议", "下周计划"], tone: "report" }
  };
  return map[feature] || { title: "课程推荐结果", cards: ["目标拆解", "资源排序", "练习路径", "复盘节点"], tone: "study" };
}

function normalizeCardTitle(value: string) {
  return value.replace(/^\s*\d+[.)、]\s*/, "").replace(/\s+/g, "").trim();
}

function stripKnowledgeFooter(text: string) {
  return text.replace(/\n---[\s\S]*?\[知识点[:：][\s\S]*?\]\s*$/u, "").trim();
}

function parseMarkdownSections(text: string): { title: string; body: string }[] {
  const lines = stripKnowledgeFooter(text).replace(/\r\n/g, "\n").split("\n");
  const sections: { title: string; body: string }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() });
      current = { title: normalizeCardTitle(heading[1]), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push({ title: current.title, body: current.body.join("\n").trim() });
  return sections.filter((section) => section.body);
}

function findSectionText(
  cardTitle: string,
  dataSections: { title: string; items: string[] }[] | undefined
) {
  const normalized = normalizeCardTitle(cardTitle);
  const dataSection = dataSections?.find((section) => {
    const sectionTitle = normalizeCardTitle(section.title);
    return sectionTitle.includes(normalized) || normalized.includes(sectionTitle);
  });
  return dataSection?.items.length ? dataSection.items.join("\n\n") : "";
}

function EmptyResultCards({ mode, feature, isLoading }: { mode: LayoutMode; feature: HomeworkFeature; isLoading: boolean }) {
  const lead = isLoading ? "AI 正在生成，会把结果写入下方卡片。" : "提交内容后，AI 会把结果写入下方卡片。";
  const blueprint = emptyBlueprint(feature);
  return (
    <div className={`feature-result result-${mode} output-blueprint output-blueprint-${blueprint.tone}`}>
      <ResultCard title={blueprint.title}>
        <p className="muted">{lead}</p>
      </ResultCard>
      <div className="result-sections blueprint-cards">
        {blueprint.cards.map((title, index) => (
          <ResultCard title={title} key={title}>
            <p className="muted">{isLoading ? "智能体正在填充。" : index === 0 ? "提交后优先生成。" : "随结果自动补全。"}</p>
          </ResultCard>
        ))}
      </div>
    </div>
  );
}

function KnowledgeTags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="subject-row">{items.map((item) => <span className="pill" key={item}>{item}</span>)}</div>;
}

function SectionCards({ sections }: { sections?: { title: string; items: string[] }[] }) {
  if (!sections?.length) return null;
  return (
    <div className="result-sections">
      {sections.map((section) => (
        <ResultCard title={section.title} filled key={section.title}>
          <ul>
            {section.items.map((item) => <li key={item}><MarkdownRenderer text={item} /></li>)}
          </ul>
        </ResultCard>
      ))}
    </div>
  );
}

function cleanOrderedStep(step: string) {
  return step.replace(/^\s*(?:(?:\d+(?:\.\d+)*)|[一二三四五六七八九十]+)[.)、．]\s*/, "").trim();
}

function OrderedSteps({ steps }: { steps?: string[] }) {
  if (!steps?.length) return null;
  return <ol className="step-list">{steps.map((step, index) => <li key={index}>{cleanOrderedStep(step)}</li>)}</ol>;
}

function FormattedAnswer({ text, boldAsSubheading = false }: { text: string; boldAsSubheading?: boolean }) {
  return <MarkdownRenderer text={text} boldAsSubheading={boldAsSubheading} />;
}

function parseFollowUpItems(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);
}

function FollowUpActions({ text, onFollowUp }: { text: string; onFollowUp?: (question: string) => void }) {
  const items = parseFollowUpItems(text);
  if (!items.length || !onFollowUp) return <FormattedAnswer text={text} />;
  return (
    <div className="follow-up-actions">
      {items.map((item) => (
        <button className="button secondary small follow-up-action" key={item} onClick={() => onFollowUp(item)} type="button">
          {item}
        </button>
      ))}
    </div>
  );
}

function persistBehaviorFromClient(request: HomeworkRequest, knowledge: string, correct: boolean) {
  void fetch("/api/behavior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: loadCurrentUsername() || undefined,
      subject: request.subject,
      knowledge,
      source: request.feature,
      correct,
      profile: getLearnerProfile()
    })
  }).catch(() => undefined);
}

function BlueprintResultBody({ data, feature, onFollowUp }: { data: HomeworkResponse; feature: HomeworkFeature; onFollowUp?: (question: string) => void }) {
  const blueprint = emptyBlueprint(feature);
  const answerSections = parseMarkdownSections(data.answer);
  const boldAsSubheading = feature === "photo_search";
  return (
    <>
      {blueprint.cards.map((title, index) => {
        const sectionText = findSectionText(title, data.sections);
        const text = sectionText || (index === 0 ? data.answer : "");
        return (
          <ResultCard title={title} filled={Boolean(text)} key={title}>
            {text
              ? feature === "ai_answer" && title === "追问方向"
                ? <FollowUpActions text={text} onFollowUp={onFollowUp} />
                : <FormattedAnswer text={text} boldAsSubheading={boldAsSubheading} />
              : <p className="muted">暂无内容</p>}
          </ResultCard>
        );
      })}
      {data.knowledge?.length ? (
        <ResultCard title="涉及知识点" filled>
          <KnowledgeTags items={data.knowledge} />
        </ResultCard>
      ) : null}
      <PracticeList data={data} />
    </>
  );
}

function PracticeList({ data }: { data: HomeworkResponse }) {
  if (!data.similarPractice?.length) return null;
  return (
    <ResultCard title="相似练习" filled>
      <div className="list">
        {data.similarPractice.map((question) => (
          <div className="inline-panel" key={question.id}>
            <span className="pill"><ListChecks size={13} /> {question.knowledge} · {question.difficulty}</span>
            <MarkdownRenderer text={question.stem} />
            {question.options?.length ? <ul>{question.options.map((opt, i) => <li key={i}><MarkdownRenderer text={opt} /></li>)}</ul> : null}
          </div>
        ))}
      </div>
    </ResultCard>
  );
}

function FeatureResultBody({ data, feature, onFollowUp }: { data: HomeworkResponse; feature: HomeworkFeature; onFollowUp?: (question: string) => void }) {
  if ((["ai_answer", "photo_search", "photo_translate"] as HomeworkFeature[]).includes(feature)) {
    return <BlueprintResultBody data={data} feature={feature} onFollowUp={onFollowUp} />;
  }

  if (feature === "ai_answer") {
    return (
      <>
        <ResultCard title={data.sections?.[0]?.title || "直接结论"} filled>
          <FormattedAnswer text={data.answer} />
        </ResultCard>
        {data.sections?.slice(1).map((section) => (
          <ResultCard title={section.title} filled key={section.title}>
            {section.items.map((item, i) => (
              <div key={i} className="result-card-list"><FormattedAnswer text={item} /></div>
            ))}
          </ResultCard>
        ))}
        {data.knowledge?.length ? (
          <ResultCard title="涉及知识点" filled>
            <KnowledgeTags items={data.knowledge} />
          </ResultCard>
        ) : null}
      </>
    );
  }

  if (feature === "photo_search") {
    return (
      <>
        <ResultCard title="识别与答案" filled><FormattedAnswer text={data.answer} /></ResultCard>
        {data.steps?.length ? <ResultCard title="解题步骤" filled><OrderedSteps steps={data.steps} /></ResultCard> : null}
        <ResultCard title="涉及知识点" filled><KnowledgeTags items={data.knowledge} /></ResultCard>
        <PracticeList data={data} />
      </>
    );
  }

  if (feature === "homework_review" || feature === "mental_math_check") {
    return (
      <>
        <ResultCard title="批改结论" filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        {data.steps?.length ? <ResultCard title="错因定位" filled><OrderedSteps steps={data.steps} /></ResultCard> : null}
        <PracticeList data={data} />
      </>
    );
  }

  if (feature === "word_lookup") {
    return (
      <>
        <ResultCard title="释义与词性" filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        <ResultCard title="可复习词条" filled><KnowledgeTags items={data.knowledge} /></ResultCard>
      </>
    );
  }

  if (feature === "essay_correction" || feature === "parent_report") {
    return (
      <>
        <ResultCard title={feature === "essay_correction" ? "作文总评" : "学习概览"} filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        {data.steps?.length ? <ResultCard title={feature === "essay_correction" ? "修改顺序" : "沟通建议"} filled><OrderedSteps steps={data.steps} /></ResultCard> : null}
      </>
    );
  }

  if (feature === "oral_practice") {
    return (
      <>
        <ResultCard title="口语表现" filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        <ResultCard title="跟读任务" filled><p><Target size={15} /> {data.nextAction}</p></ResultCard>
      </>
    );
  }

  if (feature === "photo_translate") {
    return (
      <>
        <ResultCard title="原文识别与译文" filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        <ResultCard title="语言点" filled><KnowledgeTags items={data.knowledge} /></ResultCard>
      </>
    );
  }

  if (feature === "document_scan" || feature === "recitation") {
    return (
      <>
        <ResultCard title={feature === "document_scan" ? "文档结构" : "背诵材料"} filled><FormattedAnswer text={data.answer} /></ResultCard>
        <SectionCards sections={data.sections} />
        {data.steps?.length ? <ResultCard title={feature === "document_scan" ? "待办提取" : "抽背顺序"} filled><OrderedSteps steps={data.steps} /></ResultCard> : null}
      </>
    );
  }

  return (
    <>
      <ResultCard title="答复" filled><FormattedAnswer text={data.answer} /></ResultCard>
      <SectionCards sections={data.sections} />
      {data.steps?.length ? <ResultCard title="推理依据" filled><OrderedSteps steps={data.steps} /></ResultCard> : null}
      <ResultCard title="下一步" filled><p><Target size={15} /> {data.nextAction}</p></ResultCard>
    </>
  );
}

function TutorArtifactCards({ artifacts }: { artifacts?: HomeworkResponse["artifacts"] }) {
  if (!artifacts) return null;
  const cards = [
    { title: "图解说明", content: artifacts.diagram },
    { title: "短视频讲解脚本", content: artifacts.videoScript },
    { title: "动画分镜与交互", content: artifacts.animationStoryboard }
  ];
  return (
    <div className="result-sections tutor-artifact-grid">
      {cards.map((card) => (
        <ResultCard title={card.title} filled key={card.title}>
          <MarkdownRenderer text={card.content} boldAsSubheading />
        </ResultCard>
      ))}
    </div>
  );
}
function ResultPanel({
  data,
  mode,
  feature,
  isLoading,
  onAskAIWordLookup,
  onFollowUp
}: {
  data?: HomeworkResponse;
  mode: LayoutMode;
  feature: HomeworkFeature;
  isLoading: boolean;
  onAskAIWordLookup?: () => void;
  onFollowUp?: (question: string) => void;
}) {
  if (!data) {
    return <EmptyResultCards mode={mode} feature={feature} isLoading={isLoading} />;
  }

  return (
    <div className={`feature-result result-${mode}`}>
      <div className="result-summary-head">
        <div>
          <span className="pill"><Sparkles size={13} /> AI 结果</span>
          <h3>{data.title}</h3>
        </div>
      </div>
      <div className={`answer-content output-layout output-layout-${feature}`}>
        <FeatureResultBody data={data} feature={feature} onFollowUp={onFollowUp} />
        <TutorArtifactCards artifacts={data.artifacts} />
      </div>
    </div>
  );
}


function PracticeQuestion({ question, subject, feature }: { question: { id: string; knowledge: string; difficulty: string; stem: string; options?: string[] | null }; subject: string; feature: string }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function checkAnswer() {
    if (!answer.trim()) return;
    const isCorrect = result === null ? false : result === "correct";
    // Simple heuristic: if user entered something, ask agent to judge
    // For now, mark as answered
    const correct = answer.trim().length > 0 && question.options?.length
      ? question.options.some((opt) => opt.toLowerCase().startsWith(answer.trim().toLowerCase()))
      : answer.trim().length > 2;
    setResult(correct ? "correct" : "wrong");
    setSubmitted(true);
    addWeakPoint(question.knowledge || subject, subject, "practice", correct);
    void fetch("/api/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: loadCurrentUsername() || undefined,
        subject,
        knowledge: question.knowledge || subject,
        source: "practice",
        correct,
        profile: getLearnerProfile()
      })
    }).catch(() => undefined);
  }

  return (
    <div className="inline-panel">
      <span className="pill">{question.knowledge} \u00b7 {question.difficulty}</span>
      <MarkdownRenderer text={question.stem} />
      {question.options?.length ? (
        <ul>{question.options.map((opt, i) => <li key={i}><MarkdownRenderer text={opt} /></li>)}</ul>
      ) : null}
      <div className="practice-input-row">
        <input className="input" placeholder="\u8f93\u5165\u7b54\u6848..." value={answer} onChange={(e) => { setAnswer(e.target.value); setResult(null); }} onKeyDown={(e) => e.key === "Enter" && checkAnswer()} />
        <button className="button secondary" onClick={checkAnswer} type="button">\u786e\u8ba4</button>
        {submitted && result ? <span className={`practice-result ${result}`}>{result === "correct" ? "\u2713 \u6b63\u786e" : "\u2717 \u9519\u8bef"}</span> : null}
      </div>
    </div>
  );
}




const MAX_VISION_IMAGE_EDGE = 1024;
const MIN_VISION_IMAGE_EDGE = 640;
const VISION_IMAGE_QUALITY = 0.62;
const MIN_VISION_IMAGE_QUALITY = 0.34;
const MAX_VISION_IMAGE_DATA_URL_LENGTH = 900_000;

function drawScaledCanvas(canvas: HTMLCanvasElement, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));
  const context = output.getContext("2d");
  if (!context) return canvas;
  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}

function canvasToCompressedDataUrl(canvas: HTMLCanvasElement) {
  let maxEdge = MAX_VISION_IMAGE_EDGE;
  let quality = VISION_IMAGE_QUALITY;
  let output = drawScaledCanvas(canvas, maxEdge);
  let dataUrl = output.toDataURL("image/jpeg", quality);

  while (
    dataUrl.length > MAX_VISION_IMAGE_DATA_URL_LENGTH &&
    (quality > MIN_VISION_IMAGE_QUALITY || maxEdge > MIN_VISION_IMAGE_EDGE)
  ) {
    if (quality > MIN_VISION_IMAGE_QUALITY) {
      quality = Math.max(MIN_VISION_IMAGE_QUALITY, quality - 0.12);
    } else {
      maxEdge = Math.max(MIN_VISION_IMAGE_EDGE, Math.round(maxEdge * 0.82));
      output = drawScaledCanvas(canvas, maxEdge);
    }
    dataUrl = output.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
}

function fileToCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    };
    const timer = window.setTimeout(() => {
      if (typeof reader.result === "string") finish(reader.result);
      else fail(new Error("Image processing timed out"));
    }, 5000);
    reader.onerror = () => fail(reader.error || new Error("Image file could not be read"));
    reader.onload = () => {
      const raw = reader.result;
      if (typeof raw !== "string") {
        fail(new Error("Image file could not be decoded"));
        return;
      }
      const image = new Image();
      image.onerror = () => finish(raw);
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            finish(raw);
            return;
          }
          context.drawImage(image, 0, 0);
          finish(canvasToCompressedDataUrl(canvas));
        } catch {
          finish(raw);
        }
      };
      image.src = raw;
    };
    reader.readAsDataURL(file);
  });
}
export function FeatureWorkspace({ feature }: { feature: HomeworkFeature }) {
  const config = getFeatureConfig(feature);
  const mode = getLayoutMode(config.feature);
  const router = useRouter();
  const storeSnapshot = useLearningStore((s) => s.getWorkspaceState(feature));
  const setStoreState = useLearningStore((s) => s.setWorkspaceState);
  const [subject, setSubject] = useState(storeSnapshot.subject || config.subjectDefault);
  const [content, setContent] = useState(storeSnapshot.content || "");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [weakPointTick, setWeakPointTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const storeWeakPoints = getWeakPoints();
  const [pendingRequest, setPendingRequest] = useState<HomeworkRequest | null>(storeSnapshot.pendingRequest || null);
  const [imageUrl, setImageUrl] = useState<string | null>(storeSnapshot.imageUrl || null);
  const [imagePreview, setImagePreview] = useState<string | null>(storeSnapshot.imagePreview || null);
  const [processingImage, setProcessingImage] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [processingSeconds, setProcessingSeconds] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionConstructor> | null>(null);
  const dictationBaseRef = useRef("");
  const dictationFinalRef = useRef("");
  const canScan = mode === "scan";
  const canDictate = mode === "oral" || mode === "dialog";
  const showDictationOnly = mode === "oral" && canDictate && (voiceListening || Boolean(liveTranscript));
  const autoSubmitImage = config.feature === "photo_search" || config.feature === "photo_translate";

  const { trigger, data, error, isMutating } = useSWRMutation(
    `/api/homework/${config.feature}`,
    (_url: string, { arg }: { arg: HomeworkRequest }) => postJson<HomeworkResponse | HomeworkJobAccepted, HomeworkRequest>("/api/homework", arg)
  );

  useEffect(() => setHydrated(true), []);

  const displayData: HomeworkResponse | undefined = data && "jobId" in data ? storeSnapshot.data : (data || storeSnapshot.data);
  const effectiveMutating = isMutating || storeSnapshot.isMutating;
  const hasSubmittableInput = Boolean(content.trim() || imageUrl);

  useEffect(() => {
    const nextSnapshot = useLearningStore.getState().getWorkspaceState(feature);
    setSubject(nextSnapshot.subject || config.subjectDefault);
    setContent(nextSnapshot.content || "");
    setPendingRequest(nextSnapshot.pendingRequest || null);
    setImageUrl(nextSnapshot.imageUrl || null);
    setImagePreview(nextSnapshot.imagePreview || null);
    setLiveTranscript("");
    setVoiceStatus("");
    setVoiceListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, [feature, config.subjectDefault]);

  useEffect(() => {
    setSubject(storeSnapshot.subject || config.subjectDefault);
    setContent(storeSnapshot.content || "");
    setPendingRequest(storeSnapshot.pendingRequest || null);
    setImageUrl(storeSnapshot.imageUrl || null);
    setImagePreview(storeSnapshot.imagePreview || null);
  }, [
    config.subjectDefault,
    storeSnapshot.content,
    storeSnapshot.imagePreview,
    storeSnapshot.imageUrl,
    storeSnapshot.pendingRequest,
    storeSnapshot.subject
  ]);

  useEffect(() => {
    if (!effectiveMutating) {
      setProcessingSeconds(0);
      return;
    }
    setProcessingSeconds(Math.floor((Date.now() - (storeSnapshot.startedAt || Date.now())) / 1000));
    const timer = window.setInterval(() => {
      setProcessingSeconds(Math.floor((Date.now() - (storeSnapshot.startedAt || Date.now())) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [effectiveMutating, storeSnapshot.startedAt]);

  function handleHomeworkResponse(request: HomeworkRequest, response: HomeworkResponse, workspaceFeature: HomeworkFeature) {
    const record = saveLearningHistory(request, response);
    setLastSaved(record ? "已保存到个人历史" : null);
    setStoreState(workspaceFeature, {
      data: response,
      content: request.content === "请识别并分析图片内容" || request.content === "Please identify and solve the problem in the image." ? content : request.content,
      subject: request.subject,
      isMutating: false,
      error: undefined,
      pendingRequest: request,
      imageUrl: request.imageUrl,
      imagePreview: request.imageUrl
    });
  }

  function recordHomeworkOutcome(request: HomeworkRequest, response: HomeworkResponse, workspaceFeature: HomeworkFeature) {
    handleHomeworkResponse(request, response, workspaceFeature);
    const responseKnowledge = (response.knowledge || []).slice(0, 3);
    for (const knowledge of responseKnowledge) {
      addWeakPoint(knowledge, request.subject, workspaceFeature, isFeatureCorrect(workspaceFeature));
    }
    if (response.similarPractice?.length && responseKnowledge.length < 3) {
      for (const question of response.similarPractice.slice(0, 3 - responseKnowledge.length)) {
        addWeakPoint(question.knowledge || request.subject, request.subject, workspaceFeature, false);
      }
    }
  }

  async function waitForHomeworkJob(request: HomeworkRequest, jobId: string, workspaceFeature: HomeworkFeature) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const response = await fetch(`/api/homework/status?jobId=${encodeURIComponent(jobId)}&owner=${encodeURIComponent(request.owner || "__anonymous__")}`);
      const payload = await response.json() as { status?: string; result?: HomeworkResponse; error?: string };
      if (!response.ok) throw new Error(payload.error || "后台生成失败");
      if (payload.status === "completed" && payload.result) {
        recordHomeworkOutcome(request, payload.result, workspaceFeature);
        return;
      }
      if (payload.status === "failed") throw new Error(payload.error || "后台生成失败");
    }
    throw new Error("后台生成超过 5 分钟仍未完成，请查看任务状态");
  }

  function runHomeworkRequest(request: HomeworkRequest, workspaceFeature: HomeworkFeature = feature) {
    const startedAt = Date.now();
    if (workspaceFeature === feature) setPendingRequest(request);
    setStoreState(workspaceFeature, {
      content: request.content,
      subject: request.subject,
      isMutating: true,
      error: undefined,
      startedAt,
      pendingRequest: request,
      imageUrl: request.imageUrl,
      imagePreview: request.imageUrl
    });
    void trigger(request).then(async (response) => {
      if (!response) return;
      if ("jobId" in response) {
        await waitForHomeworkJob(request, response.jobId, workspaceFeature);
        return;
      }
      recordHomeworkOutcome(request, response, workspaceFeature);
    }).catch((requestError) => {
      const message = requestError instanceof Error ? requestError.message : "生成失败";
      const aborted = requestError instanceof DOMException && requestError.name === "AbortError";
      if (!aborted) emitServiceWarning(`请求链路异常：${message}，请稍后重试。`);
      setStoreState(workspaceFeature, { isMutating: false, error: message, pendingRequest: request });
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() && !imageUrl) return;
    const request: HomeworkRequest = { owner: loadCurrentUsername() || undefined, feature: config.feature, subject, content: content.trim() || "请识别并分析图片内容", profile: getLearnerProfile(), imageUrl: imageUrl || undefined };
    runHomeworkRequest(request);
  }

  function askAIWordLookup() {
    if (!content.trim()) return;
    const request: HomeworkRequest = {
      owner: loadCurrentUsername() || undefined,
      feature: config.feature,
      subject,
      content: content.trim(),
      profile: getLearnerProfile(),
      forceAI: true
    };
    runHomeworkRequest(request);
  }

  function askFollowUp(question: string) {
    const nextContent = question.trim();
    if (!nextContent || effectiveMutating || useLearningStore.getState().getWorkspaceState("ai_answer").isMutating) return;
    if (feature === "ai_answer") setContent(nextContent);
    setStoreState("ai_answer", { content: nextContent, subject, error: undefined });
    const request: HomeworkRequest = {
      owner: loadCurrentUsername() || undefined,
      feature: "ai_answer",
      subject,
      content: nextContent,
      profile: getLearnerProfile()
    };
    router.push("/ai-answer");
    runHomeworkRequest(request, "ai_answer");
  }

  function runImageRequest(nextImageUrl: string) {
    const request: HomeworkRequest = {
      owner: loadCurrentUsername() || undefined,
      feature: config.feature,
      subject,
      content: content.trim() || "Please identify and solve the problem in the image.",
      profile: getLearnerProfile(),
      imageUrl: nextImageUrl
    };
    runHomeworkRequest(request);
  }

  /** 根据功能类型判断知识点追踪的正确性
   *  review/correction 类 → 发现薄弱点（correct=false，增加权重）
   *  查看/学习类 → 正向学习行为（correct=true，降低权重）
   */
  function isFeatureCorrect(feature: string): boolean {
    const positiveFeatures = new Set([
      "resource_click", "review_plan_view", "video_click",
      "course_recommend", "recitation"
    ]);
    const correctionFeatures = new Set([
      "homework_review", "essay_correction", "mental_math_check",
      "mistake_analysis"
    ]);
    if (positiveFeatures.has(feature)) return true;
    if (correctionFeatures.has(feature)) return false;
    // ai_answer, photo_search, photo_translate, word_lookup, oral_practice,
    // document_scan, parent_report → 中性学习行为，默认正确
    return true;
  }


  async function storeImage(source: File | HTMLCanvasElement, autoSubmit = false) {
    setProcessingImage(true);
    try {
      let dataUrl: string;
      if (source instanceof HTMLCanvasElement) {
        dataUrl = canvasToCompressedDataUrl(source);
      } else {
        dataUrl = await fileToCompressedDataUrl(source);
      }
      setImageUrl(dataUrl);
      setImagePreview(dataUrl);
      setStoreState(feature, { imageUrl: dataUrl, imagePreview: dataUrl, content, subject });
      setCropSrc(null);
      if (canScan) stopCamera();
      if (autoSubmit) runImageRequest(dataUrl);
    } finally {
      setProcessingImage(false);
    }
  }

  function recognizeImage(source: File | HTMLCanvasElement) {
    if (canScan && source instanceof File) {
      void fileToCompressedDataUrl(source).then((dataUrl) => setCropSrc(dataUrl)).catch(() => emitServiceWarning("请求链路异常：图片处理失败，请重新选择图片。"));
    } else {
      void storeImage(source);
    }
  }

  function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) recognizeImage(file);
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    streamRef.current = stream;
    setCameraOn(true);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    void storeImage(canvas, autoSubmitImage);
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceStatus("");
  }

  function toggleDictation() {
    if (voiceListening) {
      stopDictation();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("当前浏览器不支持语音录入");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = subject === "英语" ? "en-US" : "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    dictationBaseRef.current = "";
    dictationFinalRef.current = "";
    setLiveTranscript("");
    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceStatus("正在聆听");
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      setVoiceStatus("语音录入失败");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceListening(false);
      setVoiceStatus("");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      Array.from(event.results).forEach((item) => {
        const result = item as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      });
      dictationFinalRef.current = finalText;
      const transcript = [finalText, interimText].filter(Boolean).join("");
      setLiveTranscript(transcript);
      const nextContent = [dictationBaseRef.current, transcript].filter(Boolean).join("\n");
      setContent(nextContent);
      setStoreState(feature, { content: nextContent, subject });
    };
    recognition.start();
  }

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOn]);

  useEffect(() => () => {
    setStoreState(feature, { isMutating: false });
    stopCamera();
    recognitionRef.current?.stop();
  }, []);

  return (
    <section className={`feature-screen feature-screen-${mode}`} data-feature-hydrated={hydrated ? "true" : "false"}>
      <section className={`feature-workspace feature-workspace-${mode}`}>
        <form className={`feature-composer feature-composer-${mode}`} onSubmit={submit}>
          <div className="composer-head">
            <span className="pill">{modeTitle(mode)}</span>
            <select className="select compact-select" value={subject} onChange={(event) => { setSubject(event.target.value); setStoreState(feature, { subject: event.target.value }); }} aria-label="学科">
              {config.subjects.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          {canScan ? (
            <div className="scan-capture">
              <input hidden ref={fileRef} type="file" accept="image/*" onChange={handleImageFileChange} />
              {imagePreview ? (
                <div className="image-preview-container">
                  <img src={imagePreview} alt="待分析图片" className="image-preview" />
                  <button className="button small image-reupload-button" onClick={() => fileRef.current?.click()} type="button">
                    <ImageUp size={16} /> 重新上传
                  </button>
                </div>
              ) : (
                <>
                  {cameraOn ? <video className="camera-preview large" ref={videoRef} autoPlay playsInline muted /> : (
                    <button className="scan-dropzone" onClick={() => fileRef.current?.click()} type="button">
                      <ImageUp size={24} />
                      <span>上传图片</span>
                    </button>
                  )}
                  <div className="ocr-actions">
                    <button className="button secondary" onClick={() => cameraOn ? stopCamera() : void startCamera()} type="button">
                      {cameraOn ? <VideoOff size={16} /> : <Camera size={16} />}
                      {cameraOn ? "关闭相机" : "打开相机"}
                    </button>
                    {cameraOn ? <button className="button" onClick={captureFrame} type="button"><Eye size={16} /> 拍照分析</button> : null}
                  </div>
                </>
              )}
              {processingImage ? <p className="muted">正在处理图片...</p> : null}
            </div>
          ) : null}

          {canDictate ? (
            <div className={`voice-strip voice-strip-${mode}`}>
              <button className={"button secondary voice-record-btn" + (voiceListening ? " listening" : "")} onClick={toggleDictation} type="button" aria-label={voiceListening ? "停止录音" : "语音录入"}>
                {voiceListening ? <span className="voice-stop-mark" aria-hidden /> : <Mic size={16} />}
                <span>{voiceListening ? "停止录音" : "语音录入"}</span>
              </button>
              {voiceStatus ? <span className="pill">{voiceStatus}</span> : null}
            </div>
          ) : null}

          {canDictate && liveTranscript ? (
            <div className="voice-transcript-panel">
              <span className="muted">实时转写</span>
              <p>{liveTranscript}</p>
            </div>
          ) : null}

          {showDictationOnly ? null : mode === "dictionary" ? (
            <div className="dictionary-search">
              <Search size={18} />
              <input className="input bare-input" value={content} onChange={(event) => { setContent(event.target.value); setStoreState(feature, { content: event.target.value }); }} placeholder={config.placeholder} />
            </div>
          ) : (
            <textarea className={`textarea feature-textarea feature-textarea-${mode}`} value={content} onChange={(event) => { setContent(event.target.value); setStoreState(feature, { content: event.target.value }); }} placeholder={config.placeholder} />
          )}

          <button className="button" disabled={!hasSubmittableInput || effectiveMutating || processingImage} type="submit">
            {effectiveMutating ? <Sparkles size={16} /> : <Send size={16} />}
            {effectiveMutating ? (
              <span className="processing-label">
                <span>处理中</span>
                <span className="processing-timer">{processingSeconds}s</span>
              </span>
            ) : config.submitLabel}
          </button>
          {cropSrc ? (
            <div className="crop-overlay">
              <ImageCropSelector src={cropSrc} onCrop={(canvas) => void storeImage(canvas, autoSubmitImage)} />
              <button className="button secondary" onClick={() => { setCropSrc(null); }} type="button" style={{ marginTop: "var(--space-2)" }}>取消裁剪</button>
            </div>
          ) : null}
          {lastSaved ? <p className="muted">{lastSaved}</p> : null}
        </form>

        <section className={`feature-output feature-output-${mode}`}>
          {(error || storeSnapshot.error) ? <ErrorBlock error={error || storeSnapshot.error} /> : null}
          <ResultPanel data={displayData} mode={mode} feature={config.feature} isLoading={effectiveMutating} onAskAIWordLookup={askAIWordLookup} onFollowUp={askFollowUp} />
        </section>
      </section>
    </section>
  );
}
