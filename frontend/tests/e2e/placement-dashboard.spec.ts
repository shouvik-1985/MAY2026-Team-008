import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("placement dashboard", () => {
  test("logs in, navigates to applicants, and shows an empty filtered state", async ({ page }) => {
    await login(page, "placementpartner@gmail.com", "manager#123", "/placement");
    await expect(page.getByRole("heading", { name: "Placement dashboard" })).toBeVisible();
    await page.goto("/placement#applicants");
    await page.getByPlaceholder("Search name, email, skills").fill("no matching applicant");
    await expect(
      page.getByText("No eligible placement profiles match this search yet."),
    ).toBeVisible();
  });

  test("shows a pipeline error state", async ({ page }) => {
    await login(page, "placementpartner@gmail.com", "manager#123", "/placement");
    await page.route("**/api/placement/manager/dashboard", (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ detail: "Pipeline unavailable" }) }),
    );
    await page.reload();
    await expect(page.getByText("Pipeline unavailable")).toBeVisible();
  });
});
