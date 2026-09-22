"use client";

import { ChevronDown, ExternalLink, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";

import type { CredentialErrors } from "@/features/tracker/types";

export type LoginResult = { success: true } | { success: false; errors: CredentialErrors };

interface LoginFormProps {
  onLogin: (email: string, password: string) => LoginResult;
  onAuthenticated: () => void;
  malConfigured: boolean;
  malError?: string | null;
}

const malErrorMessages: Record<string, string> = {
  access_denied: "MyAnimeList sign-in was cancelled. You can try again whenever you’re ready.",
  callback_failed: "MyAnimeList could not finish signing you in. Please try again.",
  invalid_callback: "That MyAnimeList sign-in link is invalid or has expired. Start a new sign-in below.",
  not_configured: "MyAnimeList sign-in has not been configured for this Sabame server.",
  session_failed: "Sabame could not create a secure MyAnimeList session. Please try again.",
};

export function LoginForm({ onLogin, onAuthenticated, malConfigured, malError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onLogin(email, password);
    if (!result.success) {
      setErrors(result.errors);
      const field = result.errors.email ? "email" : "password";
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
      return;
    }
    setErrors({});
    onAuthenticated();
  }

  return (
    <div>
      {malError ? (
        <div role="alert" className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-100">
          {malErrorMessages[malError] ?? "MyAnimeList could not finish signing you in. Please start a new sign-in."}
          {malError === "not_configured" ? <span className="mt-1 block text-xs">Set MAL_CLIENT_ID, MAL_CLIENT_SECRET, MAL_REDIRECT_URI, and MAL_TOKEN_ENCRYPTION_KEY on the server, then restart Sabame.</span> : null}
        </div>
      ) : null}

      {!malConfigured && malError !== "not_configured" ? (
        <div role="status" className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-100">
          MyAnimeList sign-in is not configured. The server owner needs to add the MAL OAuth credentials before account sync can be used.
        </div>
      ) : null}

      <a href="/api/auth/mal/start" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-container)] px-4 py-3 text-sm font-bold text-[#312a58] transition hover:-translate-y-0.5 hover:bg-[#e5deff]">
        Continue with MyAnimeList <ExternalLink size={15} aria-hidden="true" />
      </a>
      <p className="mt-3 text-center text-xs leading-5 text-[var(--text-soft)]">Imports your list after you authorize Sabame on MyAnimeList.</p>

      <div className="my-6 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-[var(--border)]" /><span className="text-[0.65rem] uppercase tracking-wider text-[var(--text-faint)]">or</span><span className="h-px flex-1 bg-[var(--border)]" /></div>

      <button type="button" onClick={() => { const result = onLogin("viewer@example.com", "demo123"); if (result.success) onAuthenticated(); else setErrors(result.errors); }} className="min-h-11 w-full rounded-lg border border-[var(--border-strong)] text-sm font-semibold hover:bg-[var(--primary-soft)]">Try demo instantly</button>
      <p className="mt-2 text-center text-xs text-[var(--text-soft)]">A local sample workspace that never writes to MyAnimeList.</p>

      <details className="mt-5 border-t border-[var(--border)] pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--text-soft)]">Use a demo email instead <ChevronDown size={16} aria-hidden="true" /></summary>
        <form onSubmit={handleSubmit} noValidate className="mt-4">
          <p className="mb-5 rounded-lg bg-[var(--primary-soft)] p-3 text-xs leading-5 text-[var(--text-soft)]">Use any valid email and a password of at least 6 characters. Use a made-up password; no account is created.</p>
          <div className="mb-4">
            <label htmlFor="email" className="mb-1 block text-[0.7rem] font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} placeholder="Enter your email" className="input-underline min-h-11 w-full py-2 text-base placeholder:text-[var(--text-faint)]" />
            {errors.email ? <p id="email-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">{errors.email}</p> : null}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[0.7rem] font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} placeholder="Enter your password" className="input-underline min-h-11 w-full py-2 text-base placeholder:text-[var(--text-faint)]" />
            {errors.password ? <p id="password-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">{errors.password}</p> : null}
          </div>

          <p className="mb-4 mt-5 text-xs text-[var(--text-soft)]">Your demo session and watchlist are remembered in this browser.</p>
          <button type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] text-sm font-bold hover:bg-[var(--primary-soft)]"><LogIn size={16} aria-hidden="true" />Enter demo</button>
        </form>
      </details>
    </div>
  );
}
