import type { ApiBoard } from "@/lib/api";

export const apiBoard: ApiBoard = {
  id: 1,
  columns: [
    {
      id: 10,
      title: "Server backlog",
      position: 0,
      cards: [
        {
          id: 101,
          title: "Server card",
          details: "Loaded from SQLite",
          position: 0,
        },
        {
          id: 102,
          title: "Second card",
          details: "Another persisted card",
          position: 1,
        },
      ],
    },
    { id: 20, title: "Discovery", position: 1, cards: [] },
    { id: 30, title: "In Progress", position: 2, cards: [] },
    { id: 40, title: "Review", position: 3, cards: [] },
    { id: 50, title: "Done", position: 4, cards: [] },
  ],
};

export const cloneBoard = (): ApiBoard => structuredClone(apiBoard);
