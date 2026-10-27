import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorldView } from "./WorldView.tsx";

const WORLD = {
  home: "heartland",
  here: "north",
  owners: { heartland: "Alice", east_coast: "Bob" },
};

function sections() {
  return within(screen.getByRole("list", { name: "Sections" })).getAllByRole("listitem");
}

describe("WorldView", () => {
  it("shows all 10 sections with who lives where", () => {
    render(<WorldView world={WORLD} onClose={vi.fn()} />);
    const cards = sections();
    expect(cards).toHaveLength(10);
    const text = (name: string) => cards.find((c) => c.textContent?.startsWith(name))?.textContent;
    expect(text("Heartland")).toContain("Your home");
    expect(text("East Coast")).toContain("Bob");
    expect(text("West")).toContain("Free");
    expect(text("North Isle")).toContain("Needs a boat");
  });

  it("marks where the player stands", () => {
    render(<WorldView world={WORLD} onClose={vi.fn()} />);
    const north = screen.getByText("North", { exact: true }).closest("li");
    expect(north).toHaveTextContent("You are here");
    expect(screen.getAllByText("You are here")).toHaveLength(1);
  });

  it("says when it's still loading, and closes with the button or Esc", async () => {
    const onClose = vi.fn();
    render(<WorldView world={null} onClose={onClose} />);
    expect(screen.getByText("Loading the world…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close world" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
