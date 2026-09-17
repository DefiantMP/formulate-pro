import { describe, expect, it } from 'vitest';
import {
  RECOVERY_ALPHABET,
  formatRecoveryCode,
  generateRecoveryCode,
  isWellFormedRecoveryCode,
  normaliseRecoveryCode,
} from './recoveryCode';

describe('recovery codes', () => {
  it('look like XXXX-XXXX-XXXX-XXXX from a hand-copyable alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[IO01]/);
      expect(isWellFormedRecoveryCode(code)).toBe(true);
    }
  });

  it('are different every time', () => {
    const codes = new Set(Array.from({ length: 500 }, generateRecoveryCode));
    expect(codes.size).toBe(500);
  });

  it('uses a 32-letter alphabet, so bytes map to it without bias', () => {
    expect(RECOVERY_ALPHABET).toHaveLength(32);
    expect(new Set(RECOVERY_ALPHABET).size).toBe(32);
  });

  it('accepts the code typed with lowercase, spaces or missing dashes', () => {
    expect(normaliseRecoveryCode(' k7qf 2mxr-9tda wp4h ')).toBe('K7QF2MXR9TDAWP4H');
    expect(isWellFormedRecoveryCode('k7qf2mxr9tdawp4h')).toBe(true);
    expect(formatRecoveryCode('K7QF2MXR9TDAWP4H')).toBe('K7QF-2MXR-9TDA-WP4H');
  });

  it('rejects wrong lengths and letters that are never generated', () => {
    expect(isWellFormedRecoveryCode('K7QF-2MXR-9TDA')).toBe(false);
    expect(isWellFormedRecoveryCode('K7QF-2MXR-9TDA-WP4HX')).toBe(false);
    expect(isWellFormedRecoveryCode('K7QF-2MXR-9TDA-WP4O')).toBe(false);
    expect(isWellFormedRecoveryCode('')).toBe(false);
  });
});
