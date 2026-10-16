/**
 * ExportWizard — fetch is mocked at the boundary, routed by URL suffix; the real
 * hooks (useCiPreview / useCiInstall) run against it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { unzipSync, strFromU8 } from "fflate";
import type { Agent, CiPreview, Repo } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";
import { ExportWizard } from "./ExportWizard";
import { zipFiles } from "./helpers";

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

const WORKFLOW_PATH = ".github/workflows/devdigest-security-reviewer.yml";

function previewFor(over: Partial<CiPreview> = {}, existing: string[] = []): CiPreview {
  const paths = [
    [".devdigest/agents/security-reviewer.yaml", "name: Security Reviewer", false],
    [".devdigest/skills/owasp.md", "# OWASP", false],
    [".devdigest/memory.jsonl", "", false],
    [".devdigest/runner/agent-runner.cjs", "/* bundle */", false],
    [WORKFLOW_PATH, "name: workflow\n", true],
  ] as const;
  return {
    repo: "acme/app",
    base_branch: "main",
    agent_slug: "security-reviewer",
    files: paths.map(([path, contents, editable]) => ({ path, contents, editable, exists: existing.includes(path) })),
    openrouter_key_ready: true,
    existing_installation_id: null,
    ...over,
  };
}

let previewBody: () => CiPreview;
let previewRequests: Record<string, unknown>[];
let installResponse: () => Response;
let installRequests: Record<string, unknown>[];

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, statusText: "", json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  previewBody = () => previewFor();
  previewRequests = [];
  installRequests = [];
  installResponse = () =>
    jsonResponse({
      installation: { id: "i1", agent_id: "ag1", repo: "acme/app", target_type: "gha", installed_at: "2026-10-15T10:00:00Z" },
      files: [],
      pr_url: "https://github.com/acme/app/pull/9",
    });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url.endsWith("/export-ci/preview")) {
        previewRequests.push(body);
        return Promise.resolve(jsonResponse(previewBody()));
      }
      if (url.endsWith("/export-ci")) {
        installRequests.push(body);
        return Promise.resolve(installResponse());
      }
      return Promise.resolve(jsonResponse({}, 404));
    }),
  );
});

function renderWizard(over: { agent?: Agent; initialStep?: 0 | 1 } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <ExportWizard agent={over.agent ?? AGENT} repo={REPO} initialStep={over.initialStep ?? 0} onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const goToPreview = async () => {
  click("Continue");
  await screen.findByText("FILES TO CREATE");
};

describe("ExportWizard", () => {
  it("preselects GitHub Actions and cannot select the unbuilt targets", () => {
    renderWizard();
    const gha = screen.getByRole("button", { name: /GitHub Actions/ });
    expect(gha).toHaveAttribute("aria-pressed", "true");
    for (const name of [/CircleCI/, /Jenkins/, /Generic CLI/]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    expect(gha).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Step 1 of 4: Target")).toBeInTheDocument();
  });

  it("lists the generated files; only the workflow is editable, and an edit survives Back/forward", async () => {
    previewBody = () => previewFor({}, [".devdigest/memory.jsonl"]);
    renderWizard();
    await goToPreview();

    for (const p of [".devdigest/agents/security-reviewer.yaml", ".devdigest/skills/owasp.md", ".devdigest/memory.jsonl", ".devdigest/runner/agent-runner.cjs", WORKFLOW_PATH]) {
      expect(screen.getByRole("button", { name: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeInTheDocument();
    }
    expect(screen.getByText("will be overwritten")).toBeInTheDocument();

    // A read-only file renders as text, not a textbox.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    click(/devdigest-security-reviewer\.yml/);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "name: my edit\n" } });

    click("Continue"); // Configure
    await screen.findByText("SECRETS EXPECTED");
    click("Back");
    await screen.findByText("FILES TO CREATE");
    click(/devdigest-security-reviewer\.yml/);
    expect(screen.getByRole("textbox")).toHaveValue("name: my edit\n");
  });

  it("re-requests the preview with the new triggers and reports the OpenRouter key state", async () => {
    previewBody = () => previewFor({ openrouter_key_ready: false });
    renderWizard();
    await goToPreview();
    click("Continue");
    await screen.findByText("SECRETS EXPECTED");
    expect(screen.getByText("not set")).toBeInTheDocument();
    expect(previewRequests.at(-1)).toMatchObject({ triggers: ["opened", "synchronize"], post_as: "github_review" });

    fireEvent.click(screen.getByRole("checkbox", { name: "pull_request: reopened" }));
    await waitFor(() => expect(previewRequests.at(-1)).toMatchObject({ triggers: ["opened", "synchronize", "reopened"] }));

    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    await waitFor(() => expect(previewRequests.at(-1)).toMatchObject({ post_as: "pr_comment" }));
  });

  it("keeps the install step and offers the zip when GitHub rejects the PR", async () => {
    renderWizard();
    await goToPreview();
    click("Continue");
    await screen.findByText("SECRETS EXPECTED");
    click("Continue");
    await screen.findByText("Open a PR with these files");
    installResponse = () =>
      jsonResponse({ error: { code: "external_service_error", message: "Could not open the pull request on GitHub." } }, 502);
    click("Install");
    expect(await screen.findByText("Could not open the pull request on GitHub.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Download files as a zip/ })).toHaveAttribute("aria-checked", "true");
    expect(installRequests[0]).toMatchObject({ action: "open_pr", repo_id: "repo1" });
    expect(screen.getByText("Step 4 of 4: Install")).toBeInTheDocument();
  });

  it("shows the PR link after a successful install", async () => {
    renderWizard();
    await goToPreview();
    click("Continue");
    await screen.findByText("SECRETS EXPECTED");
    click("Continue");
    click("Install");
    const link = await screen.findByRole("link", { name: "View pull request" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/pull/9");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opens straight on Preview for Update CI config", async () => {
    renderWizard({ initialStep: 1 });
    expect(await screen.findByText("FILES TO CREATE")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4: Preview")).toBeInTheDocument();
    expect(previewRequests).toHaveLength(1);
  });

  it("blocks a non-OpenRouter agent with the provider message", () => {
    renderWizard({ agent: { ...AGENT, provider: "openai" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Export to CI supports OpenRouter agents only");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("buildZip", () => {
  it("contains exactly the given files", () => {
    const zip = zipFiles([
      { path: "a/b.txt", contents: "hello" },
      { path: "c.yml", contents: "x: 1\n" },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(["a/b.txt", "c.yml"]);
    expect(strFromU8(files["a/b.txt"]!)).toBe("hello");
  });
});
