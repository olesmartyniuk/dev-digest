import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextPickerProps } from "@/components/context-picker";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

const setAttachedMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1" }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useAgentContext: () => ({
    data: {
      agent_id: "ag1",
      paths: ["docs/a.md"],
      inherited: [{ skill_id: "s1", skill_name: "Rubric", enabled: true, paths: ["docs/b.md"] }],
      effective: ["docs/b.md", "docs/a.md"],
    },
  }),
  useSetAgentContext: () => ({ mutate: setAttachedMutate, isPending: false }),
}));

// ContextPicker itself is tested on its own; here we only confirm ContextTab
// wires the agent's attach/reorder state into it correctly.
vi.mock("@/components/context-picker", () => ({
  ContextPicker: (props: ContextPickerProps) => (
    <div>
      <span>repoId={props.repoId}</span>
      <span>attached={props.attached.join(",")}</span>
      <span>effective={props.effective?.join(",")}</span>
      <button onClick={() => props.onChange(["docs/a.md", "docs/c.md"])}>attach docs/c.md</button>
    </div>
  ),
}));

import { ContextTab } from "./ContextTab";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ContextTab", () => {
  it("renders the title/hint and passes the agent's attached/inherited/effective context to the picker", () => {
    renderWithIntl(<ContextTab agentId="ag1" />);
    expect(screen.getByText("Project context")).toBeInTheDocument();
    expect(screen.getByText("repoId=r1")).toBeInTheDocument();
    expect(screen.getByText("attached=docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("effective=docs/b.md,docs/a.md")).toBeInTheDocument();
  });

  it("a picker change calls the agent context mutation with the new ordered list", () => {
    renderWithIntl(<ContextTab agentId="ag1" />);
    screen.getByText("attach docs/c.md").click();
    expect(setAttachedMutate).toHaveBeenCalledWith(["docs/a.md", "docs/c.md"]);
  });
});
