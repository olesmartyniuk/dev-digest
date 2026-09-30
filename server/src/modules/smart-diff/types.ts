/**
 * Internal shapes of the Smart Diff classifier. Domain layer — pure types
 * only, no Fastify / Drizzle / adapter imports (`no-domain-outward`).
 */

/** The minimal per-file shape `buildSmartDiff` needs — a `pr_files` row
 *  projected down to path + line counts. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}
