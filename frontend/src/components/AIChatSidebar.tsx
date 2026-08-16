"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { ChatMessage } from "@/lib/api";

type AIChatSidebarProps = {
  isOpen: boolean;
  isBoardBusy: boolean;
  onClose: () => void;
  onSubmit: (message: string, history: ChatMessage[]) => Promise<string>;
};

const focusableSelector =
  'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export const AIChatSidebar = ({
  isOpen,
  isBoardBusy,
  onClose,
  onSubmit,
}: AIChatSidebarProps) => {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submissionInFlight = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const submitMessage = async () => {
    const message = draft.trim();
    if (!message || submissionInFlight.current || isBoardBusy) {
      return;
    }

    submissionInFlight.current = true;
    setIsPending(true);
    setError(null);
    try {
      const reply = await onSubmit(message, messages.slice(-20));
      setMessages((current) => [
        ...current,
        { role: "user", content: message },
        { role: "assistant", content: reply },
      ]);
      setDraft("");
    } catch (requestError) {
      const detail =
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach the AI assistant";
      setError(`${detail}. Your board is unchanged.`);
    } finally {
      submissionInFlight.current = false;
      setIsPending(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgba(3,33,71,0.28)] backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close AI assistant"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-title"
        className="relative flex h-full w-full flex-col border-l border-[var(--stroke)] bg-[var(--surface)] shadow-[-18px_0_50px_rgba(3,33,71,0.18)] sm:max-w-[430px]"
      >
        <header className="border-b border-[var(--stroke)] bg-white px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 h-1.5 w-12 rounded-full bg-[var(--accent-yellow)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--primary-blue)]">
                Board assistant
              </p>
              <h2
                id="ai-chat-title"
                className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)]"
              >
                Ask AI
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-blue)]"
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
            Ask about this board, or create, edit, and move cards with plain language.
          </p>
        </header>

        <div
          className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-6"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-[var(--stroke)] bg-white p-4 text-sm leading-6 text-[var(--gray-text)]">
              Try “Summarize this board” or “Create a launch checklist card in Backlog.”
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.role === "user"
                    ? "bg-[var(--navy-dark)] text-white"
                    : "border border-[var(--stroke)] bg-white text-[var(--navy-dark)]"
                }`}
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-65">
                  {message.role === "user" ? "You" : "Assistant"}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          ))}
          {isPending ? (
            <div className="flex justify-start" role="status">
              <div className="rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-semibold text-[var(--primary-blue)]">
                Thinking and checking the board...
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="border-t border-[var(--stroke)] bg-white p-5 sm:p-6"
          onSubmit={handleSubmit}
        >
          {error ? (
            <p
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <label
            htmlFor="ai-message"
            className="text-sm font-semibold text-[var(--navy-dark)]"
          >
            Message
          </label>
          <textarea
            ref={inputRef}
            id="ai-message"
            value={draft}
            maxLength={4000}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="What should change on the board?"
            className="mt-2 w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[rgba(32,157,215,0.15)]"
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-xs text-[var(--gray-text)]">Enter to send · Shift+Enter for a new line</p>
            <button
              type="submit"
              disabled={!draft.trim() || isPending || isBoardBusy}
              className="rounded-full bg-[var(--secondary-purple)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--secondary-purple)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Sending..." : isBoardBusy ? "Board busy" : "Send"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};
