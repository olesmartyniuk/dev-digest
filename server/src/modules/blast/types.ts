import type { BlastDegradedReason } from '@devdigest/shared';

/**
 * L04 — structural mirror of repo-intel's `BlastResult` facade output
 * (`repo-intel/types.ts:74-87`). Declared locally rather than imported from
 * `../repo-intel/types.js`, because `no-cross-module-reach` forbids any
 * `src/modules/blast/**` → `src/modules/repo-intel/**` import, type-only
 * imports included (see `.dependency-cruiser.cjs`).
 *
 * This doubles as a compile-time drift guard: `service.ts` assigns the real
 * `container.repoIntel.getBlastRadius(...)` return value to this type, so if
 * repo-intel's `DegradedReason` union ever gains a member, `pnpm typecheck`
 * fails there instead of silently widening past this contract's enum.
 */
export interface BlastFacadeResult {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}
