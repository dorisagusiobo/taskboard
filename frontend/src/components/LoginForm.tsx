"use client";

import { useState, type FormEvent } from "react";
import type { DemoAccount } from "@/lib/api";

type LoginFormProps = {
  demoAccount: DemoAccount | null;
  error: string | null;
  isSubmitting: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
};

export const LoginForm = ({
  demoAccount,
  error,
  isSubmitting,
  onLogin,
  onRegister,
}: LoginFormProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await (isRegister ? onRegister : onLogin)(username, password);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <section className="relative w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)] backdrop-blur">
        <div className="h-2 w-16 rounded-full bg-[var(--accent-yellow)]" />
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project workspace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          {isRegister ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isRegister
            ? "Choose a username and password to set up your own board."
            : "Enter your account details to open your Kanban board."}
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              className="text-sm font-semibold text-[var(--navy-dark)]"
              htmlFor="username"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[rgba(32,157,215,0.15)]"
              required
              minLength={isRegister ? 3 : undefined}
              maxLength={50}
            />
          </div>

          <div>
            <label
              className="text-sm font-semibold text-[var(--navy-dark)]"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[rgba(32,157,215,0.15)]"
              required
              minLength={isRegister ? 8 : undefined}
            />
          </div>

          {error ? (
            <p
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? isRegister
                ? "Creating account..."
                : "Signing in..."
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => setMode(isRegister ? "login" : "register")}
            className="w-full text-center text-sm font-semibold text-[var(--primary-blue)] transition hover:brightness-110"
          >
            {isRegister
              ? "Already have an account? Sign in"
              : "Need an account? Create one"}
          </button>
        </form>

        {demoAccount && !isRegister ? (
          <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4">
            <p className="text-sm font-semibold text-[var(--navy-dark)]">Try the demo</p>
            <p className="mt-1 text-sm leading-6 text-[var(--gray-text)]">
              Sign in as <strong>{demoAccount.username}</strong> with password{" "}
              <strong>{demoAccount.password}</strong>. The demo resets from time to time.
            </p>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onLogin(demoAccount.username, demoAccount.password)}
              className="mt-3 w-full rounded-full border border-[var(--secondary-purple)] px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Open the demo board
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
};
