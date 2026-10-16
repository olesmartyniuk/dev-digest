import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../messages/en/runs.json";

const replace = vi.fn();
let latest: { data?: { id: string | null }; isError: boolean; refetch: () => void } = {
  isError: false,
  refetch: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/hooks/multi-agent", () => ({ useLatestMultiAgentRun: () => latest }));

import MultiAgentEntryPage from "./page";

beforeEach(() => replace.mockReset());
afterEach(cleanup);

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <MultiAgentEntryPage />
    </NextIntlClientProvider>,
  );

describe("Multi-Agent sidebar entry page", () => {
  it("opens the latest run when one exists", async () => {
    latest = { data: { id: "run-9" }, isError: false, refetch: vi.fn() };
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/multi-agent/run-9"));
  });

  it("opens Configure run when there is no multi-agent run yet", async () => {
    latest = { data: { id: null }, isError: false, refetch: vi.fn() };
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/multi-agent/configure"));
  });

  it("does not redirect on error", () => {
    latest = { data: undefined, isError: true, refetch: vi.fn() };
    renderPage();
    expect(replace).not.toHaveBeenCalled();
  });
});
