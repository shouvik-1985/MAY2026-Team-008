import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("professor dashboard", () => {
  test("logs in, loads the dashboard, and searches student records", async ({ page }) => {
    await login(page, "professor@campusverse.edu", "professor123", "/professor");
    await expect(page.getByRole("heading", { name: /academic control center/i })).toBeVisible();
    await page.goto("/professor#students");
    await page.getByPlaceholder("Search by name, address, roll number").fill("no matching student");
    await expect(page.getByText(/No student records match/i)).toBeVisible();
  });

  test("shows a dashboard error state", async ({ page }) => {
    await login(page, "professor@campusverse.edu", "professor123", "/professor");
    await page.route("**/api/professor/dashboard", (route) =>
      route.fulfill({
        status: 503,
        body: JSON.stringify({ detail: "Professor service unavailable" }),
      }),
    );
    await page.reload();
    await expect(page.getByText("Professor service unavailable")).toBeVisible();
  });
});
