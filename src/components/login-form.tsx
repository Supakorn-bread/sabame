"use client";

import { CircleUserRound, LogIn } from "lucide-react";
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

      <div className="mb-4 mt-5 flex items-center justify-between text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-[var(--text-soft)]"><input type="checkbox" className="accent-[var(--primary-container)]" />Remember me</label>
        <a href="#forgot" className="text-[var(--primary)]">Forgot Password?</a>
      </div>

      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-container)] py-3 text-sm font-bold text-[#312a58] transition hover:-translate-y-0.5 hover:bg-[#e5deff]">
        <LogIn size={16} /> Sign In
      </button>

      <div className="my-6 flex items-center gap-4"><span className="h-px flex-1 bg-[var(--border-strong)]" /><span className="text-[0.68rem] uppercase text-[var(--text-soft)]">Or</span><span className="h-px flex-1 bg-[var(--border-strong)]" /></div>
      <button type="button" className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border-strong)] py-3 text-sm transition hover:-translate-y-0.5 hover:bg-[var(--primary-soft)]"><CircleUserRound size={17} />Login with MyAnimeList</button>
      <p className="mt-7 text-center text-xs text-[var(--text-soft)]">Don&apos;t have an account? <a href="#signup" className="text-[var(--primary)]">Sign up</a></p>
    </form>
  );
}
