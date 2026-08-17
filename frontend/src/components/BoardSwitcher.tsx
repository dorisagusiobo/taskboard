"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  activeBoardId: number;
  isDisabled: boolean;
  onSelect: (boardId: number) => void;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (boardId: number, name: string) => Promise<boolean>;
  onDelete: (boardId: number) => Promise<boolean>;
};

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  isDisabled,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const busy = isDisabled || isBusy;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      return;
    }
    setIsBusy(true);
    const created = await onCreate(name);
    setIsBusy(false);
    if (created) {
      setNewName("");
      setIsCreating(false);
    }
  };

  const startRename = (board: BoardSummary) => {
    setRenamingId(board.id);
    setRenameValue(board.name);
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>, boardId: number) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      return;
    }
    setIsBusy(true);
    const renamed = await onRename(boardId, name);
    setIsBusy(false);
    if (renamed) {
      setRenamingId(null);
    }
  };

  const handleDelete = async (boardId: number) => {
    if (busy) {
      return;
    }
    setIsBusy(true);
    await onDelete(boardId);
    setIsBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Boards">
      {boards.map((board) =>
        renamingId === board.id ? (
          <form
            key={board.id}
            onSubmit={(event) => handleRename(event, board.id)}
            className="flex items-center gap-1 rounded-full border border-[var(--primary-blue)] bg-white px-3 py-1.5"
          >
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              disabled={busy}
              maxLength={100}
              autoFocus
              className="w-32 bg-transparent text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] outline-none disabled:opacity-60"
              aria-label={`Rename board ${board.name}`}
            />
            <button
              type="submit"
              disabled={busy || !renameValue.trim()}
              className="flex items-center justify-center rounded-full p-1 text-[var(--primary-blue)] disabled:opacity-40"
              aria-label="Save board name"
              title="Save board name"
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRenamingId(null)}
              className="flex items-center justify-center rounded-full p-1 text-[var(--gray-text)] disabled:opacity-40"
              aria-label="Cancel rename"
            >
              &times;
            </button>
          </form>
        ) : (
          <div
            key={board.id}
            className={clsx(
              "group flex items-center gap-1 rounded-full border px-1 py-1 pl-4 text-xs font-semibold uppercase tracking-wide transition",
              board.id === activeBoardId
                ? "border-[var(--secondary-purple)] bg-[var(--secondary-purple)] text-white"
                : "border-[var(--stroke)] bg-white text-[var(--navy-dark)] hover:border-[var(--secondary-purple)]"
            )}
          >
            <button
              type="button"
              disabled={busy}
              aria-pressed={board.id === activeBoardId}
              onClick={() => onSelect(board.id)}
              className="disabled:opacity-60"
            >
              {board.name}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => startRename(board)}
              aria-label={`Rename ${board.name}`}
              title="Rename board"
              className={clsx(
                "flex items-center justify-center rounded-full p-1 transition disabled:opacity-40",
                board.id === activeBoardId
                  ? "text-white/80 hover:text-white"
                  : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
              )}
            >
              <PencilIcon />
            </button>
            {boards.length > 1 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(board.id)}
                aria-label={`Delete ${board.name}`}
                title="Delete board"
                className={clsx(
                  "flex items-center justify-center rounded-full p-1 transition disabled:opacity-40",
                  board.id === activeBoardId
                    ? "text-white/80 hover:text-white"
                    : "text-[var(--gray-text)] hover:text-red-600"
                )}
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>
        )
      )}

      {isCreating ? (
        <form
          onSubmit={handleCreate}
          className="flex items-center gap-1 rounded-full border border-dashed border-[var(--primary-blue)] bg-white px-3 py-1.5"
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            disabled={busy}
            maxLength={100}
            autoFocus
            placeholder="Board name"
            className="w-32 bg-transparent text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--gray-text)] disabled:opacity-60"
            aria-label="New board name"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="flex items-center justify-center rounded-full p-1 text-[var(--primary-blue)] disabled:opacity-40"
            aria-label="Create board"
            title="Create board"
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setIsCreating(false);
              setNewName("");
            }}
            className="flex items-center justify-center rounded-full p-1 text-[var(--gray-text)] disabled:opacity-40"
            aria-label="Cancel new board"
          >
            &times;
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] disabled:opacity-40"
        >
          <PlusIcon />
          New board
        </button>
      )}
    </div>
  );
};
