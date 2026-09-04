import { describe, it, expect } from 'vitest';
import { parseLotUsages, validateLotUsages, type LotForUsage } from './runLotUsage';
import type { GmpSettingsShape } from './gmp';

const OFF: GmpSettingsShape = { enabled: false, lotStatusEnforcement: 'warn' };
const ON_WARN: GmpSettingsShape = { enabled: true, lotStatusEnforcement: 'warn' };
const ON_BLOCK: GmpSettingsShape = { enabled: true, lotStatusEnforcement: 'block' };

const identity = [{ testType: 'qualitative', retiredAt: null }];

function lot(over: Partial<LotForUsage> = {}): LotForUsage {
  return {
    id: 'lot1',
    lotLabel: 'L-1',
    quantityRemainingG: 1000,
    specStatus: 'pass',
    rawMaterial: { name: 'Mag stearate', spec: { criteria: identity } },
    ...over,
  };
}
const use = (over = {}) => ({ lotId: 'lot1', amountUsedG: 100, roleInRun: 'fresh_filler', ...over });

describe('parseLotUsages', () => {
  it('accepts an absent list — a run need not consume tracked lots', () => {
    expect(parseLotUsages(undefined)).toEqual({ ok: true, value: [] });
    expect(parseLotUsages(null)).toEqual({ ok: true, value: [] });
  });

  it('rejects a non-positive or non-numeric amount', () => {
    expect(parseLotUsages([use({ amountUsedG: 0 })]).ok).toBe(false);
    expect(parseLotUsages([use({ amountUsedG: -5 })]).ok).toBe(false);
    expect(parseLotUsages([use({ amountUsedG: 'lots' })]).ok).toBe(false);
  });

  it('rejects the same lot listed twice', () => {
    // Two entries would each draw down separately and read as two materials.
    const r = parseLotUsages([use(), use()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/twice/i);
  });
});

describe('validateLotUsages — quantity', () => {
  it('refuses consuming more than remains, regardless of GMP mode', () => {
    // Arithmetic, not policy: recording it leaves inventory that can never
    // reconcile.
    for (const settings of [OFF, ON_WARN, ON_BLOCK]) {
      const v = validateLotUsages([use({ amountUsedG: 1500 })], [lot()], settings);
      expect(v.errors.join(' ')).toMatch(/only 1000g remains/);
    }
  });

  it('allows consuming exactly what remains', () => {
    expect(validateLotUsages([use({ amountUsedG: 1000 })], [lot()], OFF).errors).toEqual([]);
  });

  it('reports an unknown lot rather than silently skipping it', () => {
    expect(validateLotUsages([use({ lotId: 'ghost' })], [lot()], OFF).errors.join(' ')).toMatch(/not found/i);
  });
});

describe('validateLotUsages — identity spec gate', () => {
  const noIdentity = lot({ rawMaterial: { name: 'Mystery powder', spec: { criteria: [{ testType: 'numeric_range', retiredAt: null }] } } });

  it('does not block with GMP mode off', () => {
    expect(validateLotUsages([use()], [noIdentity], OFF).errors).toEqual([]);
  });

  it('blocks a material with no identity spec when on', () => {
    expect(validateLotUsages([use()], [noIdentity], ON_WARN).errors.join(' ')).toMatch(/no identity specification/i);
  });

  it('does not count a retired identity criterion', () => {
    const retired = lot({ rawMaterial: { name: 'X', spec: { criteria: [{ testType: 'qualitative', retiredAt: new Date() }] } } });
    expect(validateLotUsages([use()], [retired], ON_WARN).errors.join(' ')).toMatch(/no identity specification/i);
  });

  it('allows a material that has one', () => {
    expect(validateLotUsages([use()], [lot()], ON_WARN).errors).toEqual([]);
  });
});

describe('validateLotUsages — failed/pending lot fork', () => {
  const failing = lot({ specStatus: 'fail' });
  const pending = lot({ specStatus: 'pending' });

  it('says nothing with GMP mode off', () => {
    const v = validateLotUsages([use()], [failing], OFF);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('warns without blocking under the warn setting', () => {
    const v = validateLotUsages([use()], [failing], ON_WARN);
    expect(v.errors).toEqual([]);
    expect(v.warnings.join(' ')).toMatch(/failed QC/i);
  });

  it('blocks under the block setting', () => {
    const v = validateLotUsages([use()], [failing], ON_BLOCK);
    expect(v.errors.join(' ')).toMatch(/failed QC/i);
    expect(v.warnings).toEqual([]);
  });

  it('treats an untested lot as an issue too, not as fine', () => {
    expect(validateLotUsages([use()], [pending], ON_WARN).warnings.join(' ')).toMatch(/not completed QC/i);
  });

  it('never raises anything for a passing lot', () => {
    const v = validateLotUsages([use()], [lot()], ON_BLOCK);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });
});
