import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, AgentSkillLink } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const setSkillsMutate = vi.fn();

// Mock the data hooks so the tab renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: (): { data: AgentSkillLink[] } => ({
    data: [{ agent_id: "ag1", skill_id: "s-linked", order: 0 }],
  }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: (): { data: Skill[] } => ({
    data: [
      {
        id: "s-linked",
        name: "Linked Rubric",
        description: "",
        type: "rubric",
        source: "manual",
        body: "# Rubric",
        enabled: true,
        version: 1,
      },
      {
        id: "s-unvetted",
        name: "Unvetted Import",
        description: "",
        type: "custom",
        source: "imported_url",
        body: "# Import",
        enabled: false,
        version: 1,
      },
    ],
  }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (smoke)", () => {
  it("lists linked and unlinked skills, with a needs-vetting badge on a disabled skill", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    expect(screen.getByText("Linked Rubric")).toBeInTheDocument();
    expect(screen.getByText("Unvetted Import")).toBeInTheDocument();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("attaching an unlinked skill posts the whole ordered skill_ids list", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    // Row order is: linked ("s-linked") first, then unlinked ("s-unvetted").
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    fireEvent.click(switches[1]!);
    expect(setSkillsMutate).toHaveBeenCalledWith(["s-linked", "s-unvetted"]);
  });

  it("detaching the only linked skill posts an empty list", () => {
    renderWithIntl(<SkillsTab agentId="ag1" />);
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]!);
    expect(setSkillsMutate).toHaveBeenCalledWith([]);
  });
});
