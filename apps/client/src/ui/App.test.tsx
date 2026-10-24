import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALICE, fakeApi } from "../test-helpers.ts";
import { App } from "./App.tsx";

// The Phaser canvas is covered by e2e tests (#11); here we only check which screen shows.
vi.mock("../game/GameCanvas.tsx", () => ({
  GameCanvas: () => <div data-testid="game-canvas" />,
}));

describe("App", () => {
  it("shows the login screen when there's no session", async () => {
    render(<App api={fakeApi()} />);
    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
  });

  it("resumes an existing session straight into the game", async () => {
    const api = fakeApi({ me: vi.fn(async () => ({ ok: true as const, value: ALICE })) });
    render(<App api={api} />);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    // The canvas appears only after the saved state loads, so wait for it.
    expect(await screen.findByTestId("game-canvas")).toBeInTheDocument();
  });

  it("asks the player to refresh when the server speaks a newer protocol", async () => {
    const api = fakeApi({
      checkProtocol: vi.fn(async () => ({ ok: true as const, value: false })),
    });
    render(<App api={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please refresh the page");
    expect(api.me).not.toHaveBeenCalled();
  });

  it("says so when the server can't be reached", async () => {
    const api = fakeApi({
      checkProtocol: vi.fn(async () => ({ ok: false as const, reason: "network_error" as const })),
    });
    render(<App api={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("logs out back to the login screen", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ me: vi.fn(async () => ({ ok: true as const, value: ALICE })) });
    render(<App api={api} />);

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(api.logOut).toHaveBeenCalled();
    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
  });
});
