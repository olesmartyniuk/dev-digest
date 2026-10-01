/**
 * BlastRadiusBlock — fetch mocked at the boundary (PrBriefCard.test.tsx's
 * pattern): a QueryClient + NextIntlClientProvider wrap the component, and
 * `usePrBlastRadius` hits the real hook, which hits the real (mocked) `fetch`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { BlastRadiusBlock } from "./BlastRadiusBlock";

afterEach(cleanup);

function blastResponse(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    pr_id: "pr1",
    changed_symbols: [
      { name: "rateLimit", file: "src/a.ts", kind: "function" },
      { name: "otherFn", file: "src/c.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [{ name: "publicRouter", file: "src/a.ts", line: 12 }],
        endpoints_affected: ["GET /x"],
        crons_affected: [],
      },
      {
        symbol: "otherFn",
        callers: [{ name: "otherCaller", file: "src/d.ts", line: 5 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "2 changed symbols · 2 callers · 1 endpoint · 0 cron jobs",
    degraded: false,
    degraded_reason: null,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let getResponse: BlastRadiusResponse;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  getResponse = blastResponse();
  fetchMock = vi.fn(() => Promise.resolve(jsonResponse(getResponse)));
  vi.stubGlobal("fetch", fetchMock);
});

function renderBlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
        <BlastRadiusBlock prId="pr1" repoFullName="acme/app" headSha="deadbeef" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusBlock", () => {
  it("happy path: stats, both symbols, and a caller link to GitHub — no degraded notice", async () => {
    renderBlock();

    expect(await screen.findByText("Blast radius")).toBeInTheDocument();
    expect(await screen.findByText(/2 symbols/)).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    expect(screen.getByText("otherFn")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Open src\/a.ts:12 on GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/deadbeef/src/a.ts#L12");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("empty: no downstream callers found, and no results list", async () => {
    getResponse = blastResponse({
      changed_symbols: [{ name: "rateLimit", file: "src/a.ts", kind: "function" }],
      downstream: [],
      summary: "1 changed symbol · 0 callers · 0 endpoints · 0 cron jobs",
    });
    renderBlock();

    expect(await screen.findByText(/no downstream callers found/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("degraded with callers: the status notice shows AND the caller row still renders", async () => {
    getResponse = blastResponse({ degraded: true, degraded_reason: "no_data" });
    renderBlock();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/no persistent index for this repo yet/i);
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open src\/a.ts:12 on GitHub/ })).toBeInTheDocument();
  });
});
