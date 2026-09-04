import {
  hasIdentitySpec,
  lotConsumptionIssues,
  type GmpSettingsShape,
  type LotConsumptionIssue,
} from './gmp';

/**
 * Validation for the lots a run consumes.
 *
 * Pure, like the rest of the GMP rules, so the two gates CLAUDE.md recorded as
 * unreachable — identity-spec blocking and the failed/pending-lot fork — can
 * be read and tested without a database or a route.
 */

export interface LotUsageInput {
  lotId: string;
  amountUsedG: number;
  roleInRun: string;
}

/** A lot as loaded for validation, with everything both gates need. */
export interface LotForUsage {
  id: string;
  lotLabel: string;
  quantityRemainingG: number;
  specStatus: 'pass' | 'fail' | 'pending';
  rawMaterial: {
    name: string;
    spec?: { criteria: { testType: string; retiredAt?: Date | string | null }[] } | null;
  };
}

export interface UsageValidation {
  /** Refusals — the save must not proceed. */
  errors: string[];
  /** Surfaced to the operator but not blocking. */
  warnings: string[];
}

export function parseLotUsages(raw: unknown): { ok: true; value: LotUsageInput[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'lotUsages must be an array' };
  const out: LotUsageInput[] = [];
  for (const [i, entry] of raw.entries()) {
    const e = (entry ?? {}) as Record<string, unknown>;
    if (typeof e.lotId !== 'string' || !e.lotId.trim()) {
      return { ok: false, error: `lotUsages[${i}].lotId is required` };
    }
    if (typeof e.amountUsedG !== 'number' || !Number.isFinite(e.amountUsedG) || e.amountUsedG <= 0) {
      return { ok: false, error: `lotUsages[${i}].amountUsedG must be a positive number` };
    }
    if (typeof e.roleInRun !== 'string' || !e.roleInRun.trim()) {
      return { ok: false, error: `lotUsages[${i}].roleInRun is required` };
    }
    out.push({ lotId: e.lotId, amountUsedG: e.amountUsedG, roleInRun: e.roleInRun.trim() });
  }
  const seen = new Set<string>();
  for (const u of out) {
    if (seen.has(u.lotId)) {
      return { ok: false, error: 'The same lot appears twice — combine the amounts into one entry.' };
    }
    seen.add(u.lotId);
  }
  return { ok: true, value: out };
}

/**
 * Both GMP gates, plus the one check that applies regardless of the mode.
 *
 * Consuming more of a lot than remains is refused whether or not GMP mode is
 * on: it is an arithmetic impossibility rather than a compliance policy, and
 * recording it would leave inventory that can never reconcile.
 */
export function validateLotUsages(
  usages: LotUsageInput[],
  lots: LotForUsage[],
  settings: GmpSettingsShape
): UsageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(lots.map((l) => [l.id, l]));

  for (const usage of usages) {
    const lot = byId.get(usage.lotId);
    if (!lot) {
      errors.push(`Lot ${usage.lotId} was not found.`);
      continue;
    }
    if (usage.amountUsedG > lot.quantityRemainingG) {
      errors.push(
        `Lot ${lot.lotLabel}: ${usage.amountUsedG}g requested but only ${lot.quantityRemainingG}g remains.`
      );
    }
    // Identity spec — the most-cited Part 111 observation. Gates NEW usage
    // only; nothing revokes a material already consumed by an earlier run.
    if (settings.enabled && !hasIdentitySpec(lot.rawMaterial)) {
      errors.push(
        `GMP mode: ${lot.rawMaterial.name} has no identity specification on file. Add a qualitative identity criterion to its component spec before using it.`
      );
    }
  }

  // The warn/block fork, deferred until GMP mode existed because hardcoding
  // either behavior would be wrong for half of users.
  const consumption: LotConsumptionIssue[] = lotConsumptionIssues(
    usages
      .map((u) => byId.get(u.lotId))
      .filter((l): l is LotForUsage => !!l)
      .map((l) => ({ lotLabel: l.lotLabel, specStatus: l.specStatus })),
    settings
  );
  for (const issue of consumption) {
    if (issue.blocking) errors.push(`${issue.message} GMP mode is set to block these.`);
    else warnings.push(issue.message);
  }

  return { errors, warnings };
}
