/**
 * CiTab — fetch is mocked at the boundary, routed by URL; the tab is reached the
 * way users reach it (`?tab=ci` through useAgentTab → AgentEditor).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentCiOverview, CiPreview, Repo } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { useAgentTab } from "../../../../_hooks/useAgentTab";
import { AgentEditor } from "../../AgentEditor";

const REPO: Repo = {
  id: "repo1",
  workspace_id: "w1",
  owner: "acme",
  name: "app",
  full_name: "acme/app",
  default_branch: "main",
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

let activeRepo: Repo | null = REPO;
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo, repoId: activeRepo?.id ?? null, repos: [], reposLoaded: true, setRepoId: () => {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=ci"),
}));

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  system_prompt: "p",
  output_schema: null,
  strategy: "auto",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 2,
};

const installation = (over: Partial<AgentCiOverview["installations"][number]> = {}) => ({
  id: "i1",
  agent_id: "ag1",
  repo: "acme/app",
  target_type: "gha" as const,
  installed_at: "2026-10-10T10:00:00Z",
  agent_slug: "security-reviewer",
  workflow_version: 2,
  out_of_date: false,
  pr_url: "https://github.com/acme/app/pull/3",
  latest_run: null,
  ...over,
});

let overview: AgentCiOverview;
let requests: { url: string; method: string; body: Record<string, unknown> }[];

const PREVIEW: CiPreview = {
  repo: "acme/app",
  base_branch: "main",
  agent_slug: "security-reviewer",
  files: [{ path: ".devdigest/agents/security-reviewer.yaml", contents: "name: x", editable: false, exists: false }],
  openrouter_key_ready: true,
  existing_installation_id: "i1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, statusText: "", json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  activeRepo = REPO;
  overview = { agent_id: "ag1", agent_version: 2, ci_fail_on: "critical", installations: [installation()], runs: [] };
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
      if (url.endsWith("/agents/ag1/ci")) return Promise.resolve(jsonResponse(overview));
      if (url.endsWith("/ci/sync")) return Promise.resolve(jsonResponse({ ingested: 0, skipped: 0, error: null }));
      if (url.endsWith("/export-ci/preview")) return Promise.resolve(jsonResponse(PREVIEW));
      if (url.endsWith("/agents/ag1") && method === "PUT") return Promise.resolve(jsonResponse({ ...AGENT, ci_fail_on: "any", version: 3 }));
      return Promise.resolve(jsonResponse({}, 404));
    }),
  );
});

/** Mirrors the agent page: `?tab=` is read through useAgentTab. */
function Harness({ agent }: { agent: Agent }) {
  const { tab, setTab } = useAgentTab(agent.id);
  return <AgentEditor agent={agent} tab={tab} onTab={setTab} />;
}

function renderTab(agent: Agent = AGENT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages, agents: agentsMessages }}>
        <ToastProvider>
          <Harness agent={agent} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiTab", () => {
  it("renders for ?tab=ci and shows an installation with no runs yet", async () => {
    renderTab();
    expect(await screen.findByText("CI deployment")).toBeInTheDocument();
    expect(await screen.findByText("acme/app")).toBeInTheDocument();
    expect(screen.getByText("no runs yet")).toBeInTheDocument();
    expect(screen.getByText("Workflow version v2")).toBeInTheDocument();
    expect(screen.getByText("Active in 1 repos")).toBeInTheDocument();
    expect(screen.queryByText("Out of date")).not.toBeInTheDocument();
    // Opening the tab syncs once for this agent.
    await waitFor(() =>
      expect(requests.some((r) => r.url.endsWith("/ci/sync") && r.body.agent_id === "ag1")).toBe(true),
    );
  });

  it("flags an out-of-date installation and shows its latest run", async () => {
    overview.installations = [
      installation({
        out_of_date: true,
        latest_run: { status: "succeeded", ran_at: new Date().toISOString(), blocking: false },
      }),
    ];
    renderTab();
    expect(await screen.findByText("Out of date")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.queryByText("no runs yet")).not.toBeInTheDocument();
  });

  it("saves a new Fail CI on level through PUT /agents/:id", async () => {
    renderTab();
    await screen.findByText("acme/app");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "any" } });
    await waitFor(() => {
      const put = requests.find((r) => r.method === "PUT" && r.url.endsWith("/agents/ag1"));
      expect(put?.body).toEqual({ ci_fail_on: "any" });
    });
  });

  it("Add to CI opens the wizard on Target; Update CI config opens it on Preview", async () => {
    renderTab();
    await screen.findByText("acme/app");
    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    expect(await screen.findByText("Step 1 of 4: Target")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Step 1 of 4: Target")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));
    expect(await screen.findByText("Step 2 of 4: Preview")).toBeInTheDocument();
    expect(await screen.findByText("FILES TO CREATE")).toBeInTheDocument();
  });

  it("explains and disables export for a non-OpenRouter agent", async () => {
    renderTab({ ...AGENT, provider: "openai" });
    expect(await screen.findByText("Export to CI supports OpenRouter agents only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to CI" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update CI config" })).toBeDisabled();
  });
});
