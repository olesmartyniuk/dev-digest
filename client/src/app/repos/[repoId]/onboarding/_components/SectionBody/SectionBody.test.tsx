import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingSection } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";

// Stub the mermaid renderer so the test never imports the real `mermaid` lib.
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div data-testid="mermaid-stub">{chart}</div>,
}));

import { SectionBody } from "./SectionBody";

afterEach(cleanup);

function renderSection(section: OnboardingSection, onOpenFile = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <SectionBody section={section} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
}

describe("SectionBody", () => {
  it("critical_paths renders the path, its label, and an Open button that calls onOpenFile", () => {
    const onOpenFile = vi.fn();
    renderSection(
      {
        kind: "critical_paths",
        title: "Critical paths",
        body: "The core path.",
        diagram: null,
        links: [{ label: "handles every incoming request", path: "src/app.ts" }],
      },
      onOpenFile,
    );
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("handles every incoming request")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts");
  });

  it("how_to_run renders one copy button per extracted command", () => {
    renderSection({
      kind: "how_to_run",
      title: "How to run locally",
      body: "```sh\nnpm install\nnpm run dev\n```",
      diagram: null,
      links: [],
    });
    expect(screen.getAllByRole("button", { name: /copy/i })).toHaveLength(2);
  });

  it("reading_path renders numbered badges with the path above the rationale", () => {
    renderSection({
      kind: "reading_path",
      title: "Reading path",
      body: "Start here.",
      diagram: null,
      links: [
        { label: "entrypoint", path: "src/app.ts" },
        { label: "routing", path: "src/routes.ts" },
      ],
    });
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("entrypoint")).toBeInTheDocument();
  });

  it("first_tasks renders the task text with its file/area pointer", () => {
    renderSection({
      kind: "first_tasks",
      title: "First tasks",
      body: "Good starters.",
      diagram: null,
      links: [{ label: "Add a health check route", path: "src/app.ts" }],
    });
    expect(screen.getByText("Add a health check route")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
  });

  it("architecture renders the diagram stub only when diagram is non-null", () => {
    renderSection({
      kind: "architecture",
      title: "Architecture",
      body: "Overview.",
      diagram: "flowchart LR\nA --> B",
      links: [],
    });
    expect(screen.getByTestId("mermaid-stub")).toHaveTextContent("flowchart LR");

    cleanup();
    renderSection({
      kind: "architecture",
      title: "Architecture",
      body: "Overview.",
      diagram: null,
      links: [],
    });
    expect(screen.queryByTestId("mermaid-stub")).not.toBeInTheDocument();
  });
});
