/**
 * Onion-architecture layer rules for @devdigest/api — enforces the dependency
 * direction documented in server/CLAUDE.md and .claude/skills/onion-architecture/.
 *
 * Run: `pnpm arch` (fails on NEW violations only — pre-existing drift is frozen
 * in .dependency-cruiser-known-violations.json via `--ignore-known`; regenerate
 * that file with `pnpm arch:baseline` after a deliberate, reviewed exception).
 *
 * This is a SEPARATE config from src/adapters/depgraph (which cruises a cloned
 * *target* repo at runtime for the repo-intel indexer) — this one polices
 * devdigest's own source.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-outward',
      severity: 'error',
      comment:
        "A module's helpers/constants/types are the domain layer — pure, no I/O. " +
        'They must not import Fastify, Drizzle/postgres, adapters, the DI container, or db/.',
      from: {
        path: '^src/modules/[^/]+/(helpers|constants|types)\\.ts$',
      },
      to: {
        path:
          'node_modules/(fastify|drizzle-orm|postgres)($|/)|^src/adapters/|^src/platform/container\\.ts$|^src/db/',
      },
    },
    {
      name: 'no-http-outside-presentation',
      severity: 'error',
      comment:
        'Fastify belongs to the presentation layer only: routes.ts, app.ts, the module ' +
        'registry, and the shared request-context helper. Services and repositories must ' +
        'stay framework-agnostic.',
      from: {
        pathNot: [
          '^src/modules/[^/]+/routes\\.ts$',
          '^src/modules/index\\.ts$',
          '^src/modules/_shared/context\\.ts$',
          '^src/app\\.ts$',
          '^src/server\\.ts$',
        ],
      },
      to: {
        path: 'node_modules/fastify($|/)',
      },
    },
    {
      name: 'no-sql-outside-persistence',
      severity: 'error',
      comment:
        'Drizzle/postgres are infrastructure. Only repository*.ts files and db/ may run ' +
        'queries — a service that needs data goes through its repository.',
      from: {
        pathNot: ['^src/modules/[^/]+/repository(\\.ts$|/)', '^src/db/'],
      },
      to: {
        path: 'node_modules/(drizzle-orm|postgres)($|/)',
      },
    },
    {
      name: 'no-service-imports-adapters-directly',
      severity: 'error',
      comment:
        'Services depend on the port interfaces resolved from the Container ' +
        '(container.git, container.llm(), …), never on a concrete adapter class. ' +
        'Construct/inject the adapter in platform/container.ts instead.',
      from: {
        path: '^src/modules/[^/]+/(service|run-executor)\\.ts$',
      },
      to: {
        path: '^src/adapters/',
      },
    },
    {
      name: 'no-cross-module-reach',
      severity: 'error',
      comment:
        "One module may not reach into another module's folder — cross-module entities " +
        '(agents, reviews, repo-intel, …) go through platform/container.ts. `_shared/` is ' +
        "the one exempt, deliberately cross-module folder.",
      from: {
        path: '^src/modules/([^/]+)/',
      },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports are a common symptom of a broken dependency direction.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
};
