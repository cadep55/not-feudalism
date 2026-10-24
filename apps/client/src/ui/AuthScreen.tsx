import { LoginRequest, SignUpRequest } from "@nf/shared";
import { type FormEvent, useState } from "react";
import type { Api, ApiResult, Player } from "../net/api.ts";
import { FAILURE_MESSAGES } from "./messages.ts";

type Mode = "login" | "signup";

type Props = {
  api: Api;
  onLoggedIn: (player: Player) => void;
};

/** Login and sign-up. Validates with the same schemas as the server before sending. */
export function AuthScreen({ api, onLoggedIn }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));

    let result: ApiResult<Player>;
    if (mode === "login") {
      const parsed = LoginRequest.safeParse(form);
      if (!parsed.success) return setError(FAILURE_MESSAGES.invalid_input);
      setBusy(true);
      result = await api.logIn(parsed.data);
    } else {
      const parsed = SignUpRequest.safeParse(form);
      if (!parsed.success) {
        return setError(parsed.error.issues[0]?.message ?? FAILURE_MESSAGES.invalid_input);
      }
      setBusy(true);
      result = await api.signUp(parsed.data);
    }
    setBusy(false);

    if (result.ok) onLoggedIn(result.value);
    else setError(FAILURE_MESSAGES[result.reason]);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <main className="auth">
      <h1>Not Feudalism</h1>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => switchMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-label={mode === "login" ? "Log in" : "Sign up"}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>
        {mode === "signup" && (
          <label>
            Character name
            <input name="characterName" autoComplete="off" required />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create character"}
        </button>
      </form>
    </main>
  );
}
