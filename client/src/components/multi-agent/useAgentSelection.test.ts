import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentSelection } from "./useAgentSelection";

describe("useAgentSelection", () => {
  it("starts empty, toggles in order, selects all without duplicates, and clears", () => {
    const { result } = renderHook(() => useAgentSelection());
    expect(result.current.count).toBe(0);

    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("a"));
    expect(result.current.selected).toEqual(["b", "a"]);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(2);

    act(() => result.current.toggle("b"));
    expect(result.current.selected).toEqual(["a"]);

    act(() => result.current.selectAll(["a", "b", "b", "c"]));
    expect(result.current.selected).toEqual(["a", "b", "c"]);

    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
    expect(result.current.count).toBe(0);
  });
});
