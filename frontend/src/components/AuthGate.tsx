"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthStatus = "loading" | "anonymous" | "authenticated";

type SessionResponse = {
  username: string;
};

export const AuthGate = () => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (response.status === 401) {
        setStatus("anonymous");
        return;
      }
      if (!response.ok) {
        throw new Error("Session request failed");
      }

      const session = (await response.json()) as SessionResponse;
      setUsername(session.username);
      setStatus("authenticated");
    } catch {
      setError("Unable to check your session. Please try signing in.");
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const handleLogin = async (loginUsername: string, password: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password }),
      });

      if (response.status === 401) {
        setError("Invalid username or password.");
        return;
      }
      if (!response.ok) {
        throw new Error("Login request failed");
      }

      const session = (await response.json()) as SessionResponse;
      setUsername(session.username);
      setStatus("authenticated");
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Logout request failed");
      }

      setUsername(null);
      setStatus("anonymous");
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm font-semibold text-[var(--gray-text)]" role="status">
          Loading workspace...
        </p>
      </main>
    );
  }

  if (status === "anonymous") {
    return (
      <LoginForm
        error={error}
        isSubmitting={isSubmitting}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div>
      <div className="relative z-20 mx-auto flex max-w-[1500px] justify-end px-6 pt-6">
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-full border border-[var(--stroke)] bg-white/90 px-4 py-2 shadow-[var(--shadow)] backdrop-blur">
          <span className="text-sm text-[var(--gray-text)]">
            Signed in as <strong className="text-[var(--navy-dark)]">{username}</strong>
          </span>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleLogout}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <KanbanBoard />
    </div>
  );
};
