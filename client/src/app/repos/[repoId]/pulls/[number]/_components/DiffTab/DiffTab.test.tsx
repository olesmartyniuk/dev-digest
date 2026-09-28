/**
 * DiffTab — the "Files changed" tab, grouped (Smart) or flat (Original).
 *
 * Fetch is mocked at the boundary (the same pattern PrBriefCard.test.tsx
 * uses): a QueryClient + NextIntlClientProvider wrap the component, and the
 * real hooks (`usePrSmartDiff`, `usePrReviews`, `usePrComments`) hit the real
 * (mocked) `fetch`, routed by URL suffix. `fireEvent` is used, not
 * `@testing-library/user-event` (not a dependency here).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import type { SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

afterEach(cleanup);

const FILES: PrFile[] = [
  {
    path: "src/app.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,2 +11,2 @@\n context before\n+added new line",
  },
  { path: "src/app.test.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n+added test" },
  { path: "README.md", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n+added doc line" },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n+added lock line" },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    { role: "core", files: [{ path: "src/app.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] },
    { role: "tests", files: [{ path: "src/app.test.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

function reviewWithFinding(): ReviewRecord[] {
  return [
    {
      id: "rev1",
      pr_id: "pr1",
      agent_id: "a1",
      run_id: "run1",
      agent_name: "Reviewer",
      kind: "review",
      verdict: "request_changes",
      summary: "s",
      score: 50,
      model: "m",
      grounding: null,
      created_at: "2026-01-01T00:00:00.000Z",
      findings: [
        {
          id: "find1",
          severity: "CRITICAL",
          category: "bug",
          title: "Unbounded loop",
          file: "src/app.ts",
          start_line: 12,
          end_line: 12,
          rationale: "This loop has no bound.",
          suggestion: null,
          confidence: 0.9,
          kind: null,
          trifecta_components: null,
          evidence: null,
          review_id: "rev1",
          accepted_at: null,
          dismissed_at: null,
        },
      ],
    },
  ];
}

let fetchMock: ReturnType<typeof vi.fn>;
let reviewsResponse: ReviewRecord[];

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  reviewsResponse = reviewWithFinding();
  fetchMock = vi.fn((url: string) => {
    if (url.includes("/smart-diff")) return Promise.resolve(jsonResponse(SMART_DIFF));
    if (url.includes("/reviews")) return Promise.resolve(jsonResponse(reviewsResponse));
    if (url.includes("/comments")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(null));
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderTab(props: Partial<Parameters<typeof DiffTab>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab
          prId="pr1"
          filesCount={4}
          files={FILES}
          order="smart"
          onOrderChange={vi.fn()}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab", () => {
  it("groups files by role, shows findings stats, and expands a collapsed group", async () => {
    renderTab();

    const core = await screen.findByRole("button", { name: /Core/ });
    const tests = screen.getByRole("button", { name: /Tests/ });
    const docs = screen.getByRole("button", { name: /Docs/ });
    const boilerplate = screen.getByRole("button", { name: /Boilerplate/ });

    // DOM order: Core, Tests, Docs, Boilerplate.
    expect(core.compareDocumentPosition(tests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tests.compareDocumentPosition(docs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(docs.compareDocumentPosition(boilerplate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(core).getByText("1 of 1 files have findings")).toBeInTheDocument();

    // Core (not collapsed by default) is visible; docs/boilerplate start collapsed.
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();

    fireEvent.click(boilerplate);
    expect(await screen.findByText("pnpm-lock.yaml")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: "1 finding(s) in this file" })).toBeInTheDocument();

    expect(await screen.findByText("Unbounded loop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("toggles order and renders the flat view with no group headers", async () => {
    const onOrderChange = vi.fn();
    const { rerender } = renderTab({ onOrderChange });

    await screen.findByRole("button", { name: /Core/ });
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(onOrderChange).toHaveBeenCalledWith("original");

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
          <DiffTab
            prId="pr1"
            filesCount={4}
            files={FILES}
            order="original"
            onOrderChange={onOrderChange}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: /^Core/ })).not.toBeInTheDocument();
    const nodes = FILES.map((f) => screen.getByText(f.path));
    // Original order must match FILES' own (GitHub) order exactly, not the
    // Smart grouping — each path's node comes strictly before the next.
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(nodes[i]!.compareDocumentPosition(nodes[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders groups and file counts with no findings when no reviews exist yet", async () => {
    reviewsResponse = [];
    renderTab();

    const core = await screen.findByRole("button", { name: /Core/ });
    expect(within(core).getByText("1 files")).toBeInTheDocument();
    expect(screen.queryByText(/have findings/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /finding\(s\) in this file/ })).not.toBeInTheDocument();
  });
});
