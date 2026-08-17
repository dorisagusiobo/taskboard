import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanCard } from "@/components/KanbanCard";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: 1,
  title: "Ship the release",
  details: "Final checks",
  dueDate: "",
  labels: [],
};

describe("KanbanCard", () => {
  it("shows no due date badge when the card has none", () => {
    render(
      <KanbanCard card={baseCard} isDisabled={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.queryByText(/Due|Overdue/)).not.toBeInTheDocument();
  });

  it("shows a neutral due badge for a future date", () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dueDate = futureDate.toISOString().slice(0, 10);

    render(
      <KanbanCard
        card={{ ...baseCard, dueDate }}
        isDisabled={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const badge = screen.getByText(/^Due /);
    expect(badge).toBeVisible();
    expect(badge.className).not.toContain("text-red-600");
  });

  it("shows an overdue badge for a past date", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, dueDate: "2020-01-01" }}
        isDisabled={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const badge = screen.getByText(/^Overdue /);
    expect(badge.className).toContain("text-red-600");
  });

  it("edits the due date and calls onEdit with the new value", async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <KanbanCard card={baseCard} isDisabled={false} onEdit={onEdit} onDelete={vi.fn()} />
    );

    await user.click(screen.getByLabelText("Edit Ship the release"));
    const dueDateInput = screen.getByLabelText("Due date");
    await user.type(dueDateInput, "2026-06-15");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    expect(onEdit).toHaveBeenCalledWith(
      1,
      "Ship the release",
      "Final checks",
      "2026-06-15",
      []
    );
  });

  it("resets the due date draft on cancel", async () => {
    const user = userEvent.setup();
    render(
      <KanbanCard
        card={{ ...baseCard, dueDate: "2026-01-01" }}
        isDisabled={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Edit Ship the release"));
    const dueDateInput = screen.getByLabelText("Due date");
    await user.clear(dueDateInput);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByLabelText("Edit Ship the release"));
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-01-01");
  });

  it("shows no label chips when the card has none", () => {
    render(
      <KanbanCard card={baseCard} isDisabled={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    );

    expect(screen.queryByText("bug")).not.toBeInTheDocument();
  });

  it("shows a chip per label", () => {
    render(
      <KanbanCard
        card={{ ...baseCard, labels: ["bug", "urgent"] }}
        isDisabled={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("bug")).toBeVisible();
    expect(screen.getByText("urgent")).toBeVisible();
  });

  it("edits labels and calls onEdit with the parsed list", async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <KanbanCard card={baseCard} isDisabled={false} onEdit={onEdit} onDelete={vi.fn()} />
    );

    await user.click(screen.getByLabelText("Edit Ship the release"));
    await user.type(screen.getByLabelText("Labels"), "bug, urgent");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    expect(onEdit).toHaveBeenCalledWith(
      1,
      "Ship the release",
      "Final checks",
      "",
      ["bug", "urgent"]
    );
  });

  it("resets the labels draft on cancel", async () => {
    const user = userEvent.setup();
    render(
      <KanbanCard
        card={{ ...baseCard, labels: ["design"] }}
        isDisabled={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText("Edit Ship the release"));
    await user.clear(screen.getByLabelText("Labels"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByLabelText("Edit Ship the release"));
    expect(screen.getByLabelText("Labels")).toHaveValue("design");
  });
});
