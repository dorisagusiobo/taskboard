import { formatLabels, parseLabels, type BoardData, type Card, type Column } from "@/lib/kanban";

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

type ApiCard = Omit<Card, "dueDate" | "labels"> & {
  due_date: string;
  labels: string;
  position: number;
};

type ApiColumn = Omit<Column, "cardIds"> & {
  position: number;
  cards: ApiCard[];
};

export type ApiBoard = {
  id: number;
  name: string;
  columns: ApiColumn[];
};

export type BoardSummary = {
  id: number;
  name: string;
  position: number;
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

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string) =>
  request<ApiBoard>("/api/boards", jsonOptions("POST", { name }));

export const renameBoard = (boardId: number, name: string) =>
  request<ApiBoard>(`/api/boards/${boardId}`, jsonOptions("PATCH", { name }));

export const deleteBoard = (boardId: number) =>
  request<BoardSummary[]>(`/api/boards/${boardId}`, { method: "DELETE" });

export const getBoard = (boardId: number) =>
  request<ApiBoard>(`/api/boards/${boardId}`);

export const renameColumn = (
  boardId: number,
  columnId: number,
  title: string
) =>
  request<ApiBoard>(
    `/api/boards/${boardId}/columns/${columnId}`,
    jsonOptions("PATCH", { title })
  );

export const createCard = (
  boardId: number,
  columnId: number,
  title: string,
  details: string,
  dueDate: string = "",
  labels: string[] = []
) =>
  request<ApiBoard>(
    `/api/boards/${boardId}/cards`,
    jsonOptions("POST", {
      column_id: columnId,
      title,
      details,
      due_date: dueDate,
      labels: formatLabels(labels),
    })
  );

export const updateCard = (
  boardId: number,
  cardId: number,
  title: string,
  details: string,
  dueDate?: string,
  labels?: string[]
) =>
  request<ApiBoard>(
    `/api/boards/${boardId}/cards/${cardId}`,
    jsonOptions("PATCH", {
      title,
      details,
      due_date: dueDate ?? null,
      labels: labels === undefined ? null : formatLabels(labels),
    })
  );

export const deleteCard = (boardId: number, cardId: number) =>
  request<ApiBoard>(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "DELETE",
  });

export const moveCard = (
  boardId: number,
  cardId: number,
  columnId: number,
  position: number
) =>
  request<ApiBoard>(
    `/api/boards/${boardId}/cards/${cardId}/move`,
    jsonOptions("POST", { column_id: columnId, position })
  );

export const sendAIMessage = (
  boardId: number,
  message: string,
  history: ChatMessage[]
) =>
  request<AIChatResult>(
    `/api/boards/${boardId}/ai/chat`,
    jsonOptions("POST", { message, history: history.slice(-20) })
  );

export const toBoardData = (board: ApiBoard): BoardData => {
  const cards = Object.fromEntries(
    board.columns.flatMap((column) =>
      column.cards.map((card) => [
        card.id,
        {
          id: card.id,
          title: card.title,
          details: card.details,
          dueDate: card.due_date,
          labels: parseLabels(card.labels),
        },
      ])
    )
  );

  return {
    id: board.id,
    name: board.name,
    columns: board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      cardIds: column.cards.map((card) => card.id),
    })),
    cards,
  };
};
