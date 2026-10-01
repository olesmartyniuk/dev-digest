import { describe, it, expect } from 'vitest';
import { buildBlastSummary, toBlastRadiusResponse } from '../src/modules/blast/helpers.js';
import type { BlastFacadeResult } from '../src/modules/blast/types.js';

/**
 * Hermetic unit tests for the pure `BlastFacadeResult` → `BlastRadiusResponse`
 * reshape. See the plan's Step 2 "Mapping rules (exact)".
 */
describe('toBlastRadiusResponse', () => {
  it('(a) groups flat callers by viaSymbol, in changedSymbols order', () => {
    const r: BlastFacadeResult = {
      changedSymbols: [
        { file: 'a.ts', name: 'symA', kind: 'function' },
        { file: 'b.ts', name: 'symB', kind: 'function' },
      ],
      callers: [
        { file: 'caller1.ts', symbol: 'callerFnA', viaSymbol: 'symB', line: 10, rank: 1 },
        { file: 'caller2.ts', symbol: 'callerFnB', viaSymbol: 'symA', line: 20, rank: 2 },
        { file: 'caller3.ts', symbol: 'callerFnC', viaSymbol: 'symA', line: 30, rank: 3 },
      ],
      impactedEndpoints: [],
      degraded: false,
    };

    const res = toBlastRadiusResponse('pr1', r);
    expect(res.downstream).toHaveLength(2);
    expect(res.downstream[0]!.symbol).toBe('symA');
    expect(res.downstream[0]!.callers).toEqual([
      { name: 'callerFnB', file: 'caller2.ts', line: 20 },
      { name: 'callerFnC', file: 'caller3.ts', line: 30 },
    ]);
    expect(res.downstream[1]!.symbol).toBe('symB');
    expect(res.downstream[1]!.callers).toEqual([{ name: 'callerFnA', file: 'caller1.ts', line: 10 }]);
  });

  it('(b) attributes endpoints/crons per caller file to the right group only', () => {
    const r: BlastFacadeResult = {
      changedSymbols: [
        { file: 'a.ts', name: 'symA', kind: 'function' },
        { file: 'b.ts', name: 'symB', kind: 'function' },
      ],
      callers: [
        { file: 'fileA.ts', symbol: 'callerA', viaSymbol: 'symA', line: 1, rank: 1 },
        { file: 'fileB.ts', symbol: 'callerB', viaSymbol: 'symB', line: 2, rank: 1 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'fileA.ts': { endpoints: ['GET /x'], crons: [] },
        'fileB.ts': { endpoints: [], crons: ['nightly'] },
      },
      degraded: false,
    };

    const res = toBlastRadiusResponse('pr1', r);
    const symA = res.downstream.find((d) => d.symbol === 'symA')!;
    const symB = res.downstream.find((d) => d.symbol === 'symB')!;
    expect(symA.endpoints_affected).toEqual(['GET /x']);
    expect(symA.crons_affected).toEqual([]);
    expect(symB.endpoints_affected).toEqual([]);
    expect(symB.crons_affected).toEqual(['nightly']);
  });

  it('(c) degraded path: callers present, endpoints/crons empty, summary names the reason', () => {
    const r: BlastFacadeResult = {
      changedSymbols: [{ file: 'a.ts', name: 'symA', kind: 'function' }],
      callers: [{ file: 'caller.ts', symbol: 'callerA', viaSymbol: 'symA', line: 5, rank: 0 }],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };

    const res = toBlastRadiusResponse('pr1', r);
    expect(res.downstream).toHaveLength(1);
    expect(res.downstream[0]!.callers).toHaveLength(1);
    expect(res.downstream[0]!.endpoints_affected).toEqual([]);
    expect(res.downstream[0]!.crons_affected).toEqual([]);
    expect(res.degraded).toBe(true);
    expect(res.degraded_reason).toBe('no_data');
    expect(res.summary).toMatch(/index incomplete \(no_data\)$/);
  });

  it('(d) empty, non-degraded: no downstream groups, degraded false/null', () => {
    const r: BlastFacadeResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };

    const res = toBlastRadiusResponse('pr1', r);
    expect(res.downstream).toEqual([]);
    expect(res.degraded).toBe(false);
    expect(res.degraded_reason).toBeNull();
  });

  it('(e) a duplicate endpoint across two caller files in one group appears once', () => {
    const r: BlastFacadeResult = {
      changedSymbols: [{ file: 'a.ts', name: 'symA', kind: 'function' }],
      callers: [
        { file: 'fileA.ts', symbol: 'callerA', viaSymbol: 'symA', line: 1, rank: 2 },
        { file: 'fileB.ts', symbol: 'callerB', viaSymbol: 'symA', line: 2, rank: 1 },
      ],
      impactedEndpoints: ['GET /x'],
      factsByFile: {
        'fileA.ts': { endpoints: ['GET /x'], crons: [] },
        'fileB.ts': { endpoints: ['GET /x'], crons: [] },
      },
      degraded: false,
    };

    const res = toBlastRadiusResponse('pr1', r);
    expect(res.downstream[0]!.endpoints_affected).toEqual(['GET /x']);
  });
});

describe('buildBlastSummary', () => {
  it('is singular/plural aware and appends the degraded clause', () => {
    expect(buildBlastSummary(1, [], false, null)).toBe(
      '1 changed symbol · 0 callers · 0 endpoints · 0 cron jobs',
    );
    expect(
      buildBlastSummary(
        2,
        [
          {
            symbol: 's',
            callers: [{ name: 'c', file: 'f.ts', line: 1 }],
            endpoints_affected: ['GET /x'],
            crons_affected: [],
          },
        ],
        true,
        'index_partial',
      ),
    ).toBe('2 changed symbols · 1 caller · 1 endpoint · 0 cron jobs — index incomplete (index_partial)');
  });
});
