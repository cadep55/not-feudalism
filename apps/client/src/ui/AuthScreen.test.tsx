import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALICE, fakeApi } from "../test-helpers.ts";
import { AuthScreen } from "./AuthScreen.tsx";

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("AuthScreen", () => {
  it("logs in and hands the player to the app", async () => {
    const api = fakeApi();
    const onLoggedIn = vi.fn();
    render(<AuthScreen api={api} onLoggedIn={onLoggedIn} />);

    await fillLogin("Alice@Example.test", "correct horse battery");

    expect(api.logIn).toHaveBeenCalledWith({
      email: "alice@example.test",
      password: "correct horse battery",
    });
    expect(onLoggedIn).toHaveBeenCalledWith(ALICE);
  });

  it("shows the server's reason when login fails", async () => {
    const api = fakeApi({
      logIn: vi.fn(async () => ({ ok: false as const, reason: "invalid_credentials" as const })),
    });
    const onLoggedIn = vi.fn();
    render(<AuthScreen api={api} onLoggedIn={onLoggedIn} />);

    await fillLogin("alice@example.test", "wrong password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match.",
    );
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("checks the form before sending anything", async () => {
    const api = fakeApi();
    render(<AuthScreen api={api} onLoggedIn={vi.fn()} />);

    await fillLogin("not-an-email", "x");

    expect(await screen.findByRole("alert")).toHaveTextContent("Please check the form");
    expect(api.logIn).not.toHaveBeenCalled();
  });

  it("signs up with a character name", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    const onLoggedIn = vi.fn();
    render(<AuthScreen api={api} onLoggedIn={onLoggedIn} />);

    await user.click(screen.getByRole("tab", { name: "Sign up" }));
    await user.type(screen.getByLabelText("Email"), "alice@example.test");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.type(screen.getByLabelText("Character name"), "Alice");
    await user.click(screen.getByRole("button", { name: "Create character" }));

    expect(api.signUp).toHaveBeenCalledWith({
      email: "alice@example.test",
      password: "correct horse battery",
      characterName: "Alice",
    });
    expect(onLoggedIn).toHaveBeenCalledWith(ALICE);
  });

  it("explains character name rules before sign-up is sent", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<AuthScreen api={api} onLoggedIn={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Sign up" }));
    await user.type(screen.getByLabelText("Email"), "alice@example.test");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.type(screen.getByLabelText("Character name"), "1Alice");
    await user.click(screen.getByRole("button", { name: "Create character" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("starting with a letter");
    expect(api.signUp).not.toHaveBeenCalled();
  });
});
