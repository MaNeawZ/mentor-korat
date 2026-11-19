import { test, expect } from "@playwright/test";
test("login is readable, responsive, and password visibility works", async ({
  page,
}, info) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  const input = page.getByLabel("รหัสผ่าน", { exact: true });
  await input.fill("local-ui-test-only");
  await page.getByRole("button", { name: "แสดงรหัสผ่าน" }).click();
  await expect(input).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "ซ่อนรหัสผ่าน" }).click();
  await expect(input).toHaveAttribute("type", "password");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/login-${info.project.name}.png`,
    fullPage: true,
  });
});
test("system dark mode renders without page errors", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/login-dark-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("internal routes redirect anonymous visitors and recovery is available", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("link", { name: "ลืมรหัสผ่าน?" }).click();
  await expect(
    page.getByRole("heading", { name: "ลืมรหัสผ่าน", exact: true }),
  ).toBeVisible();
});
test("invalid upload links show a private, safe error", async ({ page }) => {
  await page.goto("/upload/invalid");
  await expect(
    page.getByText("ลิงก์นี้ไม่สามารถใช้งานได้แล้ว กรุณาขอลิงก์ใหม่จาก Mentor"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
