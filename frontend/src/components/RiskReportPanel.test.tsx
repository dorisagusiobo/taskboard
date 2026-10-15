import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describeFinding, RiskReportPanel } from "@/components/RiskReportPanel";
import type { RiskFinding, RiskReport } from "@/lib/api";

const finding = (overrides: Partial<RiskFinding>): RiskFinding => ({
  kind: "overdue",
  card_id: 1,
  title: "Launch email",
  column: "In Progress",
  due_date: "2026-10-10",
  days: 5,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("RiskReportPanel", () => {
  const onSessionExpired = vi.fn();
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    onSessionExpired.mockReset();
  });

  const renderPanel = () =>
    render(<RiskReportPanel boardId={7} isDisabled={false} onSessionExpired={onSessionExpired} />);

  it("shows the AI summary, next steps and grouped findings", async () => {
    const report: RiskReport = {
      findings: [
        finding({}),
        finding({ kind: "due_soon", card_id: 2, title: "Pricing page", days: 1 }),
        finding({ kind: "no_due_date", card_id: 3, title: "Contract", column: "Review", due_date: "", days: 0 }),
      ],
      summary: "Launch email is 5 days overdue.",
      next_steps: ["Finish the launch email today.", "Set a date for Contract."],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(report));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));

    const panel = await screen.findByRole("region", { name: "Risk report" });
    expect(await within(panel).findByText("Launch email is 5 days overdue.")).toBeInTheDocument();
    expect(within(panel).getByText("Finish the launch email today.")).toBeInTheDocument();
    expect(within(panel).getByText("Overdue (1)")).toBeInTheDocument();
    expect(within(panel).getByText("Due soon (1)")).toBeInTheDocument();
    expect(within(panel).getByText("Active work with no due date (1)")).toBeInTheDocument();
    expect(within(panel).getByText(/In Progress · 5 days overdue/)).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/boards/7/risk-report");
    expect(JSON.parse(String((options as RequestInit).body))).toEqual({
      today: new Date().toISOString().slice(0, 10),
    });
  });

  it("lists findings without a summary when the AI is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ findings: [finding({})], summary: null, next_steps: [] })
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));

    expect(await screen.findByText(/AI summary isn.t available right now/)).toBeInTheDocument();
    expect(screen.getByText("Launch email")).toBeInTheDocument();
    expect(screen.queryByText("Suggested next steps")).not.toBeInTheDocument();
  });

  it("says when nothing is at risk", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ findings: [], summary: null, next_steps: [] }));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));

    expect(await screen.findByText(/Nothing at risk/)).toBeInTheDocument();
  });

  it("shows an error, then recovers when checked again", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ findings: [], summary: null, next_steps: [] }));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));
    expect(await screen.findByText(/Couldn't check this board/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText(/Nothing at risk/)).toBeInTheDocument();
  });

  it("signs the user out when the session has expired", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "Not authenticated" }, 401));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));

    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  it("closes with the close button and with Escape", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ findings: [], summary: null, next_steps: [] }));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));
    await screen.findByText(/Nothing at risk/);
    await user.click(screen.getByRole("button", { name: "Close risk report" }));
    expect(screen.queryByRole("region", { name: "Risk report" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "What's at risk" }));
    await screen.findByText(/Nothing at risk/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Risk report" })).not.toBeInTheDocument();
  });

  it("describes how urgent each finding is", () => {
    expect(describeFinding(finding({ days: 1 }))).toBe("1 day overdue");
    expect(describeFinding(finding({ kind: "due_soon", days: 0 }))).toBe("Due today");
    expect(describeFinding(finding({ kind: "due_soon", days: 1 }))).toBe("Due tomorrow");
    expect(describeFinding(finding({ kind: "due_soon", days: 3 }))).toBe("Due in 3 days");
    expect(describeFinding(finding({ kind: "no_due_date", days: 0 }))).toBe("No due date");
  });
});
