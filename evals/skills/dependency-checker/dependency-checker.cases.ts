import type { SkillCase } from "../../src/index.js";

// This skill's job is to analyze real files (package.json, tsconfig.json, node_modules sizes),
// but "quality" cases run with no tools (skillTask measures the SKILL.md content in isolation —
// see tasks.ts). So each prompt inlines a small synthetic dataset the skill can reason over
// directly, standing in for what the skill would normally gather itself with Read/Bash/Grep.

const REPO_DATA = `Here is the data you'd normally gather yourself — treat it as already collected, and produce the report directly from it (do not ask for tool access or more data).

server/package.json dependencies: fastify@5.1.0, drizzle-orm@0.36.0, zod@3.23.8, pg@8.13.0, moment@2.30.1
server/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tsx@4.19.0
client/package.json dependencies: next@15.0.3, react@19.0.0, react-dom@19.0.0, @tanstack/react-query@5.59.0, zod@3.22.4, date-fns@4.1.0
client/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tailwindcss@3.4.14
reviewer-core/package.json dependencies: zod@3.23.8
reviewer-core/package.json devDependencies: typescript@5.6.3
e2e/package.json dependencies: (none runtime)
e2e/package.json devDependencies: playwright@1.48.2, typescript@5.6.3

Installed sizes (du -sh):
server/node_modules/moment: 4.2M
server/node_modules/drizzle-orm: 8.1M
server/node_modules/fastify: 6.5M
server/node_modules/pg: 3.8M
server/node_modules/zod: 2.1M
client/node_modules/next: 132M
client/node_modules/react-dom: 6.9M
client/node_modules/date-fns: 22M
client/node_modules/zod: 1.9M
reviewer-core/node_modules/zod: 2.1M
e2e/node_modules/playwright: 210M

server/package.json also declares zod@3.23.8, client/package.json declares zod@3.22.4, reviewer-core/package.json declares zod@3.23.8 — three different resolved zod versions across packages.

grep for imports crossing package boundaries:
- server/src/routes/reviews.ts imports types from "@shared/review-types" (alias to server/src/vendor/shared)
- server/src/services/review-service.ts imports "reviewer-core/src/pipeline.js" directly by relative path (not via the package's public entry point)
- client/src/lib/api-types.ts imports "@shared/review-types" (same alias as server)
- grep found no import of "moment" anywhere under server/src — only present in package.json`;

export const cases: SkillCase[] = [
  {
    name: "full report: overview, ranked findings, Mermaid graph, install priority",
    kind: "quality",
    prompt: `Run a dependency check on this repo. I want the full report: graph, sizes, prioritized findings, recommendations.

${REPO_DATA}`,
    grounding: ["```mermaid"],
    practices: [
      "the report has an overview/summary covering every analyzed package (server, client, reviewer-core, e2e) with per-package counts or sizes",
      "the report includes a Mermaid diagram (a fenced ```mermaid code block) showing dependency relationships between packages or their heaviest dependencies",
      "the report includes sizes as concrete numbers per dependency (e.g. next 132M, playwright 210M), not just a vague statement about size",
      "findings are ranked or prioritized by how actionable they are, not presented as an unordered list",
      "the report orders dependencies by install/load priority: runtime dependencies first, then build/test (dev) dependencies, heaviest first within each tier",
      "every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies'",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "distinguishes internal (path-alias) dependencies from external npm dependencies",
    kind: "quality",
    prompt: `This repo isn't a monorepo — server, client, reviewer-core, and e2e share code via TypeScript path aliases, not workspace:* packages. Analyze our dependencies, including how these packages depend on each other internally.

${REPO_DATA}`,
    practices: [
      "the answer explicitly distinguishes internal cross-package dependencies (the @shared/review-types alias and the direct relative import into reviewer-core/src/pipeline.js) from external npm package dependencies, rather than treating them as the same kind of dependency",
      "the answer explicitly calls out server/src/services/review-service.ts importing reviewer-core/src/pipeline.js by relative path instead of through reviewer-core's public entry point",
      "the answer does not claim these packages are linked via workspace:* or pnpm workspaces, since the project explicitly is not a monorepo",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "finds drift/unused deps and recommends specifically without acting",
    kind: "quality",
    prompt: `We suspect some npm dependencies in server/ and client/ are unused or duplicated across packages with different versions. Check our dependencies and tell me what to prioritize fixing first.

${REPO_DATA}`,
    practices: [
      "the different zod versions across server, client, and reviewer-core (3.23.8 / 3.22.4 / 3.23.8) are called out explicitly as version drift",
      "moment being declared in server/package.json but never imported anywhere under server/src is called out explicitly as an unused dependency",
      "findings are prioritized: the answer says what to fix first rather than listing everything with equal weight",
      "each recommendation names a specific package and file location (e.g. server/package.json, moment, zod) and, where relevant, what it would save (e.g. 4.2M from removing moment) rather than a generic suggestion",
      "removing a dependency (e.g. moment) is presented as a recommendation for the user to confirm, not something already executed",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
];
