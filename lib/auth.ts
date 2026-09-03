import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Password hashing and session tokens.
 *
 * bcrypt for hashing and jose for signing — both established libraries, no
 * hand-rolled crypto. jose is the same JWT implementation NextAuth uses
 * internally; NextAuth itself was not adopted because v5 is still beta and
 * brings provider/adapter configuration this single-company, single-database
 * tool has no use for.
 */

export const SESSION_COOKIE = 'fp_session';
/** Eight hours — roughly one shift. Long enough not to interrupt a batch,
 *  short enough that an unattended floor terminal does not stay signed in
 *  overnight. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const BCRYPT_ROUNDS = 12;

export type UserRole = 'operator' | 'reviewer' | 'admin';
export const USER_ROLES: readonly UserRole[] = ['operator', 'reviewer', 'admin'];
export function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v);
}
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  operator: 'Operator',
  reviewer: 'Reviewer',
  admin: 'Admin',
};

/** Who may give a GMP review sign-off. Operators run batches; someone else
 *  signs them off — that separation is the point of the review step. */
export function canReview(role: string): boolean {
  return role === 'reviewer' || role === 'admin';
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Basic password policy. Deliberately minimal — length is the property that
 * actually matters, and a thicket of composition rules pushes people toward
 * predictable substitutions written on a sticky note by the press.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  return null;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Failing loudly beats signing sessions with a guessable fallback: a
    // default secret in source would make every deployment's cookies
    // forgeable by anyone who can read the repo.
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns null for anything that does not verify — expired, tampered, or
 *  signed with a different secret. Callers treat null as "not logged in". */
export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { userId, email, name, role } = payload as unknown as SessionPayload;
    if (!userId || !email) return null;
    return { userId, email, name, role };
  } catch {
    return null;
  }
}
