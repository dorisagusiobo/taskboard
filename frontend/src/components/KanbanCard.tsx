import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  isDisabled: boolean;
  onEdit: (cardId: number, title: string, details: string) => Promise<boolean>;
  onDelete: (cardId: number) => Promise<boolean>;
};

export const KanbanCard = ({
  card,
  isDisabled,
  onEdit,
  onDelete,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: isDisabled || isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isBusy = isDisabled || isSaving || isDeleting;

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }

    setIsSaving(true);
    const saved = await onEdit(card.id, nextTitle, details.trim());
    if (saved) {
      setIsEditing(false);
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (isBusy) {
      return;
    }
    setIsDeleting(true);
    await onDelete(card.id);
    setIsDeleting(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleEdit} className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Card title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isBusy}
              maxLength={200}
              required
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Card details
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              disabled={isBusy}
              maxLength={4000}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--gray-text)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isBusy || !title.trim()}
              className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save card"}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setTitle(card.title);
                setDetails(card.details);
                setIsEditing(false);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div>
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details || "No details yet."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              ref={setActivatorNodeRef}
              type="button"
              disabled={isBusy}
              className="cursor-grab rounded-full border border-[var(--stroke)] px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Drag ${card.title}`}
              {...attributes}
              {...listeners}
            >
              Drag
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setIsEditing(true)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)] disabled:opacity-50"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleDelete()}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)] disabled:opacity-50"
              aria-label={`Delete ${card.title}`}
            >
              {isDeleting ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
