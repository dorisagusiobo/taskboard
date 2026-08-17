import { useState, type FormEvent } from "react";
import { PlusIcon } from "@/components/icons";

const initialFormState = { title: "", details: "" };

type NewCardFormProps = {
  isDisabled: boolean;
  onAdd: (title: string, details: string) => Promise<boolean>;
};

export const NewCardForm = ({ isDisabled, onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }

    setIsSubmitting(true);
    const saved = await onAdd(
      formState.title.trim(),
      formState.details.trim()
    );
    if (saved) {
      setFormState(initialFormState);
      setIsOpen(false);
    }
    setIsSubmitting(false);
  };

  const isBusy = isDisabled || isSubmitting;

  return (
    <div className="mt-4">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            aria-label="New card title"
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            disabled={isBusy}
            maxLength={200}
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            aria-label="New card details"
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            disabled={isBusy}
            maxLength={4000}
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              {isSubmitting ? "Adding..." : "Add card"}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setIsOpen(false);
                setFormState(initialFormState);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          <PlusIcon />
          Add a card
        </button>
      )}
    </div>
  );
};
