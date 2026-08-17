import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { ApiBoard } from "@/lib/api";
import { cloneBoard } from "@/test/fixtures";

const response = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

const boardSummaries = () => [{ id: 1, name: "Board", position: 0 }];

describe("KanbanBoard", () => {
  const fetchMock = vi.fn();
  const onSessionExpired = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const renderBoard = () =>
    render(<KanbanBoard onSessionExpired={onSessionExpired} />);

  it("loads the canonical board from the API", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));

    renderBoard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading board");
    expect(await screen.findByText("Server card")).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByDisplayValue("Server backlog")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/boards", {
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/1", {
      credentials: "same-origin",
    });
  });

  it("filters cards by search query without removing them from the DOM", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    const firstCard = screen.getByTestId("card-101");
    const secondCard = screen.getByTestId("card-102");
    expect(firstCard.className).not.toContain("hidden");
    expect(secondCard.className).not.toContain("hidden");

    await user.type(screen.getByLabelText("Search cards"), "Second");

    expect(firstCard.className).toContain("hidden");
    expect(secondCard.className).not.toContain("hidden");
    expect(screen.getByText("1 of 2 cards")).toBeVisible();

    await user.clear(screen.getByLabelText("Search cards"));
    await user.type(screen.getByLabelText("Search cards"), "no such card");

    expect(screen.getByText("No matching cards")).toBeVisible();

    await user.click(screen.getByLabelText("Clear search"));
    expect(screen.getByLabelText("Search cards")).toHaveValue("");
    expect(firstCard.className).not.toContain("hidden");
    expect(secondCard.className).not.toContain("hidden");
  });

  it("focuses search on '/' and clears it on Escape", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    const searchInput = screen.getByLabelText("Search cards");
    expect(searchInput).not.toHaveFocus();

    await user.keyboard("/");
    expect(searchInput).toHaveFocus();

    await user.type(searchInput, "Second");
    expect(searchInput).toHaveValue("Second");

    await user.keyboard("{Escape}");
    expect(searchInput).toHaveValue("");
  });

  it("does not hijack '/' while typing in another field", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    const renameInput = screen.getByDisplayValue(cloneBoard().columns[0].title);
    await user.click(renameInput);
    await user.keyboard("/");

    expect(renameInput).toHaveValue(`${cloneBoard().columns[0].title}/`);
    expect(screen.getByLabelText("Search cards")).not.toHaveFocus();
  });

  it("renames a column with the canonical API response", async () => {
    const renamed = cloneBoard();
    renamed.columns[0].title = "Persistent ideas";
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(200, renamed));
    const user = userEvent.setup();
    renderBoard();

    const column = await screen.findByTestId("column-10");
    const input = within(column).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Persistent ideas");
    await user.click(within(column).getByLabelText("Save column title"));

    expect(await screen.findByDisplayValue("Persistent ideas")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/columns/10",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Persistent ideas" }),
      })
    );
  });

  it("creates, edits, and deletes a card through the API", async () => {
    const added = cloneBoard();
    added.columns[0].cards.push({
      id: 103,
      title: "New card",
      details: "Notes",
      due_date: "",
      labels: "",
      position: 2,
    });
    const edited = structuredClone(added);
    edited.columns[0].cards[2] = {
      ...edited.columns[0].cards[2],
      title: "Edited card",
      details: "Updated notes",
    };
    const deleted = cloneBoard();
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(201, added))
      .mockResolvedValueOnce(response(200, edited))
      .mockResolvedValueOnce(response(200, deleted));
    const user = userEvent.setup();
    renderBoard();

    const column = await screen.findByTestId("column-10");
    await user.click(within(column).getByRole("button", { name: /add a card/i }));
    await user.type(within(column).getByLabelText("New card title"), "New card");
    await user.type(within(column).getByLabelText("New card details"), "Notes");
    await user.click(within(column).getByRole("button", { name: "Add card" }));

    const createdCard = await screen.findByTestId("card-103");
    await user.click(within(createdCard).getByLabelText("Edit New card"));
    const title = within(createdCard).getByLabelText("Card title");
    const details = within(createdCard).getByLabelText("Card details");
    await user.clear(title);
    await user.type(title, "Edited card");
    await user.clear(details);
    await user.type(details, "Updated notes");
    await user.click(within(createdCard).getByRole("button", { name: "Save card" }));

    const editedCard = await screen.findByTestId("card-103");
    expect(within(editedCard).getByText("Updated notes")).toBeVisible();
    await user.click(within(editedCard).getByLabelText("Delete Edited card"));

    expect(await screen.findByText("Server card")).toBeVisible();
    expect(screen.queryByTestId("card-103")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/cards/103",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("keeps an empty-details card readable", async () => {
    const added = cloneBoard();
    added.columns[0].cards.push({
      id: 103,
      title: "No notes",
      details: "",
      due_date: "",
      labels: "",
      position: 2,
    });
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(201, added));
    const user = userEvent.setup();
    renderBoard();

    const column = await screen.findByTestId("column-10");
    await user.click(within(column).getByRole("button", { name: /add a card/i }));
    await user.type(within(column).getByLabelText("New card title"), "No notes");
    await user.click(within(column).getByRole("button", { name: "Add card" }));

    expect(await screen.findByText("No details yet.")).toBeVisible();
  });

  it("retains draft input and the confirmed board when a mutation fails", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(500, { detail: "Database unavailable" }));
    const user = userEvent.setup();
    renderBoard();

    const column = await screen.findByTestId("column-10");
    const input = within(column).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Unsaved title");
    await user.click(within(column).getByLabelText("Save column title"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "last confirmed board is unchanged"
    );
    expect(input).toHaveValue("Unsaved title");
    expect(screen.getByText("Server backlog")).toBeVisible();
  });

  it("shows load errors, retries, and handles an expired session", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    const user = userEvent.setup();
    const { unmount } = renderBoard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your boards"
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Server card")).toBeVisible();

    unmount();
    fetchMock.mockResolvedValueOnce(response(401, { detail: "Not authenticated" }));
    renderBoard();
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  it("blocks duplicate submissions while a mutation is pending", async () => {
    let resolveCreate: (value: Response) => void = () => undefined;
    const pendingCreate = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const added: ApiBoard = cloneBoard();
    added.columns[0].cards.push({
      id: 103,
      title: "Only once",
      details: "",
      due_date: "",
      labels: "",
      position: 2,
    });
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockReturnValueOnce(pendingCreate);
    const user = userEvent.setup();
    renderBoard();

    const column = await screen.findByTestId("column-10");
    await user.click(within(column).getByRole("button", { name: /add a card/i }));
    await user.type(within(column).getByLabelText("New card title"), "Only once");
    await user.click(within(column).getByRole("button", { name: "Add card" }));

    const pendingButton = within(column).getByRole("button", { name: "Adding..." });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resolveCreate(response(201, added));
    expect(await screen.findByText("Only once")).toBeVisible();
  });

  it("opens chat and replaces the board from a successful AI response", async () => {
    const updated = cloneBoard();
    updated.columns[1].cards.push({
      id: 103,
      title: "Created by AI",
      details: "Canonical response",
      due_date: "",
      labels: "",
      position: 0,
    });
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(
        response(200, { reply: "I created the card.", board: updated })
      );
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    await user.click(screen.getByRole("button", { name: "Ask AI" }));
    await user.type(screen.getByLabelText("Message"), "Create the card");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("I created the card.")).toBeVisible();
    expect(screen.getByText("Created by AI")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/ai/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Create the card", history: [] }),
      })
    );
  });

  it("creates a new board and switches to it", async () => {
    const createdBoard: ApiBoard = {
      id: 2,
      name: "Personal",
      columns: cloneBoard().columns.map((column) => ({ ...column, cards: [] })),
    };
    fetchMock
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(201, createdBoard));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board name"), "Personal");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByText("Personal", { selector: "p" })).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Personal" }),
      })
    );
  });

  it("renames a board and deletes a second board", async () => {
    const secondBoard: ApiBoard = {
      id: 2,
      name: "Second",
      columns: cloneBoard().columns.map((column) => ({ ...column, cards: [] })),
    };
    const renamed = { id: 1, name: "Renamed board", columns: cloneBoard().columns };
    fetchMock
      .mockResolvedValueOnce(
        response(200, [
          { id: 1, name: "Board", position: 0 },
          { id: 2, name: "Second", position: 1 },
        ])
      )
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(200, renamed))
      .mockResolvedValueOnce(response(200, secondBoard))
      .mockResolvedValueOnce(
        response(200, [{ id: 1, name: "Renamed board", position: 0 }])
      )
      .mockResolvedValueOnce(response(200, renamed));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    await user.click(screen.getByRole("button", { name: "Rename Board" }));
    const renameInput = screen.getByLabelText("Rename board Board");
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed board");
    await user.click(screen.getByRole("button", { name: "Save board name" }));

    expect(await screen.findByText("Renamed board", { selector: "p" })).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed board" }),
      })
    );

    await user.click(screen.getByRole("button", { name: "Second" }));
    await screen.findByRole("button", { name: "Delete Second" });
    await user.click(screen.getByRole("button", { name: "Delete Second" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/2",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(
      await screen.findByText("Renamed board", { selector: "button" })
    ).toBeVisible();
  });

  it("switches boards and surfaces a delete error from the API", async () => {
    const secondBoard: ApiBoard = {
      id: 2,
      name: "Second",
      columns: cloneBoard().columns.map((column) => ({ ...column, cards: [] })),
    };
    const twoSummaries = [
      { id: 1, name: "Board", position: 0 },
      { id: 2, name: "Second", position: 1 },
    ];
    fetchMock
      .mockResolvedValueOnce(response(200, twoSummaries))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(200, secondBoard))
      .mockResolvedValueOnce(response(409, { detail: "Cannot delete your last board" }));
    const user = userEvent.setup();
    renderBoard();

    await screen.findByText("Server card");
    await user.click(screen.getByRole("button", { name: "Second" }));
    expect(await screen.findByText("Second", { selector: "p" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete Second" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "can't delete your last board"
    );
  });
});
