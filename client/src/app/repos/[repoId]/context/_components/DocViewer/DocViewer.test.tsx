import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";

// Mock the data hook so the viewer renders without a network/query client.
vi.mock("@/lib/hooks/context", () => ({
  useContextDocument: () => ({
    data: { path: "docs/a.md", content: "# Rule\nDo the thing.", size: 20, updated_at: null },
  }),
}));

import { DocViewer } from "./DocViewer";
import { IndexStatusLine } from "../IndexStatusLine";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DocViewer (preview/edit, D3 read-only)", () => {
  it("defaults to preview and renders the document as Markdown", () => {
    renderWithIntl(<DocViewer repoId="r1" path="docs/a.md" mode="preview" onMode={() => {}} />);
    expect(screen.getByText("Do the thing.")).toBeInTheDocument();
  });

  it("the edit tab shows the raw Markdown source, with no Save button anywhere", () => {
    renderWithIntl(<DocViewer repoId="r1" path="docs/a.md" mode="edit" onMode={() => {}} />);
    expect(screen.getByText(/# Rule/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});

describe("IndexStatusLine (AC-17 — no chunk count)", () => {
  it("shows the document count and never mentions chunks", () => {
    renderWithIntl(<IndexStatusLine count={3} scannedAt="2026-01-01T00:00:00.000Z" />);
    const line = screen.getByText(/3 files/);
    expect(line.textContent?.toLowerCase()).not.toContain("chunk");
  });

  it("shows 'not scanned yet' when there is no scan timestamp", () => {
    renderWithIntl(<IndexStatusLine count={0} scannedAt={null} />);
    expect(screen.getByText("not scanned yet")).toBeInTheDocument();
  });
});
