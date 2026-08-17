import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { cloneBoard } from "@/test/fixtures";

const response = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

const boardSummaries = () => [{ id: 1, name: "Board", position: 0 }];

describe("AuthGate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the login form when there is no active session", async () => {
    fetchMock.mockResolvedValueOnce(response(401));

    render(<AuthGate />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("restores an active session", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { username: "user" }))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(screen.getByText(/signed in as/i)).toHaveTextContent("user");
  });

  it("shows an error for invalid credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(401));
    render(<AuthGate />);

    await userEvent.type(await screen.findByLabelText("Username"), "wrong");
    await userEvent.type(screen.getByLabelText("Password"), "credentials");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password"
    );
  });

  it("signs in with valid credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { username: "user" }))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    render(<AuthGate />);

    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "user", password: "password" }),
      })
    );
  });

  it("signs out and restores the login form", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { username: "user" }))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(204));
    render(<AuthGate />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out" })
    );

    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reports session and logout request failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { unmount } = render(<AuthGate />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to check your session"
    );

    unmount();
    fetchMock
      .mockResolvedValueOnce(response(200, { username: "user" }))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()))
      .mockResolvedValueOnce(response(500));
    render(<AuthGate />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign out"
    );
    expect(
      screen.getByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
  });

  it("creates an account and signs in", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, { username: "new-teammate" }))
      .mockResolvedValueOnce(response(200, boardSummaries()))
      .mockResolvedValueOnce(response(200, cloneBoard()));
    render(<AuthGate />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Need an account? Create one" })
    );
    expect(
      screen.getByRole("heading", { name: "Create account" })
    ).toBeVisible();

    await userEvent.type(screen.getByLabelText("Username"), "new-teammate");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" })
    );

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "new-teammate",
          password: "correct-horse",
        }),
      })
    );
  });

  it("shows an error when the chosen username is already taken", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(
      response(409, { detail: "Username is already taken" })
    );
    render(<AuthGate />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Need an account? Create one" })
    );
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse");
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already taken"
    );
  });

  it("returns to sign in when the board session has expired", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { username: "user" }))
      .mockResolvedValueOnce(response(401, { detail: "Not authenticated" }));

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Sign in" })
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("session ended");
  });
});
