import { randomBytes } from 'crypto';

/**
 * Account recovery codes — one per account, app-generated, single-use.
 *
 * Generated rather than chosen: a chosen code is a birthday or 1234, which a
 * coworker can guess. 16 characters from a 32-letter alphabet is 80 bits, so
 * it cannot be guessed. The alphabet drops I, O, 0 and 1 because the code is
 * meant to be written down and typed back in by hand.
 *
 * Only a bcrypt hash is stored (hashed like a password, in lib/auth.ts), so
 * nobody — including an admin with the database — can read a code back.
 * Using it replaces it with a new one, so an account is never left without.
 */

export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_LENGTH = 16;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  // 256 is an exact multiple of 32, so taking each byte mod 32 is unbiased.
  let raw = '';
  for (const b of bytes) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
  return formatRecoveryCode(raw);
}

/** Uppercases and drops spaces and dashes, so "k7qf 2mxr-9tda wp4h" matches. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** "K7QF2MXR9TDAWP4H" -> "K7QF-2MXR-9TDA-WP4H". */
export function formatRecoveryCode(normalised: string): string {
  return normalised.match(/.{1,4}/g)?.join('-') ?? normalised;
}

/** Shape check only — says nothing about whether the code is right, so it is
 *  safe to report before touching any account. */
export function isWellFormedRecoveryCode(input: string): boolean {
  const n = normaliseRecoveryCode(input);
  return n.length === RECOVERY_CODE_LENGTH && [...n].every((c) => RECOVERY_ALPHABET.includes(c));
}
