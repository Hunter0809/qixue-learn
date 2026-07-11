import { test, expect } from "@playwright/test";

const baseUrl = process.env.QIXUE_WEB_BASE_URL || "http://127.0.0.1:3011";

test.describe("启学智伴真实用户交互", () => {
  test("主导航、登录注册、用户菜单和退出状态完整可用", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await expect(page.locator('nav[aria-label="主导航"]')).toBeVisible();

    await page.getByRole("link", { name: "番茄钟" }).click();
    await expect(page).toHaveURL(/\/pomodoro$/);
    await expect(page.getByRole("heading", { name: "番茄钟" })).toBeVisible();

    await page.getByRole("link", { name: "首页" }).click();
    await expect(page).toHaveURL(/\/$/);

    const loginButton = page.getByRole("button", { name: /登录 \/ 注册/ });
    await loginButton.click();
    await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();

    await page.getByLabel("用户名").fill(`interaction_${Date.now()}`);
    await page.getByRole("button", { name: "下一步" }).click();
    await expect(page.getByRole("heading", { name: "注册学习档案" })).toBeVisible();

    await page.getByLabel("昵称").fill("交互测试用户");
    await page.getByRole("button", { name: "完成注册" }).click();
    await expect(page.getByText("交互测试用户", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /交互测试用户/ }).click();
    await expect(page.getByRole("button", { name: "退出" })).toBeVisible();
    await page.getByRole("button", { name: "退出" }).click();
    await expect(page.getByRole("button", { name: /登录 \/ 注册/ })).toBeVisible();

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
