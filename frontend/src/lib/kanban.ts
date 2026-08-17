export type Card = {
  id: number;
  title: string;
  details: string;
  dueDate: string;
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
