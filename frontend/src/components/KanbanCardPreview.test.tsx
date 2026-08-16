import { render, screen } from "@testing-library/react";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";

describe("KanbanCardPreview", () => {
  it("renders the dragged card content", () => {
    render(
      <KanbanCardPreview
        card={{ id: 1, title: "Preview title", details: "Preview details" }}
      />
    );

    expect(screen.getByRole("heading", { name: "Preview title" })).toBeVisible();
    expect(screen.getByText("Preview details")).toBeVisible();
  });
});
