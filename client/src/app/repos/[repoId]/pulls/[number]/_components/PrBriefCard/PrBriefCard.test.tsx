/**
 * PrBriefCard — the L03 intent card on the PR page.
 *
 * Fetch is mocked at the boundary (the same pattern FindingsCell.test.tsx and
 * AgentCard.test.tsx use in this codebase): a QueryClient + NextIntlClientProvider
 * wrap the component, and `usePrIntent`/`useClassifyIntent` hit the real hooks,
 * which hit the real (mocked) `fetch`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentResponse, PrIntentView } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);

function intentView(over: Partial<PrIntentView> = {}): PrIntentView {
  return {
    intent: "Add rate limiting to protect the public API.",
    in_scope: ["rate limiting middleware"],
    out_of_scope: [],
    pr_id: "pr1",
    confidence: "low",
    confidence_reason: "No PR description — derived from title, file names and hunk headers only.",
    sources: [
      { kind: "title", ref: null, status: "used", note: null },
      {
        kind: "plan",
        ref: "https://www.notion.so/team/Design-doc-abc123",
        status: "unavailable",
        note: "external link — not fetched (local-first: no outbound fetch of arbitrary URLs)",
      },
    ],
    provider: "openrouter",
    model: "anthropic/claude-haiku-4.5",
    head_sha: "deadbeef1234567",
    stale: false,
    tokens_in: 900,
    tokens_out: 120,
    cost_usd: 0.0009,
    classified_at: "2026-09-27T00:00:00.000Z",
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let getResponse: PrIntentResponse;
let postResponse: PrIntentResponse;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  getResponse = { intent: null, skipped: null };
  postResponse = { intent: intentView(), skipped: null };
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Promise.resolve(jsonResponse(postResponse));
    return Promise.resolve(jsonResponse(getResponse));
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <PrBriefCard prId="pr1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("empty state → classify → renders a Low-confidence badge and a Missing-context chip", async () => {
    renderCard();

    expect(await screen.findByText("Intent not classified yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Classify intent" }));

    expect(await screen.findByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText("Missing context — not read")).toBeInTheDocument();
    // The unavailable source's chip appears both in the full Sources row and
    // (highlighted) under the Missing-context heading — by design.
    expect(screen.getAllByText(/plan https:\/\/www\.notion\.so/).length).toBeGreaterThan(0);
  });

  it("shows the skipped reason next to an already-classified intent", async () => {
    getResponse = {
      intent: intentView({ confidence: "medium" }),
      skipped: "no openrouter API key configured",
    };
    renderCard();

    expect(
      await screen.findByText("Classification skipped: no openrouter API key configured"),
    ).toBeInTheDocument();
  });

  it("shows the stale warning when the PR head has moved since classification", async () => {
    getResponse = { intent: intentView({ stale: true }), skipped: null };
    renderCard();

    expect(
      await screen.findByText(
        "The PR has new commits since this was classified. Re-run to refresh.",
      ),
    ).toBeInTheDocument();
  });
});
