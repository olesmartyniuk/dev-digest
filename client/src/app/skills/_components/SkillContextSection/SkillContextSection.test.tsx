import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextPickerProps } from "@/components/context-picker";
import skillsMessages from "../../../../../messages/en/skills.json";
import contextMessages from "../../../../../messages/en/context.json";

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1" }),
}));

let previewData: { text: string | null; truncated: boolean; paths: string[]; missing: string[]; clone_status: string } | undefined;

vi.mock("@/lib/hooks/context", () => ({
  useSkillContext: () => ({ data: { skill_id: "sk1", paths: ["docs/a.md"] } }),
  useSetSkillContext: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillContextPreview: () => ({ data: previewData }),
  useContextListing: () => ({ data: { cap_chars: 24_000 } }),
}));

vi.mock("@/components/context-picker", () => ({
  ContextPicker: (props: ContextPickerProps) => <div>attached={props.attached.join(",")}</div>,
}));

import { SkillContextSection } from "./SkillContextSection";

afterEach(cleanup);

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, context: contextMessages }}>
      <SkillContextSection skillId="sk1" />
    </NextIntlClientProvider>,
  );
}

describe("SkillContextSection", () => {
  it("renders the title/hint and the picker with the skill's attached paths", () => {
    previewData = undefined;
    renderWithIntl();
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText("Any agent using this skill inherits these documents.")).toBeInTheDocument();
    expect(screen.getByText("attached=docs/a.md")).toBeInTheDocument();
  });

  it("shows the SERIALIZES AS block starting with ## Project context once attached", () => {
    previewData = {
      text: '## Project context\n<untrusted source="spec-0">\nSource: docs/a.md\n\nRule.\n</untrusted>',
      truncated: false,
      paths: ["docs/a.md"],
      missing: [],
      clone_status: "ready",
    };
    renderWithIntl();
    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    expect(screen.getByText(/## Project context/)).toBeInTheDocument();
  });

  it("shows the previewEmpty hint when nothing serialized yet", () => {
    previewData = { text: null, truncated: false, paths: [], missing: [], clone_status: "ready" };
    renderWithIntl();
    expect(screen.getByText("Attach a document to see the serialized block.")).toBeInTheDocument();
  });

  it("shows the over-cap warning (AC-8a) alongside the SERIALIZES AS block when the preview reports truncated:true", () => {
    previewData = {
      text: '## Project context\n<untrusted source="spec-0">\nSource: docs/a.md\n\nRule.\n</untrusted>',
      truncated: true,
      paths: ["docs/a.md"],
      missing: [],
      clone_status: "ready",
    };
    renderWithIntl();
    expect(screen.getByText(/Project context limit/)).toBeInTheDocument();
  });
});
