# Test Quality Rubric

Evaluate the tests changed in this diff against the following dimensions.
Return a finding only when skipping it would let a real regression slip
through — sharpen the reviewer's judgment, don't pad the list.

## Uncovered branches
- Does every new `if`/`else`, `switch`, ternary, `try`/`catch`, or early
  return have a test on its non-happy branch?
- A function with more than one possible outcome but only one test case is
  under-tested.

## Missed corner cases
- Empty / null / undefined / zero / negative / boundary inputs for logic that
  visibly depends on them.
- The failure path of an operation that can fail (network, DB write,
  validation) — not just its success path.

## Over-mocking
- A mock that replaces so much of the unit under test that the test would
  still pass if the real implementation were broken.
- Assertions on "was this mock called" instead of the resulting output or
  state change.

## Flakiness
- Real timers, `Date.now()`, or `Math.random()` used without fixing/mocking
  them.
- Shared mutable state across tests that could produce ordering-dependent
  failures.

Flag the exact `file:line` of the untested branch/input, or the weak
assertion/mock — never a generic "add more tests."
