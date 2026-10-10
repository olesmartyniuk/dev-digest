import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocument } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";
import { DocList } from "./DocList";

afterEach(cleanup);

function doc(over: Partial<ContextDocument> = {}): ContextDocument {
  return {
    path: "docs/a.md",
    name: "a.md",
    root: "docs",
    size: 20,
    chars: 10,
    tokens: 5,
    entry_chars: 20,
    updated_at: null,
    used_by: { agents: 0, skills: 0 },
    ...over,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DocList (AC-2, AC-18)", () => {
  it("renders every document in the order received, with its full path, root badge and used-by caption", () => {
    const documents = [
      doc({ path: "docs/a.md", root: "docs", used_by: { agents: 2, skills: 1 } }),
      doc({ path: "specs/b.md", root: "specs", used_by: { agents: 0, skills: 0 } }),
    ];
    renderWithIntl(<DocList documents={documents} selectedPath={null} onSelect={() => {}} />);

    const rows = screen.getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("docs/a.md"),
      expect.stringContaining("specs/b.md"),
    ]);
    expect(screen.getByText("used by 2 agents · 1 skill")).toBeInTheDocument();
    expect(screen.getByText("used by 0 agents · 0 skills")).toBeInTheDocument();
  });

  it("clicking a row calls onSelect with that document's path", () => {
    const onSelect = vi.fn();
    const documents = [doc({ path: "docs/a.md" }), doc({ path: "specs/b.md" })];
    renderWithIntl(<DocList documents={documents} selectedPath="docs/a.md" onSelect={onSelect} />);

    const rows = screen.getAllByRole("button");
    fireEvent.click(rows[1]!);
    expect(onSelect).toHaveBeenCalledWith("specs/b.md");
  });
});
