/**
 * PrBriefCard — the L03 intent card + the L05 generated brief, on the PR page.
 *
 * Fetch is mocked at the boundary (the same pattern FindingsCell.test.tsx and
 * AgentCard.test.tsx use in this codebase): a QueryClient + NextIntlClientProvider
 * wrap the component, and the real hooks hit the real (mocked) `fetch`, routed
 * by URL suffix (`/intent` vs `/brief`).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefResponse, PrIntentResponse, PrIntentView, PrBriefView } from "@devdigest/shared";
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

function briefView(over: Partial<PrBriefView> = {}): PrBriefView {
  return {
    pr_id: "pr1",
    head_sha: "deadbeef1234567",
    missing_sources: [],
    summary: "Adds rate limiting to the public API to prevent abuse.",
    risks: [
      {
        kind: "security",
        title: "Hardcoded secret key",
        explanation: "A live key is committed in plaintext.",
        severity: "high",
        file_refs: ["src/a.ts"],
      },
    ],
    review_focus: [{ file: "src/a.ts", line: 12, reason: "Start here — the hardcoded secret." }],
    provider: "openai",
    model: "gpt-4.1",
    tokens_in: 900,
    tokens_out: 120,
    cost_usd: 0.0009,
    generated_at: "2026-09-27T00:00:00.000Z",
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let intentGetResponse: PrIntentResponse;
let intentPostResponse: PrIntentResponse;
let briefGetResponse: PrBriefResponse;
let briefPostResponse: unknown;
let briefPostStatus: number;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  intentGetResponse = { intent: null, skipped: null };
  intentPostResponse = { intent: intentView(), skipped: null };
  briefGetResponse = { brief: null };
  briefPostResponse = { brief: briefView() };
  briefPostStatus = 200;

  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith("/brief")) {
      if (init?.method === "POST") return Promise.resolve(jsonResponse(briefPostResponse, briefPostStatus));
      return Promise.resolve(jsonResponse(briefGetResponse));
    }
    if (init?.method === "POST") return Promise.resolve(jsonResponse(intentPostResponse));
    return Promise.resolve(jsonResponse(intentGetResponse));
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderCard(onOpenFile: (path: string) => void = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <PrBriefCard prId="pr1" onOpenFile={onOpenFile} />
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
    intentGetResponse = {
      intent: intentView({ confidence: "medium" }),
      skipped: "no openrouter API key configured",
    };
    renderCard();

    expect(
      await screen.findByText("Classification skipped: no openrouter API key configured"),
    ).toBeInTheDocument();
  });

  it("shows the stale warning when the PR head has moved since classification", async () => {
    intentGetResponse = { intent: intentView({ stale: true }), skipped: null };
    renderCard();

    expect(
      await screen.findByText(
        "The PR has new commits since this was classified. Re-run to refresh.",
      ),
    ).toBeInTheDocument();
  });

  it("no brief yet → Generate brief → shows the summary, Risk areas and Review focus", async () => {
    renderCard();

    expect(await screen.findByText("No brief generated yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));

    expect(await screen.findByText("Adds rate limiting to the public API to prevent abuse.")).toBeInTheDocument();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret key")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("Review focus")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
  });

  it("a brief missing both sources shows one banner naming them", async () => {
    briefGetResponse = { brief: briefView({ missing_sources: ["intent", "blast"] }) };
    renderCard();

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Generated without: intent, blast radius. The brief may be less precise.");
  });

  it("a brief with no risks shows the empty Risk-areas state", async () => {
    briefGetResponse = { brief: briefView({ risks: [] }) };
    renderCard();

    expect(await screen.findByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("clicking a review-focus entry calls onOpenFile with its path", async () => {
    briefGetResponse = { brief: briefView() };
    const onOpenFile = vi.fn();
    renderCard(onOpenFile);

    const button = await screen.findByRole("button", { name: "Open src/a.ts in Files changed" });
    fireEvent.click(button);
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts");
  });

  it("a failed regenerate keeps the cached brief visible and shows the failure state", async () => {
    briefGetResponse = { brief: briefView() };
    briefPostResponse = { error: { code: "external_service_error", message: "boom" } };
    briefPostStatus = 502;
    renderCard();

    expect(await screen.findByText("Adds rate limiting to the public API to prevent abuse.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate brief" }));

    expect(await screen.findByText("Brief generation failed")).toBeInTheDocument();
    // The cached summary is still visible underneath the error state.
    expect(screen.getByText("Adds rate limiting to the public API to prevent abuse.")).toBeInTheDocument();
  });
});
