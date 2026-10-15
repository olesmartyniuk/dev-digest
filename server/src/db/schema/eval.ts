import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';
import { now } from './_shared';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    /** Set when owner_kind='agent' — gives "agent deleted -> cases cascade" a real FK. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    /** Source finding for cases created via "Turn into eval case" (unique -> dedupe). */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    createdAt: now(),
  },
  (t) => ({
    // Postgres treats NULLs as distinct, so manual/seed cases (NULL) never collide.
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
  }),
);

/** One eval run over an agent's cases (a "batch"); per-case rows live in `eval_runs`. */
export const evalBatches = pgTable(
  'eval_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    /** Snapshot of the config the run used: provider, model, system_prompt, strategy, skill_ids. */
    configJson: jsonb('config_json').notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] })
      .notNull()
      .default('running'),
    partial: boolean('partial').notNull().default(false),
    caseIds: jsonb('case_ids').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    aggregate: jsonb('aggregate'),
    na: jsonb('na'),
    costUsd: doublePrecision('cost_usd'),
    erroredCount: integer('errored_count').notNull().default(0),
    error: text('error'),
  },
  (t) => ({
    agentStartedIdx: index('eval_batches_agent_started_idx').on(t.agentId, t.startedAt),
    // AC-18: at most one active eval run per agent, enforced by the DB.
    oneRunningPerAgent: uniqueIndex('eval_batches_one_running_per_agent')
      .on(t.agentId)
      .where(sql`status = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    batchId: uuid('batch_id').references(() => evalBatches.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    batchIdx: index('eval_runs_batch_idx').on(t.batchId),
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
