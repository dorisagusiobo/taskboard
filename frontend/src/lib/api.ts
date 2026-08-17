import type { BoardData, Card, Column } from "@/lib/kanban";

export type Session = {
  username: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResult = {
  reply: string;
  board: ApiBoard | null;
};

type ApiCard = Card & {
  position: number;
};

type ApiColumn = Omit<Column, "cardIds"> & {
  position: number;
  cards: ApiCard[];
};

export type ApiBoard = {
  id: number;
  columns: ApiColumn[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // The status remains sufficient when an error body is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

const jsonOptions = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getSession = () => request<Session>("/api/auth/me");

export const login = (username: string, password: string) =>
  request<Session>(
    "/api/auth/login",
    jsonOptions("POST", { username, password })
  );

export const register = (username: string, password: string) =>
  request<Session>(
    "/api/auth/register",
    jsonOptions("POST", { username, password })
  );

export const logout = () =>
  request<void>("/api/auth/logout", { method: "POST" });

export const getBoard = () => request<ApiBoard>("/api/board");

export const renameColumn = (columnId: number, title: string) =>
  request<ApiBoard>(
    `/api/board/columns/${columnId}`,
    jsonOptions("PATCH", { title })
  );

export const createCard = (
  columnId: number,
  title: string,
  details: string
) =>
  request<ApiBoard>(
    "/api/board/cards",
    jsonOptions("POST", { column_id: columnId, title, details })
  );

export const updateCard = (
  cardId: number,
  title: string,
  details: string
) =>
  request<ApiBoard>(
    `/api/board/cards/${cardId}`,
    jsonOptions("PATCH", { title, details })
  );

export const deleteCard = (cardId: number) =>
  request<ApiBoard>(`/api/board/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (
  cardId: number,
  columnId: number,
  position: number
) =>
  request<ApiBoard>(
    `/api/board/cards/${cardId}/move`,
    jsonOptions("POST", { column_id: columnId, position })
  );

export const sendAIMessage = (message: string, history: ChatMessage[]) =>
  request<AIChatResult>(
    "/api/ai/chat",
    jsonOptions("POST", { message, history: history.slice(-20) })
  );

export const toBoardData = (board: ApiBoard): BoardData => {
  const cards = Object.fromEntries(
    board.columns.flatMap((column) =>
      column.cards.map((card) => [
        card.id,
        { id: card.id, title: card.title, details: card.details },
      ])
    )
  );

  return {
    id: board.id,
    columns: board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      cardIds: column.cards.map((card) => card.id),
    })),
    cards,
  };
};
