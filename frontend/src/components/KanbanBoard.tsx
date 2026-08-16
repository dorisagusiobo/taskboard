"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { KanbanColumn } from "@/components/KanbanColumn";
import {
  ApiError,
  createCard,
  deleteCard,
  getBoard,
  moveCard as moveCardRequest,
  renameColumn,
  toBoardData,
  updateCard,
  type ApiBoard,
} from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onSessionExpired: () => void;
};

export const KanbanBoard = ({ onSessionExpired }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const mutationInFlight = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadBoard = useCallback(async () => {
    setError(null);
    try {
      setBoard(toBoardData(await getBoard()));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return;
      }
      setError("Unable to load your board. Please try again.");
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const applyMutation = async (
    mutation: () => Promise<ApiBoard>
  ): Promise<boolean> => {
    if (mutationInFlight.current) {
      return false;
    }

    mutationInFlight.current = true;
    setIsMutating(true);
    setError(null);
    try {
      setBoard(toBoardData(await mutation()));
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return false;
      }
      setError("Unable to save your change. Your last confirmed board is unchanged.");
      return false;
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!isMutating) {
      setActiveCardId(Number(event.active.id));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || isMutating || !over || active.id === over.id) {
      return;
    }

    const cardId = Number(active.id);
    const nextColumns = moveCard(board.columns, cardId, Number(over.id));
    if (nextColumns === board.columns) {
      return;
    }

    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(cardId)
    );
    if (!targetColumn) {
      return;
    }

    void applyMutation(() =>
      moveCardRequest(
        cardId,
        targetColumn.id,
        targetColumn.cardIds.indexOf(cardId)
      )
    );
  };

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);
  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (!board) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6">
        {error ? (
          <>
            <p className="text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadBoard()}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Retry
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-[var(--gray-text)]" role="status">
            Loading board...
          </p>
        )}
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-6 px-6 pb-16 pt-12">
        {error ? (
          <p
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={`${column.id}:${column.title}`}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                isDisabled={isMutating}
                onRename={(columnId, title) =>
                  applyMutation(() => renameColumn(columnId, title))
                }
                onAddCard={(columnId, title, details) =>
                  applyMutation(() => createCard(columnId, title, details))
                }
                onEditCard={(cardId, title, details) =>
                  applyMutation(() => updateCard(cardId, title, details))
                }
                onDeleteCard={(cardId) =>
                  applyMutation(() => deleteCard(cardId))
                }
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
