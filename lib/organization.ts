/**
 * Single-tenant placeholder until real multi-org auth exists. Every write
 * that needs an organizationId calls this rather than inlining a literal,
 * so swapping in real per-request org resolution later (from a session,
 * subdomain, etc.) is a one-file change rather than a grep-and-replace.
 */
export const DEFAULT_ORGANIZATION_ID = 'default';

export function currentOrganizationId(): string {
  return DEFAULT_ORGANIZATION_ID;
}
