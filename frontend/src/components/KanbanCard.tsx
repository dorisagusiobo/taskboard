import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  CalendarIcon,
  GripIcon,
  PencilIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
import {
  formatLabels,
  isOverdue,
  labelAccent,
  parseLabels,
  type Card,
} from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  isDisabled: boolean;
  isVisible?: boolean;
  onEdit: (
    cardId: number,
    title: string,
    details: string,
    dueDate: string,
    labels: string[]
  ) => Promise<boolean>;
  onDelete: (cardId: number) => Promise<boolean>;
};

const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const LABEL_ACCENT_CLASSES = [
  "bg-[var(--accent-yellow)]/15 text-[var(--navy-dark)]",
  "bg-[var(--primary-blue)]/15 text-[var(--primary-blue)]",
  "bg-[var(--secondary-purple)]/15 text-[var(--secondary-purple)]",
];

export const KanbanCard = ({
  card,
  isDisabled,
  isVisible = true,
  onEdit,
  onDelete,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [dueDate, setDueDate] = useState(card.dueDate);
  const [labels, setLabels] = useState(formatLabels(card.labels));
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
    const saved = await onEdit(
      card.id,
      nextTitle,
      details.trim(),
      dueDate,
      parseLabels(labels)
    );
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
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
        !isVisible && !isEditing && "hidden"
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
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={isBusy}
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Labels
            <input
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              disabled={isBusy}
              maxLength={200}
              placeholder="bug, urgent"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
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
                setDueDate(card.dueDate);
                setLabels(formatLabels(card.labels));
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
            {card.labels.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {card.labels.map((label) => (
                  <span
                    key={label}
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      LABEL_ACCENT_CLASSES[labelAccent(label)]
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details || "No details yet."}
            </p>
            {card.dueDate ? (
              <span
                className={clsx(
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  isOverdue(card.dueDate)
                    ? "bg-red-50 text-red-600"
                    : "bg-[var(--surface)] text-[var(--gray-text)]"
                )}
              >
                <CalendarIcon />
                {isOverdue(card.dueDate) ? "Overdue " : "Due "}
                {formatDueDate(card.dueDate)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <button
              ref={setActivatorNodeRef}
              type="button"
              disabled={isBusy}
              className="flex cursor-grab items-center justify-center rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Drag ${card.title}`}
              title="Drag to move"
              {...attributes}
              {...listeners}
            >
              <GripIcon />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setIsEditing(true)}
                className="flex items-center justify-center rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--primary-blue)] disabled:opacity-50"
                aria-label={`Edit ${card.title}`}
                title="Edit card"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleDelete()}
                className="flex items-center justify-center rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                aria-label={`Delete ${card.title}`}
                title="Delete card"
              >
                {isDeleting ? (
                  <SpinnerIcon />
                ) : (
                  <TrashIcon />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
