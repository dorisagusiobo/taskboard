import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { CheckIcon, SpinnerIcon } from "@/components/icons";
import type { Card, Column } from "@/lib/kanban";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  isDisabled: boolean;
  onRename: (columnId: number, title: string) => Promise<boolean>;
  onAddCard: (
    columnId: number,
    title: string,
    details: string,
    dueDate: string,
    labels: string[]
  ) => Promise<boolean>;
  onEditCard: (
    cardId: number,
    title: string,
    details: string,
    dueDate: string,
    labels: string[]
  ) => Promise<boolean>;
  onDeleteCard: (cardId: number) => Promise<boolean>;
};

export const KanbanColumn = ({
  column,
  cards,
  isDisabled,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const [title, setTitle] = useState(column.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: isDisabled,
  });

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === column.title) {
      setTitle(column.title);
      return;
    }

    setIsSavingTitle(true);
    await onRename(column.id, nextTitle);
    setIsSavingTitle(false);
  };

  const isBusy = isDisabled || isSavingTitle;

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] min-w-[220px] flex-1 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} cards
            </span>
          </div>
          <form onSubmit={handleRename} className="mt-3 flex items-center gap-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isBusy}
              maxLength={100}
              className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none disabled:opacity-60"
              aria-label="Column title"
            />
            <button
              type="submit"
              disabled={isBusy || title.trim() === column.title}
              className="flex shrink-0 items-center justify-center rounded-full border border-[var(--stroke)] p-1.5 text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Save column title"
              title="Save column title"
            >
              {isSavingTitle ? <SpinnerIcon /> : <CheckIcon />}
            </button>
          </form>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={`${card.id}:${card.title}:${card.details}:${card.dueDate}:${card.labels.join(",")}`}
              card={card}
              isDisabled={isDisabled}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        isDisabled={isDisabled}
        onAdd={(title, details, dueDate, labels) =>
          onAddCard(column.id, title, details, dueDate, labels)
        }
      />
    </section>
  );
};
