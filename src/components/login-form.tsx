"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-bold">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={18} />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            placeholder="you@example.com"
            className="h-13 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] pl-12 pr-4 text-sm outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
          />
        </div>
        {errors.email && <p id="email-error" className="mt-2 text-sm font-semibold text-rose-500">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-bold">
          Password
        </label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={18} />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : "password-hint"}
            placeholder="At least 6 characters"
            className="h-13 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] pl-12 pr-12 text-sm outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-[var(--text-faint)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {errors.password ? (
          <p id="password-error" className="mt-2 text-sm font-semibold text-rose-500">{errors.password}</p>
        ) : (
          <p id="password-hint" className="mt-2 text-xs text-[var(--text-faint)]">Any 6+ character password works in demo mode.</p>
        )}
      </div>

      <button
        type="submit"
        className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 text-sm font-extrabold text-[var(--primary-text)] shadow-lg shadow-violet-500/10 transition hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
      >
        Enter Sabame
        <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
      </button>

      <p className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-center text-xs leading-relaxed text-[var(--text-soft)]">
        Demo only — credentials stay in this browser and are never sent anywhere.
      </p>
    </form>
  );
}
