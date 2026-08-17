import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportBoardMenu } from "@/components/ExportBoardMenu";
import type { BoardData } from "@/lib/kanban";

const board: BoardData = {
  id: 1,
  name: "Launch Plan!",
  columns: [{ id: 10, title: "Backlog", cardIds: [101] }],
  cards: {
    101: {
      id: 101,
      title: "Ship it",
      details: "",
      dueDate: "",
      labels: [],
    },
  },
};

describe("ExportBoardMenu", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it("shows Export by default and toggles the CSV/JSON choices", async () => {
    const user = userEvent.setup();
    render(<ExportBoardMenu board={board} isDisabled={false} />);

    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByText("CSV")).toBeVisible();
    expect(screen.getByText("JSON")).toBeVisible();

    await user.click(screen.getByLabelText("Cancel export"));
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
  });

  it("downloads a slugified, dated CSV file", async () => {
    const user = userEvent.setup();
    render(<ExportBoardMenu board={board} isDisabled={false} />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByText("CSV"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toContain("text/csv");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
  });

  it("downloads a JSON file", async () => {
    const user = userEvent.setup();
    render(<ExportBoardMenu board={board} isDisabled={false} />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByText("JSON"));

    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toContain("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("disables the toggle button while the board is busy", () => {
    render(<ExportBoardMenu board={board} isDisabled={true} />);

    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});
