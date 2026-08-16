import { expect, test } from "@playwright/test";

const login = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const dragTo = async (
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  target: import("@playwright/test").Locator,
  targetEdge: "top" | "bottom" = "top"
) => {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2 + 10,
    { steps: 5 }
  );
  await page.waitForTimeout(100);
  const targetY =
    targetEdge === "bottom"
      ? targetBox.y + targetBox.height - 60
      : targetBox.y + Math.min(20, targetBox.height / 4);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetY,
    { steps: 20 }
  );
  await page.waitForTimeout(200);
  await page.mouse.up();
};

test("requires sign in before showing the kanban board", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Invalid username or password."
  );
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("keeps the session on refresh and signs out", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("renames a column and removes a card", async ({ page }) => {
  await login(page);
  const firstColumn = page.getByTestId("column-col-backlog");
  const title = firstColumn.getByLabel("Column title");

  await title.fill("Ideas");
  await expect(title).toHaveValue("Ideas");

  await firstColumn.getByLabel("Delete Align roadmap themes").click();
  await expect(firstColumn.getByTestId("card-card-1")).toHaveCount(0);
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  await dragTo(page, card, targetColumn.getByTestId("card-card-6"));
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("reorders cards within a column", async ({ page }) => {
  await login(page);
  const backlog = page.getByTestId("column-col-backlog");

  await dragTo(
    page,
    backlog.getByTestId("card-card-1"),
    backlog,
    "bottom"
  );

  await expect(backlog.locator('[data-testid^="card-"]').first()).toHaveAttribute(
    "data-testid",
    "card-card-2"
  );
});
