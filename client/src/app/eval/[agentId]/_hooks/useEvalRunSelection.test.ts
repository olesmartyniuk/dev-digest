import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEvalRunSelection } from "./useEvalRunSelection";

describe("useEvalRunSelection", () => {
  it("enables Compare only at exactly two selections, and the third replaces the oldest", () => {
    const { result } = renderHook(() => useEvalRunSelection());
    expect(result.current.canCompare).toBe(false);

    act(() => result.current.toggle("a"));
    expect(result.current.canCompare).toBe(false);

    act(() => result.current.toggle("b"));
    expect(result.current.canCompare).toBe(true);
    expect(result.current.selected).toEqual(["a", "b"]);

    // third pick drops the oldest ("a"), still exactly two
    act(() => result.current.toggle("c"));
    expect(result.current.selected).toEqual(["b", "c"]);
    expect(result.current.canCompare).toBe(true);

    // un-ticking goes back below two
    act(() => result.current.toggle("b"));
    expect(result.current.selected).toEqual(["c"]);
    expect(result.current.canCompare).toBe(false);

    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
  });
});
