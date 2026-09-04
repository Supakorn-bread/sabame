import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm, type LoginResult } from "./login-form";

describe("LoginForm", () => {
  it("shows field errors returned by demo login", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn<() => LoginResult>(() => ({
      success: false,
      errors: {
        email: "Enter a valid email address.",
        password: "Use at least 6 characters.",
      },
    }));

    render(<LoginForm onLogin={onLogin} onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /enter sabame/i }));

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 6 characters.")).toBeInTheDocument();
  });

  it("submits credentials and announces successful demo entry", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn<(email: string, password: string) => LoginResult>(() => ({ success: true }));
    const onAuthenticated = vi.fn();

    render(<LoginForm onLogin={onLogin} onAuthenticated={onAuthenticated} />);
    await user.type(screen.getByLabelText(/email/i), "viewer@sabame.app");
    await user.type(screen.getByLabelText(/^password$/i), "123456");
    await user.click(screen.getByRole("button", { name: /enter sabame/i }));

    expect(onLogin).toHaveBeenCalledWith("viewer@sabame.app", "123456");
    expect(onAuthenticated).toHaveBeenCalledOnce();
  });
});
