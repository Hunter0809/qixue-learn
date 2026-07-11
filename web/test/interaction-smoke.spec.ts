import { test, expect } from "@playwright/test";

const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://127.0.0.1:3014";
const mathImage = "D:\\Mycode\\PythonProject\\Softwarecup\\web\\test\\test_math.png";
const translationImage = "D:\\Mycode\\PythonProject\\Softwarecup\\web\\test\\test_translation.png";

test.setTimeout(240_000);

test.describe("启学智伴全模块真实交互", () => {
  test("图片、答疑、作业、语言、学习空间、计划和个性资源闭环", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    async function open(path: string) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText("启学智伴", { timeout: 30_000 });
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

    await open("/homework");
    await page.getByRole("button", { name: "作文批改" }).click();
    await expect(page.locator('textarea[placeholder*="作文"]')).toBeVisible();
    await page.getByRole("button", { name: "口算批改" }).click();
    await expect(page.locator('textarea[placeholder*="12×8"]')).toBeVisible();
    await page.locator("textarea").fill("12×8=96；45+37=72");
    await page.getByRole("button", { name: "批改口算" }).click();
    await expectFeatureResult("作业中心-口算批改");

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

    const weakPoint = await page.evaluate(() => {
      const raw = localStorage.getItem("qixue_weak_points");
      const points = raw ? JSON.parse(raw) : [];
      return points[0] ? { subject: points[0].subject, knowledge: points[0].knowledge } : null;
    });
    expect(weakPoint, "用户交互没有产生薄弱知识点").not.toBeNull();

    await open("/review-plan");
    await expect(page.locator(".review-plan-detail, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
    if (await page.locator(".service-warning-modal").count()) throw new Error(`复习计划警告：${await page.locator(".service-warning-modal").innerText()}`);
    await page.getByRole("button", { name: /标记完成/ }).first().click();
    await expect(page.getByRole("button", { name: /取消完成/ }).first()).toBeVisible();

    await open("/resources");
    const knowledge = `${weakPoint!.subject} ${weakPoint!.knowledge}`;
    await page.getByLabel("知识点").fill(knowledge);
    await page.getByRole("button", { name: "生成资源" }).click();
    await expect(page.locator(".resource-card-link, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
    if (await page.locator(".service-warning-modal").count()) throw new Error(`个性资源警告：${await page.locator(".service-warning-modal").innerText()}`);
    await page.locator(".resource-card-link").first().click();
    await expect(page).toHaveURL(/\/resources\/detail/);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    console.log("FULL_INTERACTION_SMOKE_OK");
  });
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
