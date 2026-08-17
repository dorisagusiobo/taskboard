"use client";

import { useState } from "react";
import { DownloadIcon } from "@/components/icons";
import { boardToExportRows, rowsToCsv, type BoardData } from "@/lib/kanban";

type ExportBoardMenuProps = {
  board: BoardData;
  isDisabled: boolean;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "board";

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const ExportBoardMenu = ({ board, isDisabled }: ExportBoardMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const baseName = `${slugify(board.name)}-${new Date().toISOString().slice(0, 10)}`;

  const handleExportCsv = () => {
    const csv = rowsToCsv(boardToExportRows(board));
    downloadFile(`${baseName}.csv`, csv, "text/csv;charset=utf-8");
    setIsOpen(false);
  };

  const handleExportJson = () => {
    const json = JSON.stringify(board, null, 2);
    downloadFile(`${baseName}.json`, json, "application/json");
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <DownloadIcon />
        Export
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--primary-blue)] bg-white px-2 py-1.5">
      <button
        type="button"
        onClick={handleExportCsv}
        className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
      >
        CSV
      </button>
      <button
        type="button"
        onClick={handleExportJson}
        className="rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
      >
        JSON
      </button>
      <button
        type="button"
        onClick={() => setIsOpen(false)}
        aria-label="Cancel export"
        className="px-1 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
      >
        &times;
      </button>
    </div>
  );
};
