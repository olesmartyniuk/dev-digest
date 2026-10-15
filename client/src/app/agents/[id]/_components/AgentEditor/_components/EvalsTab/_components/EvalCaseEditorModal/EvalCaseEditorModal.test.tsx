import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { EvalCaseEditorModal } from "./EvalCaseEditorModal";
import { parseExpected, appendSkeleton, hasContradiction } from "./helpers";

afterEach(cleanup);

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}, 404))));
});

function renderModal(caseId: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalCaseEditorModal agentId="ag1" caseId={caseId} onRunCase={vi.fn()} onClose={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const expectedBox = () => screen.getByDisplayValue((v) => v.trim().startsWith("[")) as HTMLTextAreaElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("EvalCaseEditorModal", () => {
  it("gates Save and Run case on the expected-output JSON (valid / invalid / schema-invalid)", () => {
    renderModal();
    // fill the other required fields so ONLY the JSON can block Save
    type(screen.getByLabelText("Name"), "my-case");
    type(screen.getByPlaceholderText(/--- a\/src\/config\.ts/), "diff --git a/x b/x");

    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    // a new case can never be run before it is saved
    expect(screen.getByRole("button", { name: /Run case/ })).toBeDisabled();

    type(expectedBox(), "[{");
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Run case/ })).toBeDisabled();

    // valid JSON but not the expectation schema
    type(expectedBox(), '[{"line":1}]');
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByText("Doesn't match the expectation schema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // a correct item re-enables Save
    type(expectedBox(), '[{"kind":"must_find","file":"src/a.ts","start_line":3}]');
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it('"Finding skeleton" appends an item to the expected output', () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    const text = expectedBox().value;
    expect(JSON.parse(text)).toEqual([
      { kind: "must_find", severity: "CRITICAL", category: "security", title: "", file: "", start_line: 1 },
    ]);
  });
});

describe("eval case editor helpers", () => {
  it("parseExpected classifies json vs schema failures and rejects unknown keys", () => {
    expect(parseExpected("[]")).toEqual({ ok: true, items: [] });
    expect(parseExpected("nope")).toEqual({ ok: false, reason: "json" });
    expect(parseExpected('{"a":1}')).toEqual({ ok: false, reason: "schema" });
    expect(parseExpected('[{"kind":"must_find","file":"a.ts","line":3}]')).toEqual({ ok: false, reason: "schema" });
    expect(parseExpected('[{"kind":"must_find","file":"a.ts","start_line":0}]')).toEqual({ ok: false, reason: "schema" });
  });

  it("appendSkeleton recovers from unparseable text and hasContradiction spots overlapping items", () => {
    expect(JSON.parse(appendSkeleton("{"))).toHaveLength(1);
    expect(
      hasContradiction([
        { kind: "must_find", file: "a.ts", start_line: 5, end_line: 8 },
        { kind: "must_not_flag", file: "b/a.ts", start_line: 8 },
      ]),
    ).toBe(true);
    expect(
      hasContradiction([
        { kind: "must_find", file: "a.ts", start_line: 5 },
        { kind: "must_not_flag", file: "a.ts", start_line: 6 },
      ]),
    ).toBe(false);
  });
});
