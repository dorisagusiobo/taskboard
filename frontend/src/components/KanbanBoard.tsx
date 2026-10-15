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
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { ExportBoardMenu } from "@/components/ExportBoardMenu";
import { ChatIcon, CloseIcon, SearchIcon } from "@/components/icons";
import {
  ApiError,
  createBoard,
  createCard,
  deleteBoard,
  deleteCard,
  getBoard,
  listBoards,
  moveCard as moveCardRequest,
  renameBoard,
  renameColumn,
  sendAIMessage,
  toBoardData,
  updateCard,
  type ApiBoard,
  type BoardSummary,
  type ChatMessage,
} from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onSessionExpired: () => void;
};

export const KanbanBoard = ({ onSessionExpired }: KanbanBoardProps) => {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mutationInFlight = useRef(false);
  const chatTriggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadBoard = useCallback(
    async (boardId: number) => {
      try {
        setBoard(toBoardData(await getBoard(boardId)));
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired();
          return;
        }
        setError("Unable to load your board. Please try again.");
      }
    },
    [onSessionExpired]
  );

  const loadBoards = useCallback(async () => {
    setError(null);
    try {
      const summaries = await listBoards();
      setBoards(summaries);
      if (summaries.length > 0) {
        await loadBoard(summaries[0].id);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return;
      }
      setError("Unable to load your boards. Please try again.");
    }
  }, [loadBoard, onSessionExpired]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (
        event.key === "Escape" &&
        document.activeElement === searchInputRef.current &&
        searchQuery
      ) {
        event.preventDefault();
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

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

  const handleSelectBoard = (boardId: number) => {
    if (isMutating || boardId === board?.id) {
      return;
    }
    setSearchQuery("");
    void loadBoard(boardId);
  };

  const handleCreateBoard = async (name: string): Promise<boolean> => {
    if (mutationInFlight.current) {
      return false;
    }
    mutationInFlight.current = true;
    setIsMutating(true);
    setError(null);
    try {
      const created = await createBoard(name);
      setBoards((current) => [
        ...current,
        { id: created.id, name: created.name, position: current.length },
      ]);
      setBoard(toBoardData(created));
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return false;
      }
      setError("Unable to create a new board. Please try again.");
      return false;
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const handleRenameBoard = async (
    boardId: number,
    name: string
  ): Promise<boolean> => {
    if (mutationInFlight.current) {
      return false;
    }
    mutationInFlight.current = true;
    setIsMutating(true);
    setError(null);
    try {
      const renamed = await renameBoard(boardId, name);
      setBoards((current) =>
        current.map((summary) =>
          summary.id === boardId ? { ...summary, name: renamed.name } : summary
        )
      );
      if (board?.id === boardId) {
        setBoard(toBoardData(renamed));
      }
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return false;
      }
      setError("Unable to rename that board. Please try again.");
      return false;
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const handleDeleteBoard = async (boardId: number): Promise<boolean> => {
    if (mutationInFlight.current) {
      return false;
    }
    mutationInFlight.current = true;
    setIsMutating(true);
    setError(null);
    try {
      const remaining = await deleteBoard(boardId);
      setBoards(remaining);
      if (board?.id === boardId && remaining.length > 0) {
        await loadBoard(remaining[0].id);
      }
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return false;
      }
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError("You can't delete your last board.");
        return false;
      }
      setError("Unable to delete that board. Please try again.");
      return false;
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const handleAIMessage = async (
    message: string,
    history: ChatMessage[]
  ): Promise<string> => {
    if (mutationInFlight.current || !board) {
      throw new Error("A board change is already in progress");
    }

    mutationInFlight.current = true;
    setIsMutating(true);
    try {
      const result = await sendAIMessage(board.id, message, history);
      if (result.board) {
        setBoard(toBoardData(result.board));
      }
      return result.reply;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
      }
      throw requestError;
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  };

  const closeChat = () => {
    setIsChatOpen(false);
    chatTriggerRef.current?.focus();
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
        board.id,
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
              onClick={() => void loadBoards()}
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

      <main className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col gap-6 px-6 pb-16 pt-12">
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
                Project workspace
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Taskboard
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Viewing
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  {board.name}
                </p>
              </div>
              <button
                ref={chatTriggerRef}
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--secondary-purple)] focus:ring-offset-2"
              >
                <ChatIcon />
                Ask AI
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <BoardSwitcher
                boards={boards}
                activeBoardId={board.id}
                isDisabled={isMutating}
                onSelect={handleSelectBoard}
                onCreate={handleCreateBoard}
                onRename={handleRenameBoard}
                onDelete={handleDeleteBoard}
              />
              <ExportBoardMenu board={board} isDisabled={isMutating} />
            </div>
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gray-text)]" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search cards... (press /)"
                aria-label="Search cards"
                maxLength={200}
                className="w-full rounded-full border border-[var(--stroke)] bg-white py-2 pl-9 pr-9 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full p-0.5 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
                <span className="truncate">{column.title}</span>
                <span className="ml-auto shrink-0 text-[var(--gray-text)]">
                  {column.cardIds.length}
                </span>
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
          <section className="flex gap-4 overflow-x-auto pb-2">
            {board.columns.map((column) => (
              <KanbanColumn
                key={`${column.id}:${column.title}`}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                isDisabled={isMutating}
                searchQuery={searchQuery}
                onRename={(columnId, title) =>
                  applyMutation(() => renameColumn(board.id, columnId, title))
                }
                onAddCard={(columnId, title, details, dueDate, labels) =>
                  applyMutation(() =>
                    createCard(board.id, columnId, title, details, dueDate, labels)
                  )
                }
                onEditCard={(cardId, title, details, dueDate, labels) =>
                  applyMutation(() =>
                    updateCard(board.id, cardId, title, details, dueDate, labels)
                  )
                }
                onDeleteCard={(cardId) =>
                  applyMutation(() => deleteCard(board.id, cardId))
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
      <AIChatSidebar
        isOpen={isChatOpen}
        isBoardBusy={isMutating}
        onClose={closeChat}
        onSubmit={handleAIMessage}
      />
    </div>
  );
};
