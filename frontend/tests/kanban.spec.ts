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

test("creates a new account with its own seeded board", async ({ page }) => {
  const username = `new-teammate-${Date.now()}`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Need an account? Create one" })
    .click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText(/signed in as/i)).toHaveText(
    `Signed in as ${username}`
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("rejects creating an account with a username that is already taken", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Need an account? Create one" })
    .click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "That username is already taken."
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

test("creates, renames, switches, and deletes boards", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("button", { name: "Board", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Board" })).toHaveCount(0);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Second board");
  await Promise.all([
    waitForMutation(page, /\/api\/boards$/, "POST"),
    page.getByRole("button", { name: "Create board" }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Second board", exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Rename Second board" }).click();
  await page.getByLabel("Rename board Second board").fill("Renamed board");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+$/, "PATCH"),
    page.getByRole("button", { name: "Save board name" }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Renamed board", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);

  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+$/, "DELETE"),
    page.getByRole("button", { name: "Delete Renamed board" }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Renamed board", exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete Board" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Renamed board", exact: true })
  ).toHaveCount(0);
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
    await expect(page.getByText("Manual before AI")).toBeVisible();
    await expect(page.getByText("AI single card")).toBeVisible();
    await expect(page.getByText("AI batch card")).toBeVisible();
    return;
  }

  const columnTitle = firstColumn.getByRole("textbox", {
    name: "Column title",
    exact: true,
  });
  await columnTitle.fill("Persistent ideas");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/columns\/\d+$/, "PATCH"),
    firstColumn.getByLabel("Save column title").click(),
  ]);
  await expect(columnTitle).toHaveValue("Persistent ideas");

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByLabel("New card title").fill("Integration card");
  await firstColumn.getByLabel("New card details").fill("Created in the browser");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards$/, "POST"),
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
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "PATCH"),
    editingCard.getByRole("button", { name: "Save card" }).click(),
  ]);

  persistentCard = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Persistent card" });
  const moveToSecondColumn = waitForMutation(
    page,
    /\/api\/boards\/\d+\/cards\/\d+\/move$/,
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
    /\/api\/boards\/\d+\/cards\/\d+\/move$/,
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
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "DELETE"),
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

test("sets, edits, and clears a card's due date", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByLabel("New card title").fill("Deadline card");
  await firstColumn.getByLabel("New card due date").fill("2020-01-01");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards$/, "POST"),
    firstColumn.getByRole("button", { name: "Add card" }).click(),
  ]);

  const cardByText = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Deadline card" });
  await expect(cardByText.getByText(/^Overdue /)).toBeVisible();
  const cardId = await cardByText.getAttribute("data-testid");
  if (!cardId) {
    throw new Error("Created card did not have a stable test id.");
  }
  const card = page.getByTestId(cardId);

  await card.getByLabel("Edit Deadline card").click();
  const dueDateInput = card.getByLabel("Due date");
  await dueDateInput.fill("2099-12-31");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "PATCH"),
    card.getByRole("button", { name: "Save card" }).click(),
  ]);
  await expect(card.getByText(/^Due /)).toBeVisible();
  await expect(card.getByText(/^Overdue /)).toHaveCount(0);

  await card.getByLabel("Edit Deadline card").click();
  await card.getByLabel("Due date").fill("");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "PATCH"),
    card.getByRole("button", { name: "Save card" }).click(),
  ]);
  await expect(card.getByText(/^Due /)).toHaveCount(0);
  await expect(card.getByText(/^Overdue /)).toHaveCount(0);
});

test("sets, edits, and clears a card's labels", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByLabel("New card title").fill("Tagged card");
  await firstColumn.getByLabel("New card labels").fill("bug, urgent");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards$/, "POST"),
    firstColumn.getByRole("button", { name: "Add card" }).click(),
  ]);

  const cardByText = firstColumn
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "Tagged card" });
  await expect(cardByText.getByText("bug")).toBeVisible();
  await expect(cardByText.getByText("urgent")).toBeVisible();
  const cardId = await cardByText.getAttribute("data-testid");
  if (!cardId) {
    throw new Error("Created card did not have a stable test id.");
  }
  const card = page.getByTestId(cardId);

  await card.getByLabel("Edit Tagged card").click();
  await card.getByLabel("Labels").fill("design");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "PATCH"),
    card.getByRole("button", { name: "Save card" }).click(),
  ]);
  await expect(card.getByText("design")).toBeVisible();
  await expect(card.getByText("bug")).toHaveCount(0);

  await card.getByLabel("Edit Tagged card").click();
  await card.getByLabel("Labels").fill("");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards\/\d+$/, "PATCH"),
    card.getByRole("button", { name: "Save card" }).click(),
  ]);
  await expect(card.getByText("design")).toHaveCount(0);
});

test("uses AI through FastAPI and preserves validated changes", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByLabel("New card title").fill("Manual before AI");
  await firstColumn
    .getByLabel("New card details")
    .fill("Manual edit in the complete flow");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/cards$/, "POST"),
    firstColumn.getByRole("button", { name: "Add card" }).click(),
  ]);
  await expect(page.getByText("Manual before AI")).toBeVisible();

  await page.getByRole("button", { name: "Ask AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask AI" });
  const message = dialog.getByLabel("Message");
  await expect(message).toBeFocused();

  await message.fill("Summarize the board without changes");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/ai\/chat$/, "POST"),
    dialog.getByRole("button", { name: "Send" }).click(),
  ]);
  await expect(
    dialog.getByText("I reviewed the current board and made no changes.")
  ).toBeVisible();

  await message.fill("Make a single AI change");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/ai\/chat$/, "POST"),
    dialog.getByRole("button", { name: "Send" }).click(),
  ]);
  await expect(page.getByText("AI single card")).toBeVisible();

  await message.fill("Make multiple AI changes");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/ai\/chat$/, "POST"),
    dialog.getByRole("button", { name: "Send" }).click(),
  ]);
  await expect(page.getByText("AI edited card")).toBeVisible();
  await expect(page.getByText("AI batch card")).toBeVisible();
  const aiBatchCard = page
    .locator('[data-testid^="card-"]')
    .filter({ hasText: "AI batch card" });
  await expect(aiBatchCard.getByText(/^Due /)).toBeVisible();
  await expect(aiBatchCard.getByText("ai", { exact: true })).toBeVisible();
  await expect(aiBatchCard.getByText("batch", { exact: true })).toBeVisible();

  await message.fill("Return a malformed response");
  const malformedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/ai/chat") &&
      response.status() === 502
  );
  await dialog.getByRole("button", { name: "Send" }).click();
  await malformedResponse;
  await expect(dialog.getByRole("alert")).toContainText(
    "AI service returned an invalid response"
  );
  await expect(message).toHaveValue("Return a malformed response");
  await expect(page.getByText("AI single card")).toBeVisible();

  await message.fill("Fail once then summarize");
  const firstAttempt = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/ai/chat") &&
      response.status() === 502
  );
  await dialog.getByRole("button", { name: "Send" }).click();
  await firstAttempt;
  await expect(message).toHaveValue("Fail once then summarize");
  await Promise.all([
    waitForMutation(page, /\/api\/boards\/\d+\/ai\/chat$/, "POST"),
    dialog.getByRole("button", { name: "Send" }).click(),
  ]);
  await expect(message).toHaveValue("");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByText("Manual before AI")).toBeVisible();
  await expect(page.getByText("AI single card")).toBeVisible();
  await expect(page.getByText("AI batch card")).toBeVisible();
  await page.getByRole("button", { name: "Ask AI" }).click();
  await expect(
    page.getByText(/Try “Summarize this board”/)
  ).toBeVisible();
  await expect(
    page.getByText("I reviewed the current board and made no changes.")
  ).toHaveCount(0);
});

test("keeps login, board forms, and chat usable from the keyboard on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto("/");
  await page.getByLabel("Username").focus();
  await page.getByLabel("Username").fill("user");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.getByLabel("Password").fill("password");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();

  await page.getByRole("button", { name: "Ask AI" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Ask AI" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("width", "375px");
  await expect(dialog.getByLabel("Message")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask AI" })).toBeFocused();
});
