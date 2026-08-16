import { expect, test, type Locator, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};

const dragWithKeyboard = async (
  handle: Locator,
  direction: string,
  moves = 1
) => {
  await handle.focus();
  await handle.press("Space");
  await handle.page().waitForTimeout(150);
  for (let move = 0; move < moves; move += 1) {
    await handle.press(direction);
    await handle.page().waitForTimeout(150);
  }
  await handle.press("Space");
};

const waitForMutation = (page: Page, path: RegExp, method: string) =>
  page.waitForResponse(
    (response) =>
      path.test(new URL(response.url()).pathname) &&
      response.request().method() === method &&
      response.ok()
  );

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

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("persists every board mutation through the API", async ({ page }) => {
  await login(page);
  const columns = page.locator('[data-testid^="column-"]');
  const firstColumn = columns.nth(0);

  if (process.env.PLAYWRIGHT_RESTART_CHECK === "1") {
    await expect(
      firstColumn.getByRole("textbox", { name: "Column title", exact: true })
    ).toHaveValue(
      "Persistent ideas"
    );
    const persistedCard = page
      .locator('[data-testid^="card-"]')
      .filter({ hasText: "Persistent card" });
    await expect(persistedCard).toBeVisible();
    await expect(persistedCard.getByText("Updated through the API")).toBeVisible();
    return;
  }

  const columnTitle = firstColumn.getByRole("textbox", {
    name: "Column title",
    exact: true,
  });
  await columnTitle.fill("Persistent ideas");
  await Promise.all([
    waitForMutation(page, /\/api\/board\/columns\/\d+$/, "PATCH"),
    firstColumn.getByLabel("Save column title").click(),
  ]);
  await expect(columnTitle).toHaveValue("Persistent ideas");

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByLabel("New card title").fill("Integration card");
  await firstColumn.getByLabel("New card details").fill("Created in the browser");
  await Promise.all([
    waitForMutation(page, /\/api\/board\/cards$/, "POST"),
    firstColumn.getByRole("button", { name: "Add card" }).click(),
  ]);

  let persistentCard = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Integration card" });
  await expect(persistentCard).toBeVisible();
  const persistentCardId = await persistentCard.getAttribute("data-testid");
  if (!persistentCardId) {
    throw new Error("Created card did not have a stable test id.");
  }
  await persistentCard.getByLabel("Edit Integration card").click();
  const editingCard = page.getByTestId(persistentCardId);
  await editingCard.getByLabel("Card title").fill("Persistent card");
  await editingCard.getByLabel("Card details").fill("Updated through the API");
  await Promise.all([
    waitForMutation(page, /\/api\/board\/cards\/\d+$/, "PATCH"),
    editingCard.getByRole("button", { name: "Save card" }).click(),
  ]);

  persistentCard = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Persistent card" });
  const moveToSecondColumn = waitForMutation(
    page,
    /\/api\/board\/cards\/\d+\/move$/,
    "POST"
  );
  await dragWithKeyboard(
    persistentCard.getByLabel("Drag Persistent card"),
    "ArrowRight"
  );
  await moveToSecondColumn;

  await expect(firstColumn.getByTestId(persistentCardId)).toHaveCount(0);
  persistentCard = page.getByTestId(persistentCardId);
  await expect(persistentCard).toBeVisible();
  const destinationColumn = page.locator(
    `[data-testid^="column-"]:has([data-testid="${persistentCardId}"])`
  );
  const destinationCards = destinationColumn.locator('[data-testid^="card-"]');
  const originalOrder = await destinationCards.evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-testid"))
  );
  const originalIndex = originalOrder.indexOf(persistentCardId);
  const direction = originalIndex === 0 ? "ArrowDown" : "ArrowUp";
  const reorder = waitForMutation(
    page,
    /\/api\/board\/cards\/\d+\/move$/,
    "POST"
  );
  await dragWithKeyboard(
    persistentCard.getByLabel("Drag Persistent card"),
    direction,
    2
  );
  await reorder;
  await expect
    .poll(async () => {
      const nextOrder = await destinationCards.evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-testid"))
      );
      return nextOrder.indexOf(persistentCardId);
    })
    .not.toBe(originalIndex);

  const deletedCard = firstColumn.locator('[data-testid^="card-"]').first();
  const deletedCardId = await deletedCard.getAttribute("data-testid");
  await Promise.all([
    waitForMutation(page, /\/api\/board\/cards\/\d+$/, "DELETE"),
    deletedCard.getByRole("button", { name: /^Delete / }).click(),
  ]);
  if (deletedCardId) {
    await expect(page.getByTestId(deletedCardId)).toHaveCount(0);
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(
    page
      .locator('[data-testid^="column-"]')
      .nth(0)
      .getByRole("textbox", { name: "Column title", exact: true })
  ).toHaveValue("Persistent ideas");
  const reloadedCard = page
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Persistent card" });
  await expect(reloadedCard).toContainText("Persistent card");
  await expect(reloadedCard).toContainText("Updated through the API");
  if (deletedCardId) {
    await expect(page.getByTestId(deletedCardId)).toHaveCount(0);
  }
});
