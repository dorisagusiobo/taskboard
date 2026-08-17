import {
  ApiError,
  createCard,
  getBoard,
  logout,
  moveCard,
  sendAIMessage,
  toBoardData,
  updateCard,
} from "@/lib/api";
import { cloneBoard } from "@/test/fixtures";

const response = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

describe("API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("normalizes the nested API board for the UI", () => {
    const board = toBoardData(cloneBoard());

    expect(board.id).toBe(1);
    expect(board.columns[0].cardIds).toEqual([101, 102]);
    expect(board.cards[101]).toEqual({
      id: 101,
      title: "Server card",
      details: "Loaded from SQLite",
      dueDate: "",
    });
  });

  it("sends move requests and returns the canonical response", async () => {
    fetchMock.mockResolvedValueOnce(response(200, cloneBoard()));

    const board = await moveCard(1, 101, 20, 0);

    expect(board.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/101/move",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        body: JSON.stringify({ column_id: 20, position: 0 }),
      })
    );
  });

  it("sends the due date on create and defaults it to empty", async () => {
    fetchMock.mockResolvedValueOnce(response(201, cloneBoard()));

    await createCard(1, 10, "New card", "Notes", "2026-02-01");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          column_id: 10,
          title: "New card",
          details: "Notes",
          due_date: "2026-02-01",
        }),
      })
    );

    fetchMock.mockResolvedValueOnce(response(201, cloneBoard()));
    await createCard(1, 10, "No date card", "Notes");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/cards",
      expect.objectContaining({
        body: JSON.stringify({
          column_id: 10,
          title: "No date card",
          details: "Notes",
          due_date: "",
        }),
      })
    );
  });

  it("only sends a due date update when one is explicitly provided", async () => {
    fetchMock.mockResolvedValueOnce(response(200, cloneBoard()));

    await updateCard(1, 101, "Title", "Details");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/101",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Title",
          details: "Details",
          due_date: null,
        }),
      })
    );

    fetchMock.mockResolvedValueOnce(response(200, cloneBoard()));
    await updateCard(1, 101, "Title", "Details", "");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/boards/1/cards/101",
      expect.objectContaining({
        body: JSON.stringify({
          title: "Title",
          details: "Details",
          due_date: "",
        }),
      })
    );
  });

  it("supports empty responses and exposes HTTP failures", async () => {
    fetchMock
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(500, { detail: "Database unavailable" }));

    await expect(logout()).resolves.toBeUndefined();
    await expect(getBoard(1)).rejects.toEqual(
      new ApiError("Database unavailable", 500)
    );
  });

  it("falls back to the HTTP status when an error body is unreadable", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 502,
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(getBoard(1)).rejects.toEqual(
      new ApiError("Request failed with status 502", 502)
    );
  });

  it("sends only the latest twenty chat history messages", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, { reply: "No changes.", board: null })
    );
    const history = Array.from({ length: 22 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${index}`,
    }));

    await sendAIMessage(1, "Current request", history);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/ai/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Current request",
          history: history.slice(-20),
        }),
      })
    );
  });
});
