import {
  ApiError,
  getBoard,
  logout,
  moveCard,
  toBoardData,
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
    });
  });

  it("sends move requests and returns the canonical response", async () => {
    fetchMock.mockResolvedValueOnce(response(200, cloneBoard()));

    const board = await moveCard(101, 20, 0);

    expect(board.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/101/move",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
        body: JSON.stringify({ column_id: 20, position: 0 }),
      })
    );
  });

  it("supports empty responses and exposes HTTP failures", async () => {
    fetchMock
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(500, { detail: "Database unavailable" }));

    await expect(logout()).resolves.toBeUndefined();
    await expect(getBoard()).rejects.toEqual(
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

    await expect(getBoard()).rejects.toEqual(
      new ApiError("Request failed with status 502", 502)
    );
  });
});
