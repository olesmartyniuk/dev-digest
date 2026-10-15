import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard - Turn into eval case", () => {
  it("is disabled with an explanatory tooltip while the finding is undecided", () => {
    const onTurn = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} onTurnIntoEval={onTurn} />);
    const btn = screen.getByRole("button", { name: /turn into eval case/i });
    expect(btn).toBeDisabled();
    expect(btn.closest("span[title]")).toHaveAttribute("title", expect.stringContaining("Accept or dismiss"));
    // the hint is also wired for assistive tech via aria-describedby
    const hintId = btn.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)).toHaveTextContent(/Accept or dismiss/);
    fireEvent.click(btn);
    expect(onTurn).not.toHaveBeenCalled();
  });

  it("is enabled and fires for an accepted or a dismissed finding", () => {
    const onTurn = vi.fn();
    const { unmount } = renderWithIntl(
      <FindingCard f={{ ...FINDING, accepted_at: "2026-10-01T00:00:00Z" }} defaultExpanded onTurnIntoEval={onTurn} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /turn into eval case/i }));
    expect(onTurn).toHaveBeenCalledTimes(1);
    unmount();

    renderWithIntl(
      <FindingCard f={{ ...FINDING, dismissed_at: "2026-10-01T00:00:00Z" }} defaultExpanded onTurnIntoEval={onTurn} />,
    );
    const btn = screen.getByRole("button", { name: /turn into eval case/i });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-describedby");
    fireEvent.click(btn);
    expect(onTurn).toHaveBeenCalledTimes(2);
  });

  it("renders no such action when the handler is not passed", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /turn into eval case/i })).not.toBeInTheDocument();
  });
});
