const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://localhost:3000";
const fullFeatureSmoke = process.env.QIXUE_FULL_FEATURE_SMOKE === "1";

const featureSamples = [
  { feature: "photo_search", subject: "数学", content: "解方程 2x+3=11。" },
  { feature: "ai_answer", subject: "数学", content: "为什么二次函数有顶点？" },
  { feature: "homework_review", subject: "数学", content: "题目：2x+3=11；我的答案：x=5。" },
  { feature: "essay_correction", subject: "语文", content: "请批改：春天来了，校园里的花开了，我很开心。" },
  { feature: "oral_practice", subject: "英语", content: "I would like to practice speaking clearly." },
  { feature: "word_lookup", subject: "英语", content: "study" },
  { feature: "photo_translate", subject: "英语", content: "The library is open from Monday to Friday." },
  { feature: "mental_math_check", subject: "数学", content: "12+15=27，8*7=54，请检查。" },
  { feature: "document_scan", subject: "语文", content: "会议记录：周五提交作文，周六复习阅读理解。" },
  { feature: "recitation", subject: "语文", content: "床前明月光，疑是地上霜。" },
  { feature: "course_recommend", subject: "数学", content: "我想一周内复习一次函数。" },
  { feature: "parent_report", subject: "综合", content: "本周完成数学练习三次，英语背词两次。" }
];

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function postJson(path, body, timeoutMs = 20000) {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeout.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    timeout.clear();
  }
}

async function getJson(path, timeoutMs = 12000) {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: timeout.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    timeout.clear();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const owner = `api_smoke_${Date.now()}`;
  await postJson("/api/profile", {
    owner,
    nickname: "API Smoke",
    school: "同步测试学校",
    grade: "高一",
    region: "江苏 南京市",
    difficulty: "同步"
  });
  await postJson("/api/weak-points", {
    action: "upsert",
    owner,
    subject: "数学",
    knowledge: "函数",
    weight: 35,
    source: "api_smoke"
  });

  const profile = await getJson(`/api/profile?owner=${encodeURIComponent(owner)}`);
  assert(profile.streakDays >= 1, "profile did not reflect stored user profile");
  assert(profile.weak_points.length === 1, "profile did not reflect stored weak point");
  assert(Array.isArray(profile.recommended_resources), "profile resources missing");
  console.log(`OK profile sync weak=${profile.weak_points.length} resources=${profile.recommended_resources.length}`);

  const word = await postJson("/api/homework", {
    feature: "word_lookup",
    subject: "英语",
    content: "study",
    forceAI: false
  });
  assert(word.feature === "word_lookup", "word_lookup returned wrong feature");
  assert(Array.isArray(word.knowledge), "word_lookup knowledge missing");
  console.log(`OK word_lookup title=${word.title}`);

  if (!fullFeatureSmoke) {
    console.log("Skipped full homework feature smoke. Set QIXUE_FULL_FEATURE_SMOKE=1 to call all AI-backed modules.");
    return;
  }

  for (const sample of featureSamples) {
    const result = await postJson("/api/homework", { ...sample, forceAI: false }, 90000);
    assert(result.feature === sample.feature, `${sample.feature} returned wrong feature`);
    assert(typeof result.answer === "string" && result.answer.trim(), `${sample.feature} answer missing`);
    assert(Array.isArray(result.knowledge) && result.knowledge.length === 3, `${sample.feature} did not return exactly 3 knowledge points`);
    console.log(`OK ${sample.feature} knowledge=${result.knowledge.join(" | ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
