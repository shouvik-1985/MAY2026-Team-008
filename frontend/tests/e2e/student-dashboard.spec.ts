import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("student dashboard", () => {
  test("logs in, loads the dashboard, and creates a todo", async ({ page }) => {
    await login(page, "student@campusverse.edu", "student123", "/app");
    await expect(page.getByRole("heading", { name: /academic command center/i })).toBeVisible();
    const todo = `E2E study plan ${Date.now()}`;
    await page.getByPlaceholder("Add a plan for today").fill(todo);
    await page.getByRole("button", { name: /add/i }).click();
    await expect(page.getByText(todo)).toBeVisible();
  });

  test("falls back to demo data after a dashboard failure", async ({ page }) => {
    await page.route("**/api/student/dashboard", (route) =>
      route.fulfill({
        status: 503,
        body: JSON.stringify({ detail: "Student dashboard unavailable" }),
      }),
    );
    await login(page, "student@campusverse.edu", "student123", "/app");
    await expect(page.getByText("Demo data")).toBeVisible();
  });
});
