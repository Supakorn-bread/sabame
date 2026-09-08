"use client";

import { LogIn } from "lucide-react";
import { FormEvent, useState } from "react";

import type { CredentialErrors } from "@/features/tracker/types";

export type LoginResult = { success: true } | { success: false; errors: CredentialErrors };

interface LoginFormProps {
  onLogin: (email: string, password: string) => LoginResult;
  onAuthenticated: () => void;
}

export function LoginForm({ onLogin, onAuthenticated }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onLogin(email, password);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onAuthenticated();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="mb-5 rounded-lg bg-[var(--primary-soft)] p-3 text-xs leading-5 text-[var(--text-soft)]">Explore the demo with any valid email and a password of at least 6 characters. Use a made-up password; no account is created.</p>
      <div className="mb-4">
        <label htmlFor="email" className="mb-1 block text-[0.7rem] font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} placeholder="Enter your email" className="input-underline w-full py-2 text-sm placeholder:text-[var(--text-faint)]" />
        {errors.email && <p id="email-error" className="mt-2 text-xs font-semibold text-rose-400">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-[0.7rem] font-medium uppercase tracking-[0.08em] text-[var(--text-soft)]">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} placeholder="Enter your password" className="input-underline w-full py-2 text-sm placeholder:text-[var(--text-faint)]" />
        {errors.password && <p id="password-error" className="mt-2 text-xs font-semibold text-rose-400">{errors.password}</p>}
      </div>

      <p className="mb-4 mt-5 text-xs text-[var(--text-soft)]">Your demo session and watchlist are remembered in this browser.</p>

      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-container)] py-3 text-sm font-bold text-[#312a58] transition hover:-translate-y-0.5 hover:bg-[#e5deff]">
        <LogIn size={16} /> Sign In
      </button>

      <button type="button" onClick={() => { const result = onLogin("viewer@example.com", "demo123"); if (result.success) onAuthenticated(); else setErrors(result.errors); }} className="mt-3 min-h-11 w-full rounded-lg border border-[var(--border-strong)] text-sm hover:bg-[var(--primary-soft)]">Try demo instantly</button>
      <p className="mt-5 text-center text-xs text-[var(--text-soft)]">MyAnimeList connection is not available in this demo.</p>
    </form>
  );
}
