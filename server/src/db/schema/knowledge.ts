import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * Conventions Extractor (L02) candidates — one house rule mined from a repo.
 *
 * `accepted: boolean` was replaced by `status`: the UI needs a third state, and
 * "rejected" has to be durable, because a re-scan deletes only `pending` rows
 * and skips any rule the user already judged. `ruleKey` is the normalized rule
 * text used for that dedupe; `evidenceLine` is verified against the clone in
 * code before a row is ever written.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('structure'),
    rule: text('rule').notNull(),
    /** Normalized `rule` — the dedupe / "already judged" key within a repo. */
    ruleKey: text('rule_key').notNull().default(''),
    rationale: text('rationale'),
    evidencePath: text('evidence_path'),
    evidenceLine: integer('evidence_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    origin: text('origin', { enum: ['config', 'model'] }).notNull().default('model'),
    createdAt: now(),
  },
  (t) => ({
    repoIdx: index('conventions_repo_idx').on(t.repoId),
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
  }),
);
