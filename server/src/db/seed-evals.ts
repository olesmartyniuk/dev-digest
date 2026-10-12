import type { EvalExpectationItem } from '@devdigest/shared';

/**
 * Hand-authored eval set for the seeded Security Reviewer (SPEC-04 "Seeding
 * story", decision D6). PURE DATA — no drizzle import — so the shape test stays
 * hermetic; `seed.ts` inserts these idempotently by owner + name.
 *
 * Why synthetic: the seeded PR has no stored patches, so there is no real diff
 * to freeze. Every expectation range sits on an ADDED (new-side) line of its own
 * hunk, so the grounding gate can keep a finding there (proves each case is
 * satisfiable). Secret-looking strings are obviously fake (decision D9).
 */

export interface SeedEvalCase {
  name: string;
  input_diff: string;
  input_meta: { title: string; body: string; origin: 'seed' };
  expected_output: EvalExpectationItem[];
  notes: string;
}

/** One-hunk unified diff for `file`. Line prefixes: ' ' context, '+' added, '-' removed. */
function fileDiff(
  file: string,
  newStart: number,
  lines: string[],
): { text: string; lineOf: (index: number) => number } {
  const oldCount = lines.filter((l) => l[0] !== '+').length;
  const newCount = lines.filter((l) => l[0] !== '-').length;
  const text =
    [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      `@@ -${newStart},${oldCount} +${newStart},${newCount} @@`,
      ...lines,
    ].join('\n') + '\n';
  const lineOf = (index: number) => {
    let n = newStart;
    for (let i = 0; i < index; i++) if (lines[i]![0] !== '-') n++;
    return n;
  };
  return { text, lineOf };
}

function mustFind(
  file: string,
  line: number,
  title: string,
  category: EvalExpectationItem['category'] = 'security',
): EvalExpectationItem {
  return { kind: 'must_find', file, start_line: line, end_line: line, severity: 'CRITICAL', category, title };
}

function mustNotFlag(file: string, line: number, title: string): EvalExpectationItem {
  return { kind: 'must_not_flag', file, start_line: line, end_line: line, title };
}

function meta(title: string, body: string): SeedEvalCase['input_meta'] {
  return { title, body, origin: 'seed' };
}

// ---- 1. must_find: hardcoded key (matches the seeded finding at src/config.ts:12) ----
const stripe = fileDiff('src/config.ts', 8, [
  ' export const config = {',
  '   port: 3000,',
  '   env: process.env.NODE_ENV,',
  '   currency: "usd",',
  '+  stripeKey: "sk_live_EXAMPLE_NOT_A_REAL_KEY_000",',
  ' };',
]);

// ---- 2. must_find: SSRF ----
const ssrf = fileDiff('src/api/public/webhooks.ts', 20, [
  ' export async function forward(req: Request) {',
  '   const { payload } = req.body;',
  '+  const res = await fetch(req.body.callbackUrl, { method: "POST", body: JSON.stringify(payload) });',
  '   return res.status;',
  ' }',
]);

// ---- 3. must_find: service-role key shipped to the browser ----
const serviceRole = fileDiff('web/src/lib/supabase.ts', 1, [
  ' import { createClient } from "@supabase/supabase-js";',
  ' ',
  '+export const browserClient = createClient(',
  '+  process.env.NEXT_PUBLIC_SUPABASE_URL!,',
  '+  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,',
  '+);',
]);

// ---- 4. must_find: SQL injection ----
const sqlInjection = fileDiff('src/db/users.ts', 14, [
  ' export async function findUser(req: Request) {',
  '+  const rows = await db.query(`SELECT * FROM users WHERE email = \'${req.query.email}\'`);',
  '   return rows[0];',
  ' }',
]);

// ---- 5. must_not_flag: correct env read ----
const envRead = fileDiff('src/config.ts', 8, [
  ' export const config = {',
  '   port: 3000,',
  '+  paymentsSecret: process.env.STRIPE_SECRET_KEY,',
  ' };',
]);

// ---- 6. must_not_flag: parameterized query ----
const parameterized = fileDiff('src/db/orders.ts', 5, [
  ' export function getOrder(orderId: string) {',
  '+  return sql`SELECT * FROM orders WHERE id = ${orderId}`;',
  ' }',
]);

// ---- 7. must_not_flag: missing Retry-After is not a security issue ----
const retryAfter = fileDiff('src/middleware/ratelimit.ts', 30, [
  ' if (count > limit) {',
  '+  return res.status(429).json({ error: "Too many requests" });',
  ' }',
]);

// ---- 8. must_not_flag: dummy token in a test fixture ----
const dummyToken = fileDiff('test/fixtures/auth.ts', 1, [
  ' // fixtures for the auth tests',
  "+export const DUMMY_TOKEN = 'not-a-secret';",
  ' export const DUMMY_USER = { id: "u1" };',
]);

// ---- 9. empty expectation: pure rename ----
const cleanRefactor = fileDiff('src/utils/format.ts', 3, [
  ' /** Format a minor-unit amount as dollars. */',
  '-export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;',
  '+export const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;',
]);

export const SECURITY_REVIEWER_EVAL_CASES: readonly SeedEvalCase[] = [
  {
    name: 'stripe-key-leak',
    input_diff: stripe.text,
    input_meta: meta('Add Stripe config', 'Adds the payments key so checkout can talk to Stripe.'),
    expected_output: [mustFind('src/config.ts', stripe.lineOf(4), 'Hardcoded Stripe secret key in commit')],
    notes: 'Must find: a live-looking secret key committed to source.',
  },
  {
    name: 'ssrf-webhook',
    input_diff: ssrf.text,
    input_meta: meta('Forward webhook payloads', 'Relays the event to the callback URL the caller supplies.'),
    expected_output: [mustFind('src/api/public/webhooks.ts', ssrf.lineOf(2), 'SSRF via user-controlled callback URL')],
    notes: 'Must find: server-side fetch of an unvalidated, request-supplied URL.',
  },
  {
    name: 'service-role-in-client',
    input_diff: serviceRole.text,
    input_meta: meta('Add browser Supabase client', 'Creates the client used by the dashboard.'),
    expected_output: [
      mustFind('web/src/lib/supabase.ts', serviceRole.lineOf(4), 'Service-role key exposed to the browser'),
    ],
    notes: 'Must find: a NEXT_PUBLIC_ env var carrying a service-role key.',
  },
  {
    name: 'sql-injection-raw-query',
    input_diff: sqlInjection.text,
    input_meta: meta('Look up user by email', 'Adds a lookup helper.'),
    expected_output: [mustFind('src/db/users.ts', sqlInjection.lineOf(1), 'SQL injection via string interpolation')],
    notes: 'Must find: request input interpolated into a raw SQL string.',
  },
  {
    name: 'env-secret-read',
    input_diff: envRead.text,
    input_meta: meta('Read payments secret from env', 'Moves the key out of source and into the environment.'),
    expected_output: [mustNotFlag('src/config.ts', envRead.lineOf(2), 'Reading a secret from process.env is the correct pattern')],
    notes: 'Must not flag: the secure way to load a secret.',
  },
  {
    name: 'parameterized-query',
    input_diff: parameterized.text,
    input_meta: meta('Fetch order by id', 'Adds an order lookup.'),
    expected_output: [mustNotFlag('src/db/orders.ts', parameterized.lineOf(1), 'Tagged-template query is parameterized')],
    notes: 'Must not flag: a naive prompt over-flags template literals in SQL.',
  },
  {
    name: 'missing-retry-after',
    input_diff: retryAfter.text,
    input_meta: meta('Return 429 when over the limit', 'Rate limiter rejects excess requests.'),
    expected_output: [mustNotFlag('src/middleware/ratelimit.ts', retryAfter.lineOf(1), 'Missing Retry-After header is not a security issue')],
    notes: 'Must not flag: a correctness nit, out of scope for a security review.',
  },
  {
    name: 'test-fixture-dummy-token',
    input_diff: dummyToken.text,
    input_meta: meta('Add auth test fixtures', 'Fixtures for the auth tests.'),
    expected_output: [mustNotFlag('test/fixtures/auth.ts', dummyToken.lineOf(1), 'Dummy token in a test fixture is not a secret')],
    notes: 'Must not flag: an obviously fake placeholder in test data.',
  },
  {
    name: 'clean-refactor-no-flags',
    input_diff: cleanRefactor.text,
    input_meta: meta('Rename fmt to formatCurrency', 'Pure rename, no behaviour change.'),
    expected_output: [],
    notes: 'Empty expectation: a clean refactor must produce no findings.',
  },
];
