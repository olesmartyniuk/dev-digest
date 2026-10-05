import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";

let fileData: { path: string; content: string; size: number; updated_at: string | null } | undefined;

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingFile: () => ({ data: fileData, isLoading: false, isError: false }),
}));

import { SourceFileDrawer } from "./SourceFileDrawer";

afterEach(() => {
  cleanup();
  fileData = undefined;
});

function renderDrawer(path: string, mode: "preview" | "raw" = "preview") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <SourceFileDrawer
        repoId="r1"
        path={path}
        mode={mode}
        onMode={() => {}}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe("SourceFileDrawer", () => {
  it(".ts renders raw <pre> content with no tabs", () => {
    fileData = { path: "src/app.ts", content: "export const app = 1;", size: 22, updated_at: null };
    renderDrawer("src/app.ts");
    expect(screen.getByText("export const app = 1;")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /raw/i })).not.toBeInTheDocument();
  });

  it(".md defaults to the preview tab", () => {
    fileData = { path: "docs/guide.md", content: "# Guide\n\nRead this.", size: 20, updated_at: null };
    renderDrawer("docs/guide.md");
    expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /raw/i })).toBeInTheDocument();
    expect(screen.getByText("Read this.")).toBeInTheDocument();
  });

  it("never renders a save button", () => {
    fileData = { path: "docs/guide.md", content: "# Guide", size: 7, updated_at: null };
    renderDrawer("docs/guide.md");
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});
