import { test, expect } from "@playwright/test";

const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://127.0.0.1:3016";
test.setTimeout(240_000);

test("文本模块与弱点到复习计划/个性资源闭环", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  async function open(path: string) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("启学智伴", { timeout: 30_000 });
  }

  async function submit(path: string, value: string, button: string) {
    await open(path);
    await page.locator("textarea").first().fill(value);
    await page.getByRole("button", { name: button }).click();
    await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
    if (await page.locator(".service-warning-modal").count()) throw new Error(`${path} 触发链路警告：${await page.locator(".service-warning-modal").innerText()}`);
    expect((await page.locator(".feature-output").innerText()).length).toBeGreaterThan(20);
  }

  await open("/login?next=/");
  await page.getByLabel("用户名").fill(`text_e2e_${Date.now()}`);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("textbox", { name: "昵称" }).fill("文本链路测试用户");
  await page.getByRole("button", { name: "完成注册" }).click();
  await expect(page).toHaveURL(/\/$/);

  await submit("/ai-answer", "为什么二次函数有顶点？", "开始答疑");

  await open("/homework");
  await page.getByRole("button", { name: "作文批改" }).click();
  await expect(page.locator('textarea[placeholder*="作文"]')).toBeVisible();
  await page.getByRole("button", { name: "口算批改" }).click();
  await page.locator("textarea").fill("12×8=96；45+37=72");
  await page.getByRole("button", { name: "批改口算" }).click();
  await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
  if (await page.locator(".service-warning-modal").count()) throw new Error(`作业中心链路警告：${await page.locator(".service-warning-modal").innerText()}`);
  expect((await page.locator(".feature-output").innerText()).length).toBeGreaterThan(20);

  await open("/language-tools");
  await page.getByRole("button", { name: "口语练习" }).click();
  await expect(page.locator('textarea[placeholder*="口语"]')).toBeVisible();
  await page.getByRole("button", { name: "词典查询" }).click();
  await page.locator('input[placeholder*="单词"]').fill("study");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator(".processing-label")).toHaveCount(0, { timeout: 120_000 });
  if (await page.locator(".service-warning-modal").count()) throw new Error(`语言工具链路警告：${await page.locator(".service-warning-modal").innerText()}`);
  expect((await page.locator(".feature-output").innerText()).length).toBeGreaterThan(20);
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

  const weakPoint = await page.evaluate(() => {
    const raw = localStorage.getItem("qixue_weak_points");
    const points = raw ? JSON.parse(raw) : [];
    const weak = points.find((point: { weight?: number }) => Number(point.weight || 0) >= 25);
    return weak ? { subject: weak.subject, knowledge: weak.knowledge } : null;
  });
  expect(weakPoint, "文本交互没有产生薄弱点").not.toBeNull();

  await open("/review-plan");
  await expect(page.locator(".review-plan-detail, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
  if (await page.locator(".service-warning-modal").count()) throw new Error(`复习计划链路警告：${await page.locator(".service-warning-modal").innerText()}`);
  await page.getByRole("button", { name: /标记完成/ }).first().click();
  await expect(page.getByRole("button", { name: /取消完成/ }).first()).toBeVisible();

  await open("/resources");
  await page.getByLabel("知识点").fill(`${weakPoint!.subject} ${weakPoint!.knowledge}`);
  await page.getByRole("button", { name: "生成资源" }).click();
  await expect(page.locator(".resource-card-link, .service-warning-modal")).toBeVisible({ timeout: 120_000 });
  if (await page.locator(".service-warning-modal").count()) throw new Error(`个性资源链路警告：${await page.locator(".service-warning-modal").innerText()}`);
  await page.locator(".resource-card-link").first().click();
  await expect(page).toHaveURL(/\/resources\/detail/);

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);

});

