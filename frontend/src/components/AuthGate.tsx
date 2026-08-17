"use client";

import { useCallback, useEffect, useState } from "react";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import {
  ApiError,
  changePassword,
  getSession,
  login,
  logout,
  register,
} from "@/lib/api";

type AuthStatus = "loading" | "anonymous" | "authenticated";

export const AuthGate = () => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const session = await getSession();
      setUsername(session.username);
      setStatus("authenticated");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setStatus("anonymous");
        return;
      }
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
      const session = await login(loginUsername, password);
      setUsername(session.username);
      setStatus("authenticated");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError("Invalid username or password.");
        return;
      }
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (registerUsername: string, password: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await register(registerUsername, password);
      setUsername(session.username);
      setStatus("authenticated");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError("That username is already taken.");
        return;
      }
      if (requestError instanceof ApiError && requestError.status === 422) {
        setError(
          "Usernames need 3+ letters/numbers and passwords need 8+ characters."
        );
        return;
      }
      setError("Unable to create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await logout();
      setUsername(null);
      setStatus("anonymous");
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 400) {
        setError("Current password is incorrect.");
        return false;
      }
      if (requestError instanceof ApiError && requestError.status === 422) {
        setError("New password needs 8+ characters.");
        return false;
      }
      setError("Unable to change your password. Please try again.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSessionExpired = useCallback(() => {
    setUsername(null);
    setError("Your session ended. Please sign in again.");
    setStatus("anonymous");
  }, []);

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
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div>
      <div className="relative z-20 mx-auto flex max-w-[1500px] flex-col items-end gap-2 px-6 pt-6">
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
        <ChangePasswordForm
          isSubmitting={isSubmitting}
          onSubmit={handleChangePassword}
        />
      </div>
      {error ? (
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <KanbanBoard onSessionExpired={handleSessionExpired} />
    </div>
  );
};
