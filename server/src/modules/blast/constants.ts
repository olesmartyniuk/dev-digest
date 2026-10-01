import type { BlastDegradedReason } from '@devdigest/shared';

/**
 * L04 — domain layer (no I/O; imports only `@devdigest/shared` types —
 * `no-domain-outward`).
 */

/** Used when `container.repoIntel.getBlastRadius` throws (see service.ts) —
 *  reads must never 500 just because the index is broken. */
export const DEGRADED_FALLBACK_REASON = 'index_failed' as const satisfies BlastDegradedReason;
