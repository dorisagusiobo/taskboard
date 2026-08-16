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
    fetchMock.mockResolvedValueOnce(response(200, cloneBoard()));

    renderBoard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading board");
    expect(await screen.findByText("Server card")).toBeVisible();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByDisplayValue("Server backlog")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      credentials: "same-origin",
    });
  });

  it("renames a column with the canonical API response", async () => {
    const renamed = cloneBoard();
    renamed.columns[0].title = "Persistent ideas";
    fetchMock
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
      "/api/board/columns/10",
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
      "/api/board/cards/103",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("keeps an empty-details card readable", async () => {
    const added = cloneBoard();
    added.columns[0].cards.push({
      id: 103,
      title: "No notes",
      details: "",
      position: 2,
    });
    fetchMock
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
      .mockResolvedValueOnce(response(200, cloneBoard()));
    const user = userEvent.setup();
    const { unmount } = renderBoard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your board"
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
      position: 2,
    });
    fetchMock
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
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveCreate(response(201, added));
    expect(await screen.findByText("Only once")).toBeVisible();
  });

  it("opens chat and replaces the board from a successful AI response", async () => {
    const updated = cloneBoard();
    updated.columns[1].cards.push({
      id: 103,
      title: "Created by AI",
      details: "Canonical response",
      position: 0,
    });
    fetchMock
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
      "/api/ai/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Create the card", history: [] }),
      })
    );
  });
});
