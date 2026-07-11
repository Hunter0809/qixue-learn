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

    async function expectFeatureResult(label: string) {
      await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
      const warning = page.locator(".service-warning-modal");
      if (await warning.count()) {
        throw new Error(`${label} 产生服务警告：${await warning.innerText()}`);
      }
      const output = await page.locator(".feature-output").innerText();
      expect(output.length, `${label} 没有产生可见结果`).toBeGreaterThan(20);
    }

    async function submitText(path: string, text: string, button: string) {
      await open(path);
      const input = page.locator("textarea").first();
      await input.fill(text);
      await page.getByRole("button", { name: button }).click();
      await expectFeatureResult(path);
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
    await expectFeatureResult("拍照搜题");

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
    await expectFeatureResult("拍照翻译");

    await submitText("/ai-answer", "为什么二次函数有顶点？", "开始答疑");

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
    await page.getByRole("button", { name: "查询" }).click();
    await expectFeatureResult("语言工具-词典查询");
    await page.getByRole("button", { name: "拍照翻译" }).click();
    await expect(page.locator('input[type="file"]')).toBeVisible();

    await open("/");
    await expect(page.getByRole("heading", { name: /学习空间/ })).toBeVisible({ timeout: 90_000 });
    const layoutButtons = page.locator(".learning-space-controls button");
    if (await layoutButtons.count() >= 2) {
      await layoutButtons.nth(1).click();
      await expect(page.locator(".learning-space-grid.list-layout")).toBeVisible();
      await layoutButtons.nth(0).click();
      await expect(page.locator(".learning-space-grid:not(.list-layout)")).toBeVisible();
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

