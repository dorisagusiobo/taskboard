"use client";

import { useEffect, useState } from "react";
import { AlertIcon, CloseIcon, SpinnerIcon } from "@/components/icons";
import { ApiError, getRiskReport, type RiskFinding, type RiskReport } from "@/lib/api";

type RiskReportPanelProps = {
  boardId: number;
  isDisabled: boolean;
  onSessionExpired: () => void;
};

const GROUPS: { kind: RiskFinding["kind"]; title: string; tone: string }[] = [
  { kind: "overdue", title: "Overdue", tone: "text-red-700" },
  { kind: "due_soon", title: "Due soon", tone: "text-[var(--navy-dark)]" },
  { kind: "no_due_date", title: "Active work with no due date", tone: "text-[var(--gray-text)]" },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const describeFinding = (finding: RiskFinding): string => {
  if (finding.kind === "overdue") {
    return `${plural(finding.days, "day")} overdue`;
  }
  if (finding.kind === "due_soon") {
    if (finding.days === 0) return "Due today";
    if (finding.days === 1) return "Due tomorrow";
    return `Due in ${finding.days} days`;
  }
  return "No due date";
};

export const RiskReportPanel = ({ boardId, isDisabled, onSessionExpired }: RiskReportPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  const loadReport = async () => {
    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    try {
      setReport(await getRiskReport(boardId));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
        return;
      }
      setReport(null);
      setError("Couldn't check this board. Try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const trigger = (
    <button
      type="button"
      disabled={isDisabled || isLoading}
      onClick={loadReport}
      className="flex items-center gap-2 rounded-full border border-[var(--accent-yellow)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <AlertIcon />
      {isOpen ? "Check again" : "What's at risk"}
    </button>
  );

  if (!isOpen) {
    return trigger;
  }

  return (
    <div className="relative">
      {trigger}
      <section
        aria-label="Risk report"
        aria-busy={isLoading}
        className="absolute left-0 top-full z-20 mt-2 w-[min(36rem,calc(100vw-4rem))] rounded-3xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            What&apos;s at risk
          </h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close risk report"
            className="text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div aria-live="polite" className="mt-3 space-y-4 text-sm leading-6 text-[var(--navy-dark)]">
          {isLoading ? (
            <p className="flex items-center gap-2 text-[var(--gray-text)]">
              <SpinnerIcon className="animate-spin" />
              Checking the board...
            </p>
          ) : error ? (
            <p className="font-semibold text-red-700">{error}</p>
          ) : report && report.findings.length === 0 ? (
            <p>
              Nothing at risk. No cards are overdue or due in the next three days, and all work in
              progress or review has a due date.
            </p>
          ) : report ? (
            <>
              {report.summary ? (
                <div>
                  <p>{report.summary}</p>
                  {report.next_steps.length > 0 ? (
                    <>
                      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                        Suggested next steps
                      </h3>
                      <ol className="mt-1 list-decimal space-y-1 pl-5">
                        {report.next_steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--gray-text)]">
                    Summary written by AI from the cards listed below.
                  </p>
                </div>
              ) : (
                <p className="text-[var(--gray-text)]">
                  The AI summary isn&apos;t available right now. Here&apos;s what the board shows.
                </p>
              )}

              {GROUPS.map((group) => {
                const findings = report.findings.filter((finding) => finding.kind === group.kind);
                if (findings.length === 0) return null;
                return (
                  <div key={group.kind}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wide ${group.tone}`}>
                      {group.title} ({findings.length})
                    </h3>
                    <ul className="mt-1 space-y-1">
                      {findings.map((finding) => (
                        <li key={finding.card_id} className="flex flex-wrap gap-x-2">
                          <span className="font-semibold">{finding.title}</span>
                          <span className="text-[var(--gray-text)]">
                            {finding.column} &middot; {describeFinding(finding)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};
