import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string, destination: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@university.edu").fill(email);
  await page.getByPlaceholder("Minimum 8 characters").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace("/", "\\/")}$`));
}
