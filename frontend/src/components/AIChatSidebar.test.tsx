import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { ApiError, type ChatMessage } from "@/lib/api";

describe("AIChatSidebar", () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn<
    (message: string, history: ChatMessage[]) => Promise<string>
  >();

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderSidebar = (isBoardBusy = false) =>
    render(
      <AIChatSidebar
        isOpen
        isBoardBusy={isBoardBusy}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

  it("opens as an accessible dialog, focuses the message, and closes", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.getByRole("dialog", { name: "Ask AI" })).toBeVisible();
    expect(screen.getByLabelText("Message")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("submits messages and includes the prior conversation as history", async () => {
    onSubmit
      .mockResolvedValueOnce("There are two cards.")
      .mockResolvedValueOnce("No change needed.");
    const user = userEvent.setup();
    renderSidebar();

    await user.type(screen.getByLabelText("Message"), "Summarize the board");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("There are two cards.")).toBeVisible();
    expect(screen.getByText("Summarize the board")).toBeVisible();
    expect(onSubmit).toHaveBeenNthCalledWith(1, "Summarize the board", []);

    await user.type(screen.getByLabelText("Message"), "What next?");
    await user.keyboard("{Enter}");

    expect(await screen.findByText("No change needed.")).toBeVisible();
    expect(onSubmit).toHaveBeenNthCalledWith(2, "What next?", [
      { role: "user", content: "Summarize the board" },
      { role: "assistant", content: "There are two cards." },
    ]);
  });

  it("shows pending state and prevents duplicate submissions", async () => {
    let resolveReply: (reply: string) => void = () => undefined;
    onSubmit.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveReply = resolve;
      })
    );
    const user = userEvent.setup();
    renderSidebar();

    await user.type(screen.getByLabelText("Message"), "Create a card");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();

    resolveReply("Created it.");
    expect(await screen.findByText("Created it.")).toBeVisible();
  });

  it("keeps the draft for retry after a controlled error", async () => {
    onSubmit
      .mockRejectedValueOnce(new ApiError("AI service is unavailable", 502))
      .mockResolvedValueOnce("Done on retry.");
    const user = userEvent.setup();
    renderSidebar();

    const message = screen.getByLabelText("Message");
    await user.type(message, "Move the card");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI service is unavailable. Your board is unchanged."
    );
    expect(message).toHaveValue("Move the card");

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Done on retry.")).toBeVisible();
    expect(message).toHaveValue("");
  });

  it("disables submission while another board mutation is active", async () => {
    const user = userEvent.setup();
    renderSidebar(true);

    await user.type(screen.getByLabelText("Message"), "Create a card");

    expect(screen.getByRole("button", { name: "Board busy" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders assistant content as plain text", async () => {
    onSubmit.mockResolvedValueOnce("<strong>Board updated</strong>");
    const user = userEvent.setup();
    renderSidebar();

    await user.type(screen.getByLabelText("Message"), "Show response");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("<strong>Board updated</strong>")).toBeVisible();
    expect(document.querySelector("strong")).not.toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <AIChatSidebar
        isOpen={false}
        isBoardBusy={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
