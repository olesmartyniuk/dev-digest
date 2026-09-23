import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "async",
  rule: "Always use async/await instead of .then() chains.",
  rationale: "Keeps control flow linear.",
  evidence: {
    path: "src/api/users.ts",
    line: 23,
    snippet: "const user = await db.users.find(id);",
  },
  confidence: 0.91,
  status: "pending",
  origin: "model",
  created_at: "2026-01-01T00:00:00.000Z",
};

function renderCard(convention: Convention = CONVENTION, props: Partial<Parameters<typeof ConventionCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={convention}
        onStatusChange={props.onStatusChange ?? vi.fn()}
        onEdit={props.onEdit ?? vi.fn().mockResolvedValue(undefined)}
        busy={props.busy}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("shows the rule with the evidence it was verified against", () => {
    renderCard();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("marks a config-derived candidate so its exact citation is explained", () => {
    renderCard({ ...CONVENTION, origin: "config" });
    expect(screen.getByText("From config")).toBeInTheDocument();
  });

  it("accepts a pending candidate", () => {
    const onStatusChange = vi.fn();
    renderCard(CONVENTION, { onStatusChange });
    fireEvent.click(screen.getByText("Accept"));
    expect(onStatusChange).toHaveBeenCalledWith("accepted");
  });

  it("takes an accepted verdict back rather than being inert", () => {
    const onStatusChange = vi.fn();
    renderCard({ ...CONVENTION, status: "accepted" }, { onStatusChange });
    fireEvent.click(screen.getByText("Accepted"));
    expect(onStatusChange).toHaveBeenCalledWith("pending");
  });

  it("rejects a candidate", () => {
    const onStatusChange = vi.fn();
    renderCard(CONVENTION, { onStatusChange });
    fireEvent.click(screen.getByText("Reject"));
    expect(onStatusChange).toHaveBeenCalledWith("rejected");
  });

  it("edits the rule text and saves the change", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);
    renderCard(CONVENTION, { onEdit });

    fireEvent.click(screen.getByText("Edit"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Rewritten house rule for this repo." } });
    fireEvent.click(screen.getByText("Save"));

    // The save closes edit mode asynchronously — wait for the resolved state
    // update rather than asserting into an un-acted render.
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith({
        rule: "Rewritten house rule for this repo.",
        category: "async",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("keeps Save disabled until the draft actually differs", () => {
    renderCard();
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });

  it("discards the draft on cancel", () => {
    renderCard();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "throwaway" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
  });
});
