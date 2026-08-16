import { createId, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end of its current column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");

    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("returns the original columns when a card or target is unknown", () => {
    expect(moveCard(baseColumns, "missing", "card-1")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "missing")).toBe(baseColumns);
  });

  it("does not change the board when a card is dropped on itself", () => {
    expect(moveCard(baseColumns, "card-1", "card-1")).toBe(baseColumns);
  });

  it("does not mutate the original columns", () => {
    moveCard(baseColumns, "card-2", "card-3");

    expect(baseColumns[0].cardIds).toEqual(["card-1", "card-2"]);
    expect(baseColumns[1].cardIds).toEqual(["card-3"]);
  });
});

describe("createId", () => {
  it("combines the prefix with random and time values", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(Date, "now").mockReturnValue(1_000);

    expect(createId("card")).toBe("card-irs");
  });
});
