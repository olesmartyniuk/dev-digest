import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/runs.json";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({ data: [{ id: "x", number: 5, title: "Fix" }], isLoading: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [{ id: "a1", name: "Security", description: "d", enabled: true }],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({ data: [] }),
  useStartMultiAgentReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ConfigureRunPage from "./page";

beforeEach(() => {
  search = "";
});
afterEach(cleanup);

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ConfigureRunPage />
    </NextIntlClientProvider>,
  );

describe("Configure run page", () => {
  it("asks for a PR first and keeps Run disabled without ?pr=", () => {
    renderPage();
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeDisabled();
  });

  it("shows the agent list once a PR is chosen", () => {
    search = "pr=x";
    renderPage();
    expect(screen.getByRole("checkbox", { name: /Security/ })).toBeInTheDocument();
    expect(screen.queryByText("Pick a pull request first")).not.toBeInTheDocument();
  });
});
