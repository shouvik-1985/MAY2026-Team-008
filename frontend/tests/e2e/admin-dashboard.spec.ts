import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("admin dashboard", () => {
  test("logs in, loads the dashboard, and filters student records", async ({ page }) => {
    await login(page, "admin@campusverse.edu", "admin123", "/admin");
    await expect(page.getByRole("heading", { name: /Full-campus control/ })).toBeVisible();
    await page.goto("/admin#student");
    await expect(page.getByRole("heading", { name: "All students" })).toBeVisible();
    await page
      .getByPlaceholder("Search by name, roll, address, department")
      .fill("no matching student");
    await expect(page.getByText(/No student accounts match/i)).toBeVisible();
  });

  test("shows a dashboard error state", async ({ page }) => {
    await login(page, "admin@campusverse.edu", "admin123", "/admin");
    await page.route("**/api/admin/dashboard", (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ detail: "Dashboard unavailable" }) }),
    );
    await page.reload();
    await expect(page.getByText("Dashboard unavailable")).toBeVisible();
  });
});
