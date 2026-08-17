"use client";

import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons";

type ChangePasswordFormProps = {
  isSubmitting: boolean;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<boolean>;
};

export const ChangePasswordForm = ({
  isSubmitting,
  onSubmit,
}: ChangePasswordFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const close = () => {
    setIsOpen(false);
    setCurrentPassword("");
    setNewPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await onSubmit(currentPassword, newPassword);
    if (saved) {
      close();
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
      >
        Change password
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--primary-blue)] bg-white px-3 py-2"
    >
      <input
        type="password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        disabled={isSubmitting}
        placeholder="Current password"
        aria-label="Current password"
        autoComplete="current-password"
        required
        className="w-36 rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
      />
      <input
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        disabled={isSubmitting}
        placeholder="New password"
        aria-label="New password"
        autoComplete="new-password"
        minLength={8}
        required
        className="w-36 rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isSubmitting || !currentPassword || newPassword.length < 8}
        aria-label="Save new password"
        title="Save new password"
        className="flex items-center justify-center rounded-full border border-[var(--stroke)] p-1.5 text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={close}
        aria-label="Cancel password change"
        title="Cancel"
        className="flex items-center justify-center rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)] disabled:opacity-40"
      >
        <CloseIcon />
      </button>
    </form>
  );
};
