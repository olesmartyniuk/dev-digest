# Skill bodies

A skill's `body` is markdown that gets appended below an agent's `system_prompt`
as a `## Skills / rules` block (see `../README.md`'s "How a prompt is
assembled") whenever the skill is **linked to that agent** (`agent_skills`)
**and** the skill itself is **enabled**. It sharpens what an agent looks for;
it never redefines severity/verdict output structure — that stays in the
agent's own `system_prompt`.

- [`test-quality-rubric.md`](./test-quality-rubric.md) — seeded (`pnpm db:seed`)
  as an enabled skill linked to "Test Quality Reviewer".
- [`api-contract-rubric.md`](./api-contract-rubric.md) — **deliberately NOT
  seeded**. Import this file yourself through the Skills Lab's "Import from
  file" flow, enable it, then attach it to "API Contract Reviewer" — this is
  what exercises the whole import → preview → vet → attach path end to end,
  rather than faking it with a direct DB insert.
