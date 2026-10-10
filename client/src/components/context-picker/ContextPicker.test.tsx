import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument, ContextListing } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";
import { ContextPicker, type ContextPickerProps } from "./ContextPicker";

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

let listing: ContextListing;
let onChange: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  onChange = vi.fn();
  listing = {
    repo_id: "r1",
    clone_status: "ready",
    roots: ["specs", "docs", "insights"],
    documents: [doc({ path: "docs/a.md", name: "a.md" }), doc({ path: "specs/b.md", name: "b.md", root: "specs" })],
    scanned_at: "2026-01-01T00:00:00.000Z",
    cap_chars: 24_000,
  };
  const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(listing)));
  vi.stubGlobal("fetch", fetchMock);
});

function renderPicker(props: Partial<ContextPickerProps> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextPicker repoId="r1" attached={[]} onChange={onChange} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextPicker", () => {
  it("renders the All documents list in the server's (alphabetical) order", async () => {
    renderPicker();
    expect(await screen.findByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
  });

  it("checking a document calls onChange with the path appended", async () => {
    renderPicker();
    await screen.findByText("a.md");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(onChange).toHaveBeenCalledWith(["docs/a.md"]);
  });

  it("shows the over-cap warning when the attached set's entry_chars exceed cap_chars", async () => {
    listing = { ...listing, cap_chars: 10 };
    renderPicker({ attached: ["docs/a.md", "specs/b.md"] });
    expect(await screen.findByText(/Project context limit/)).toBeInTheDocument();
  });

  it("does not show the over-cap warning when well under the cap", async () => {
    renderPicker({ attached: ["docs/a.md"] });
    await screen.findByText("a.md");
    expect(screen.queryByText(/Project context limit/)).not.toBeInTheDocument();
  });

  it("two documents with the same file name in different roots both show their full path", async () => {
    listing = {
      ...listing,
      documents: [
        doc({ path: "docs/webhooks.md", name: "webhooks.md", root: "docs" }),
        doc({ path: "specs/webhooks.md", name: "webhooks.md", root: "specs" }),
      ],
    };
    renderPicker();
    expect(await screen.findByText("docs/webhooks.md")).toBeInTheDocument();
    expect(screen.getByText("specs/webhooks.md")).toBeInTheDocument();
  });

  it("lets the user reorder and remove attached documents, and flags one missing from this repo's listing (AC-10, D1)", async () => {
    renderPicker({ attached: ["docs/a.md", "specs/b.md", "docs/gone.md"] });
    await screen.findByText(/3 of 2 attached/);

    // D1 — an attached path absent from the active repo's listing is never
    // silently dropped: it still shows in Attached, marked "not in this repo".
    expect(screen.getByText("docs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("not in this repo")).toBeInTheDocument();

    // AC-10 — moving the second attached row up swaps it with the first,
    // and the picker emits the reordered array (not a locally-mutated one).
    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]!);
    expect(onChange).toHaveBeenCalledWith(["specs/b.md", "docs/a.md", "docs/gone.md"]);

    // Removing the first attached row emits the array with it excluded.
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    expect(onChange).toHaveBeenCalledWith(["specs/b.md", "docs/gone.md"]);
  });
});
