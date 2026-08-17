import {
  formatLabels,
  isOverdue,
  labelAccent,
  moveCard,
  parseLabels,
  type Column,
} from "@/lib/kanban";

describe("isOverdue", () => {
  it("is false when there is no due date", () => {
    expect(isOverdue("", "2026-01-15")).toBe(false);
  });

  it("is false for a due date today or in the future", () => {
    expect(isOverdue("2026-01-15", "2026-01-15")).toBe(false);
    expect(isOverdue("2026-01-16", "2026-01-15")).toBe(false);
  });

  it("is true for a due date in the past", () => {
    expect(isOverdue("2026-01-14", "2026-01-15")).toBe(true);
  });
});

describe("parseLabels / formatLabels", () => {
  it("round-trips an empty string as an empty array", () => {
    expect(parseLabels("")).toEqual([]);
    expect(formatLabels([])).toBe("");
  });

  it("splits and joins comma-separated labels", () => {
    expect(parseLabels("bug,urgent")).toEqual(["bug", "urgent"]);
    expect(formatLabels(["bug", "urgent"])).toBe("bug,urgent");
  });

  it("trims whitespace around each label and drops empties from stray commas", () => {
    expect(parseLabels("bug, urgent ,, design")).toEqual([
      "bug",
      "urgent",
      "design",
    ]);
  });
});

describe("labelAccent", () => {
  it("is deterministic for the same label", () => {
    expect(labelAccent("bug")).toBe(labelAccent("bug"));
  });

  it("stays within the accent palette range", () => {
    for (const label of ["bug", "urgent", "design", "backend", ""]) {
      const accent = labelAccent(label);
      expect(accent).toBeGreaterThanOrEqual(0);
      expect(accent).toBeLessThan(3);
    }
  });

  it("can distinguish different labels", () => {
    const accents = new Set(
      ["bug", "urgent", "design", "backend", "frontend"].map(labelAccent)
    );
    expect(accents.size).toBeGreaterThan(1);
  });
});

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: 10, title: "A", cardIds: [1, 2] },
    { id: 20, title: "B", cardIds: [3] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, 2, 1);
    expect(result[0].cardIds).toEqual([2, 1]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, 2, 3);
    expect(result[0].cardIds).toEqual([1]);
    expect(result[1].cardIds).toEqual([2, 3]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, 1, 20);
    expect(result[0].cardIds).toEqual([2]);
    expect(result[1].cardIds).toEqual([3, 1]);
  });

  it("moves a card to the end of its current column", () => {
    const result = moveCard(baseColumns, 1, 10);

    expect(result[0].cardIds).toEqual([2, 1]);
  });

  it("returns the original columns when a card or target is unknown", () => {
    expect(moveCard(baseColumns, 999, 1)).toBe(baseColumns);
    expect(moveCard(baseColumns, 1, 999)).toBe(baseColumns);
  });

  it("does not change the board when a card is dropped on itself", () => {
    expect(moveCard(baseColumns, 1, 1)).toBe(baseColumns);
  });

  it("does not mutate the original columns", () => {
    moveCard(baseColumns, 2, 3);

    expect(baseColumns[0].cardIds).toEqual([1, 2]);
    expect(baseColumns[1].cardIds).toEqual([3]);
  });
});
