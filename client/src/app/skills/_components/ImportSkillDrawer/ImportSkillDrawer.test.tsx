import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";

const mutateAsync = vi.fn().mockResolvedValue({ id: "new-skill-id" });

vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillDrawer (smoke)", () => {
  it("derives the name from the pasted body's first heading and previews it before import", () => {
    renderWithIntl(<ImportSkillDrawer onClose={() => {}} onImported={() => {}} />);
    const body = screen.getByPlaceholderText(/Describe the rule/);
    fireEvent.change(body, { target: { value: "# Coverage Rubric\nCheck branch coverage." } });

    // The preview section renders the markdown as read-only text, not code.
    expect(screen.getByText("Coverage Rubric")).toBeInTheDocument();
    expect(screen.getByText("Check branch coverage.")).toBeInTheDocument();
  });

  it("imports as source 'imported_url' with enabled omitted (server defaults it to disabled)", async () => {
    renderWithIntl(<ImportSkillDrawer onClose={() => {}} onImported={() => {}} />);
    const body = screen.getByPlaceholderText(/Describe the rule/);
    fireEvent.change(body, { target: { value: "# Coverage Rubric\nCheck branch coverage." } });

    fireEvent.click(screen.getByText("Import skill"));

    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Coverage Rubric",
      type: "custom",
      body: "# Coverage Rubric\nCheck branch coverage.",
      source: "imported_url",
    });
  });

  it("the Import button is disabled until there is a body (nothing is ever executed — only read as text)", () => {
    renderWithIntl(<ImportSkillDrawer onClose={() => {}} onImported={() => {}} />);
    expect(screen.getByText("Import skill").closest("button")).toBeDisabled();
  });
});
