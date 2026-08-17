export type Card = {
  id: number;
  title: string;
  details: string;
  dueDate: string;
  labels: string[];
};

export type Column = {
  id: number;
  title: string;
  cardIds: number[];
};

export type BoardData = {
  id: number;
  name: string;
  columns: Column[];
  cards: Record<number, Card>;
};

export const isOverdue = (
  dueDate: string,
  today: string = new Date().toISOString().slice(0, 10)
): boolean => dueDate !== "" && dueDate < today;

export const parseLabels = (labels: string): string[] =>
  labels === ""
    ? []
    : labels
        .split(",")
        .map((label) => label.trim())
        .filter((label) => label !== "");

export const formatLabels = (labels: string[]): string => labels.join(",");

const LABEL_ACCENT_COUNT = 3;

export const labelAccent = (label: string): number => {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) & 0xffffffff;
  }
  return Math.abs(hash) % LABEL_ACCENT_COUNT;
};

export type ExportRow = {
  column: string;
  title: string;
  details: string;
  dueDate: string;
  labels: string;
};

export const boardToExportRows = (board: BoardData): ExportRow[] =>
  board.columns.flatMap((column) =>
    column.cardIds.map((cardId) => {
      const card = board.cards[cardId];
      return {
        column: column.title,
        title: card.title,
        details: card.details,
        dueDate: card.dueDate,
        labels: formatLabels(card.labels),
      };
    })
  );

const CSV_HEADER = ["Column", "Title", "Details", "Due Date", "Labels"];

const escapeCsvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const rowsToCsv = (rows: ExportRow[]): string => {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [row.column, row.title, row.details, row.dueDate, row.labels]
        .map(escapeCsvField)
        .join(",")
    );
  }
  return lines.join("\r\n");
};

export const cardMatchesQuery = (card: Card, query: string): boolean => {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return true;
  }
  const haystack = [card.title, card.details, ...card.labels]
    .join(" ")
    .toLowerCase();
  return haystack.includes(trimmed);
};

const isColumnId = (columns: Column[], id: number) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: number) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: number,
  overId: number
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};
