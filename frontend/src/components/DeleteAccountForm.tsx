"use client";

import { useState, type FormEvent } from "react";
import { TrashIcon } from "@/components/icons";

type DeleteAccountFormProps = {
  isSubmitting: boolean;
  onSubmit: (password: string) => Promise<boolean>;
};

export const DeleteAccountForm = ({
  isSubmitting,
  onSubmit,
}: DeleteAccountFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");

  const close = () => {
    setIsOpen(false);
    setPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const deleted = await onSubmit(password);
    if (!deleted) {
      setPassword("");
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-full border border-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-600 transition hover:border-red-200 hover:bg-red-50"
      >
        <TrashIcon />
        Delete account
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"
    >
      <p className="max-w-xs text-xs leading-5 text-red-700">
        This permanently deletes your account and every board you own. This
        cannot be undone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          placeholder="Your password"
          aria-label="Confirm password to delete account"
          autoComplete="current-password"
          required
          className="w-36 rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs text-[var(--navy-dark)] outline-none focus:border-red-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSubmitting || !password}
          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Deleting..." : "Delete my account"}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={close}
          className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
