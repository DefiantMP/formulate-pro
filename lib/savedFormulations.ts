import { activePercentOfBlendFromDose } from './calc-engine';

/** One active ingredient within a drafted/reference formulation. */
export interface SavedFormulationActive {
  label: string;
  targetMgPerTablet: number;
  potencyPercent: number;
  /** Free-text description of the raw material's source, e.g. a vendor or COA reference — informational only. */
  source: string;
}

/** Drafting-stage outcome for one iteration — independent of Run's production-lab COA fields. */
export type SavedFormulationStatus = 'untested' | 'passed' | 'failed' | 'issue';

export const SAVED_FORMULATION_STATUSES: SavedFormulationStatus[] = ['untested', 'passed', 'failed', 'issue'];

export function savedFormulationStatusLabel(status: SavedFormulationStatus): string {
  switch (status) {
    case 'untested':
      return 'Untested';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'issue':
      return 'Issue noted';
  }
}

/** Shape returned by /api/saved-formulations — mirrors the SavedFormulation Prisma model. */
export interface SavedFormulationRecord {
  id: string;
  name: string;
  tabletWeightG: number;
  referenceBatchTablets: number;
  actives: SavedFormulationActive[];
  fillerName: string;
  disintegrantName: string | null;
  disintegrantPercent: number | null;
  lubricantName: string | null;
  lubricantPercent: number | null;
  notes: string | null;
  createdAt: string;
  /** Groups every version of one formulation together; null means this row is its own lineage root — see effectiveLineageId. */
  lineageId: string | null;
  version: number;
  parentId: string | null;
  status: SavedFormulationStatus;
  outcomeNotes: string | null;
}

/**
 * Every version in one lineage shares this id. A lineage root's own
 * lineageId is null (rather than a self-referencing value written at create
 * time, since the row's id isn't known until after insert) — every consumer
 * that needs "all versions of this formulation" must fall back to the row's
 * own id, mirroring this project's established nullable-additive-column +
 * in-code-fallback pattern (see Run's COA fields).
 */
export function effectiveLineageId(f: { id: string; lineageId: string | null }): string {
  return f.lineageId ?? f.id;
}

export interface SavedFormulationActiveDerived extends SavedFormulationActive {
  percentOfBlend: number;
  gramsPerBatch: number;
}

export interface SavedFormulationDerived {
  actives: SavedFormulationActiveDerived[];
  combinedActivePercent: number;
  fillerPercent: number;
  fillerGramsPerBatch: number;
  disintegrantGramsPerBatch: number | null;
  lubricantGramsPerBatch: number | null;
  totalBatchG: number;
}

/**
 * Derives every display value the library/detail/builder pages need from a
 * formulation's raw stored fields — the mg/tablet -> %-of-blend conversion
 * reuses activePercentOfBlendFromDose from the calc engine (the same
 * derivation calculateFreshBatch performs internally); everything else here
 * is a simple grams = totalBatchG * percent/100 multiplication, not a calc
 * engine concern. This is a sandbox/reference-sheet formulation, never fed
 * into calculateFreshBatch or calculateRegrind.
 */
export function deriveSavedFormulation(f: {
  tabletWeightG: number;
  referenceBatchTablets: number;
  actives: SavedFormulationActive[];
  disintegrantPercent: number | null;
  lubricantPercent: number | null;
}): SavedFormulationDerived {
  const totalBatchG = f.tabletWeightG * f.referenceBatchTablets;

  const actives: SavedFormulationActiveDerived[] = f.actives.map((a) => {
    const percentOfBlend = activePercentOfBlendFromDose(a.targetMgPerTablet, a.potencyPercent, f.tabletWeightG);
    return { ...a, percentOfBlend, gramsPerBatch: totalBatchG * (percentOfBlend / 100) };
  });

  const combinedActivePercent = actives.reduce((sum, a) => sum + a.percentOfBlend, 0);
  const fixedPercentSum = combinedActivePercent + (f.disintegrantPercent ?? 0) + (f.lubricantPercent ?? 0);
  const fillerPercent = Math.max(0, 100 - fixedPercentSum);

  return {
    actives,
    combinedActivePercent,
    fillerPercent,
    fillerGramsPerBatch: totalBatchG * (fillerPercent / 100),
    disintegrantGramsPerBatch: f.disintegrantPercent != null ? totalBatchG * (f.disintegrantPercent / 100) : null,
    lubricantGramsPerBatch: f.lubricantPercent != null ? totalBatchG * (f.lubricantPercent / 100) : null,
    totalBatchG,
  };
}

const TROUBLESHOOT_SYSTEM_PROMPT_PREFIX = `You are an advisory formulation-troubleshooting assistant for a nutraceutical tablet manufacturer. An operator is drafting/iterating a base formulation (not a live production run) and describes a manufacturing issue they've hit (e.g. capping, sticking, poor flow, inconsistent weight). Use the version history below — what changed between versions and what outcome each version had — to ground your suggestions in this formulation's own track record rather than generic advice alone.`;

const TROUBLESHOOT_SYSTEM_PROMPT_SUFFIX = `Suggest specific, concrete changes to try next (e.g. a particular excipient percentage to adjust, a potency/source to revisit), referencing what actually differed between versions and their recorded outcomes when relevant. Your suggestions are advisory only for the operator to review — you are not making any change to the formulation yourself, and must not phrase suggestions as if you already applied them. If the version history doesn't clearly point to a cause, say so plainly rather than guessing with false confidence. Keep responses focused and practical — a short paragraph or a short list, not an essay.`;

/**
 * Serializes a formulation's full version chain (composition via
 * deriveSavedFormulation + recorded status/outcomeNotes) into the system
 * prompt for the troubleshooting chat (lib/chat.ts's runChatTurn). Read-only
 * text generation — never feeds into calculateFreshBatch/calculateRegrind or
 * any saved-formulation write.
 */
export function buildTroubleshootSystemPrompt(versions: SavedFormulationRecord[]): string {
  const sorted = [...versions].sort((a, b) => a.version - b.version);

  const versionBlocks = sorted.map((v) => {
    const derived = deriveSavedFormulation(v);
    const activesText =
      derived.actives
        .map((a) => `${a.label} ${a.targetMgPerTablet}mg/tab @ ${a.potencyPercent}% potency (${a.percentOfBlend.toFixed(3)}% of blend)`)
        .join('; ') || 'none';
    const excipientsText = [
      `Filler: ${v.fillerName} ${derived.fillerPercent.toFixed(2)}%`,
      v.disintegrantName ? `Disintegrant: ${v.disintegrantName} ${v.disintegrantPercent ?? 0}%` : null,
      v.lubricantName ? `Lubricant: ${v.lubricantName} ${v.lubricantPercent ?? 0}%` : null,
    ]
      .filter(Boolean)
      .join('; ');
    const notesText = v.outcomeNotes?.trim() || 'none';
    return `Version ${v.version} (${new Date(v.createdAt).toLocaleDateString()}): Actives: ${activesText}. ${excipientsText}. Status: ${savedFormulationStatusLabel(v.status)}. Notes: ${notesText}.`;
  });

  return `${TROUBLESHOOT_SYSTEM_PROMPT_PREFIX}

Formulation version history (oldest to newest):
${versionBlocks.join('\n')}

${TROUBLESHOOT_SYSTEM_PROMPT_SUFFIX}`;
}
