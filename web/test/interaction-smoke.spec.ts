import { test, expect } from "@playwright/test";

const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://127.0.0.1:3014";
const mathImage = "D:\\Mycode\\PythonProject\\Softwarecup\\web\\test\\test_math.png";
const translationImage = "D:\\Mycode\\PythonProject\\Softwarecup\\web\\test\\test_translation.png";

test.setTimeout(240_000);

test.describe("启学智伴全模块真实交互", () => {
  test("图片、答疑、语言、学习空间、计划、资源和报告闭环", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    async function open(path: string) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("启学智伴", { timeout: 30_000 });
      const workspace = page.locator("[data-feature-hydrated]");
      if (await workspace.count()) await expect(workspace).toHaveAttribute("data-feature-hydrated", "true", { timeout: 30_000 });
    }

    async function expectFeatureResult(label: string, cardTitles: string[] = []) {
      await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
      const warning = page.locator(".service-warning-modal");
      if (await warning.count()) {
        throw new Error(`${label} 产生服务警告：${await warning.innerText()}`);
      }
      const output = await page.locator(".feature-output").innerText();
      expect(output.length, `${label} 没有产生可见结果`).toBeGreaterThan(20);
      for (const title of cardTitles) {
        const card = page.locator(".feature-output .result-card.filled").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
        await expect(card, `${label} 卡片 ${title} 未填充`).toHaveCount(1);
        expect((await card.innerText()).length, `${label} 卡片 ${title} 没有正文`).toBeGreaterThan(title.length + 4);
      }
    }
    async function submitText(path: string, text: string, button: string, cardTitles: string[] = []) {
      await open(path);
      const input = page.locator("textarea").first();
      await input.fill(text);
      await page.getByRole("button", { name: button }).click();
      await expectFeatureResult(path, cardTitles);
    }

    await open("/login?next=/");
    await page.getByLabel("用户名").fill(`e2e_${Date.now()}`);
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("textbox", { name: "昵称" }).fill("全模块测试用户");
    await page.getByRole("button", { name: "完成注册" }).click();
    await expect(page).toHaveURL(/\/$/);

    await open("/photo-search");
    await page.locator('input[type="file"]').setInputFiles(mathImage);
    await expect(page.locator(".crop-image")).toBeVisible({ timeout: 30_000 });
    const crop = page.locator(".crop-image-wrap");
    const box = await crop.boundingBox();
    if (!box) throw new Error("拍照搜题裁剪区域不可用");
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(180, box.width - 12), box.y + Math.min(140, box.height - 12));
    await page.mouse.up();
    await page.getByRole("button", { name: "裁剪并分析" }).click();
    await expectFeatureResult("拍照搜题", ["题干识别", "答案结论", "推导链路", "同类变式"]);

    await open("/photo-translate");
    await page.locator('input[type="file"]').setInputFiles(translationImage);
    await expect(page.locator(".crop-image")).toBeVisible({ timeout: 30_000 });
    const translateCrop = page.locator(".crop-image-wrap");
    const translateBox = await translateCrop.boundingBox();
    if (!translateBox) throw new Error("拍照翻译裁剪区域不可用");
    await page.mouse.move(translateBox.x + 12, translateBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(translateBox.x + Math.min(180, translateBox.width - 12), translateBox.y + Math.min(140, translateBox.height - 12));
    await page.mouse.up();
    await page.getByRole("button", { name: "裁剪并分析" }).click();
    await expectFeatureResult("拍照翻译", ["原文识别", "译文对照", "语法拆解", "表达替换"]);

    await submitText("/ai-answer", "为什么二次函数有顶点？", "开始答疑", ["直接结论", "关键概念", "推理依据", "追问方向"]);

    await open("/language-tools");
    await page.getByRole("button", { name: "口语练习" }).click();
    await expect(page.locator('textarea[placeholder*="口语"]')).toBeVisible();
    await page.getByRole("button", { name: "词典查询" }).click();
    await expect(page.locator('input[placeholder*="单词"]')).toBeVisible();
    await page.locator('input[placeholder*="单词"]').fill("study");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await expectFeatureResult("语言工具-词典查询");
    await page.getByRole("button", { name: "拍照翻译" }).click();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);

    await open("/");
    await expect(page.getByRole("heading", { name: /学习空间/ })).toBeVisible({ timeout: 90_000 });
    const layoutButtons = page.locator(".learning-space-controls button");
    if (await layoutButtons.count() >= 2) {
      await layoutButtons.nth(1).click();
      await expect(layoutButtons.nth(1)).toHaveClass(/active/);
      await layoutButtons.nth(0).click();
      await expect(layoutButtons.nth(0)).toHaveClass(/active/);
    }
    const category = page.locator(".learning-space-subject-card").first();
    if (await category.count()) await category.click();

    const weakPoint = await page.evaluate(async () => {
      const owner = localStorage.getItem("qixue_current_user") || "__anonymous__";
      const response = await fetch(`/api/weak-points?owner=${encodeURIComponent(owner)}`);
      const points = await response.json() as Array<{ subject: string; knowledge: string }>;
      const weak = points[0];
      return weak ? { subject: weak.subject, knowledge: weak.knowledge } : null;
    });    expect(weakPoint, "用户交互没有产生薄弱知识点").not.toBeNull();

    await open("/review-plan");
    await expect(page.locator(".review-plan-detail, .service-warning-modal").first()).toBeVisible({ timeout: 120_000 });
    if (await page.locator(".service-warning-modal").count()) throw new Error(`复习计划警告：${await page.locator(".service-warning-modal").innerText()}`);
    await page.getByRole("button", { name: /标记完成/ }).first().click();
    await expect(page.getByRole("button", { name: /取消完成/ }).first()).toBeVisible();

    await open("/resources");
    const knowledge = `${weakPoint!.subject} ${weakPoint!.knowledge}`;
    await page.getByLabel("知识点").fill(knowledge);
    await expect(page.getByRole("button", { name: "生成资源" })).toBeEnabled({ timeout: 30_000 });
    await page.getByRole("button", { name: "生成资源" }).click();
    await expect(page.locator(".resource-card-link, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
    if (await page.locator(".service-warning-modal").count()) throw new Error(`个性资源警告：${await page.locator(".service-warning-modal").innerText()}`);
    await page.locator(".resource-card-link").first().click();
    await expect(page).toHaveURL(/\/resources\?category=/);
    await page.locator(".resource-card-link").first().click();
    await expect(page).toHaveURL(/\/resources\?category=.*knowledge=/);
    await page.locator(".resource-card-link").first().click();
    await expect(page).toHaveURL(/\/resources\/detail/);

    await open("/report");
    await expect(page.getByRole("heading", { name: "学习效果评估" })).toBeVisible({ timeout: 30_000 });

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    console.log("FULL_INTERACTION_SMOKE_OK");
  });
});

test("搜题行为驱动主页薄弱点、推荐资源与个人画像", async ({ page }) => {
  const owner = `behavior_flow_e2e_${Date.now()}`;
  await page.goto(`${baseUrl}/login?next=/`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("用户名").fill(owner);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("textbox", { name: "昵称" }).fill("行为链路测试用户");
  await page.getByRole("button", { name: "完成注册" }).click();

  await page.getByRole("link", { name: "拍照搜题", exact: true }).click();
  await expect(page.locator("[data-feature-hydrated]")).toHaveAttribute("data-feature-hydrated", "true", { timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles(mathImage);
  await expect(page.locator(".crop-image")).toBeVisible({ timeout: 30_000 });
  const crop = page.locator(".crop-image-wrap");
  const box = await crop.boundingBox();
  if (!box) throw new Error("拍照搜题裁剪区域不可用");
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(180, box.width - 12), box.y + Math.min(140, box.height - 12));
  await page.mouse.up();
  const searchStartedAt = Date.now();
  await page.getByRole("button", { name: "裁剪并分析" }).click();
  await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
  const searchLatencyMs = Date.now() - searchStartedAt;
  console.log(`PHOTO_SEARCH_E2E_LATENCY_MS=${searchLatencyMs}`);
  expect(searchLatencyMs, "拍照搜题端到端返回超过 15 秒").toBeLessThanOrEqual(15_000);
  await expect(page.locator(".service-warning-modal")).toHaveCount(0);
  await expect(page.locator(".feature-output")).toContainText("答案结论");

  await page.getByRole("link", { name: "首页", exact: true }).click();
  await expect(page.getByRole("heading", { name: "薄弱知识点" })).toBeVisible();
  await expect(page.locator(".weak-point-line:not(.weak-point-placeholder)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".resource-list-fill .resource-card-link").first()).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: /行为链路测试用户/ }).click();
  await page.getByRole("link", { name: "个人中心", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  const profilePanels = page.locator(".profile-grid > .profile-panel");
  const personalInfoPanel = profilePanels.filter({ has: page.getByRole("heading", { name: "个人信息", exact: true }) });
  const profileDialogPanel = profilePanels.filter({ has: page.getByRole("heading", { name: "对话式学习画像", exact: true }) });
  await expect(personalInfoPanel).toHaveCount(1);
  await expect(profileDialogPanel).toHaveCount(1);
  const personalInfoBox = await personalInfoPanel.boundingBox();
  const profileDialogBox = await profileDialogPanel.boundingBox();
  expect(personalInfoBox).not.toBeNull();
  expect(profileDialogBox).not.toBeNull();
  const profileGridBox = await page.locator(".profile-grid").boundingBox();
  expect(profileGridBox).not.toBeNull();
  expect(Math.abs(personalInfoBox!.width - profileGridBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(profileDialogBox!.width - profileGridBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(personalInfoBox!.width - profileDialogBox!.width)).toBeLessThanOrEqual(1);
  const behaviorHistory = page.locator(".profile-dimension-card").filter({ hasText: "学习历史" });
  await expect(behaviorHistory).toBeVisible();
  await expect(behaviorHistory).not.toContainText("待对话识别", { timeout: 30_000 });
  await expect(behaviorHistory).toContainText(/拍照搜题|photo_search/);
});
test("后端薄弱点驱动计划与异步资源", async ({ page }) => {
  const owner = `plan_resource_e2e_${Date.now()}`;
  await page.goto(`${baseUrl}/login?next=/`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("用户名").fill(owner);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("textbox", { name: "昵称" }).fill("计划资源测试用户");
  await page.getByRole("button", { name: "完成注册" }).click();
  const behavior = await page.request.post(`${baseUrl}/api/behavior`, {
    data: { owner, subject: "数学", knowledge: "微分方程", source: "photo_search", correct: false }
  });
  expect(behavior.ok()).toBeTruthy();

  await page.goto(`${baseUrl}/review-plan`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".review-plan-detail, .service-warning-modal").first()).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".service-warning-modal")).toHaveCount(0);
  await page.getByRole("button", { name: /标记完成/ }).first().click();
  await expect(page.getByRole("button", { name: /取消完成/ }).first()).toBeVisible();

  await page.goto(`${baseUrl}/resources`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("知识点").fill("数学 微分方程");
  await expect(page.getByRole("button", { name: "生成资源" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "生成资源" }).click();
  await expect(page.locator(".resource-card-link, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(".service-warning-modal")).toHaveCount(0);
  await expect(page.locator(".resource-card-link").first()).toBeVisible();
});
test("语音转文字驱动智能答疑", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
      start() {
        this.onstart?.();
        window.setTimeout(() => {
          const result = [{ transcript: "函数顶点的语音问题" }] as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
          result.isFinal = true;
          this.onresult?.({ results: [result] });
        }, 20);
      }
      stop() { this.onend?.(); }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
  });
  await page.goto(`${baseUrl}/login?next=/`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("用户名").fill(`voice_e2e_${Date.now()}`);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("textbox", { name: "昵称" }).fill("语音测试用户");
  await page.getByRole("button", { name: "完成注册" }).click();
  await page.goto(`${baseUrl}/ai-answer`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-feature-hydrated]")).toHaveAttribute("data-feature-hydrated", "true", { timeout: 30_000 });
  await page.getByRole("button", { name: "语音录入" }).click();
  const input = page.locator("textarea").first();
  await expect(input).toHaveValue("函数顶点的语音问题", { timeout: 10_000 });
  await page.getByRole("button", { name: "停止录音" }).click();
  await page.getByRole("button", { name: "开始答疑" }).click();
  await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator(".service-warning-modal")).toHaveCount(0);
  expect((await page.locator(".feature-output").innerText()).length).toBeGreaterThan(20);
  for (const title of ["直接结论", "关键概念", "推理依据", "追问方向"]) {
    const card = page.locator(".feature-output .result-card.filled").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(card, `语音答疑卡片 ${title} 未填充`).toHaveCount(1);
  }
  expect(consoleErrors, consoleErrors.join("\\n")).toEqual([]);
});
