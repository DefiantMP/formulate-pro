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
  /** Physical/mechanical context (press, tooling size, fill cam behavior, hopper type, …) — optional, added 2026-07-29. */
  equipmentNotes: string | null;
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

// ---------------------------------------------------------------------------
// Cross-formulation knowledge for the troubleshooting chat.
//
// Goal: let the chatbot draw on relevant history from OTHER formulations'
// saved iterations (not just the current lineage, which
// buildTroubleshootSystemPrompt already covers in full), while keeping
// per-request cost roughly flat as the library grows into the hundreds.
//
// Two things keep this cheap regardless of library size:
//   1. Relevance filtering: a candidate with zero keyword overlap against
//      the current composition + the operator's message is excluded
//      outright, however recent it is — this is a text-search problem, not
//      a recency one, so we don't fall back to "just take the newest N".
//   2. Hard caps applied AFTER filtering, unconditionally:
//      CROSS_FORMULATION_MAX_ITEMS bounds how many iterations ever get
//      included, CROSS_FORMULATION_NOTE_MAX_CHARS bounds each one's text.
//      Even if hundreds of candidates score above zero, the prompt addition
//      this produces has a fixed ceiling.
//
// Upgrade path if keyword overlap ever proves too coarse (e.g. synonyms
// like "capping" vs "lamination" not matching): precompute and store an
// embedding per saved version at write time (one embedding call per save,
// not per chat message), then rank candidates by cosine similarity to an
// embedding of (current composition + operator message) instead of token
// overlap at query time. The shape stays the same — candidates in, a capped
// ranked CrossFormulationContext out — so callers wouldn't need to change.
// Not implemented here since keyword matching already satisfies "exclude
// the irrelevant, don't just take the most recent" without the added
// infrastructure (an embeddings table/column, an embedding API call on
// every save) that a codebase this size doesn't yet need.
// ---------------------------------------------------------------------------

/** Minimal projection of a SavedFormulation row for relevance search — keeps the DB read lean regardless of library size. */
export interface CrossFormulationCandidate {
  id: string;
  name: string;
  version: number;
  lineageId: string | null;
  createdAt: string;
  status: SavedFormulationStatus;
  outcomeNotes: string | null;
  equipmentNotes: string | null;
  actives: SavedFormulationActive[];
  fillerName: string;
  disintegrantName: string | null;
  lubricantName: string | null;
}

export interface RelevantCrossFormulationNote {
  id: string;
  name: string;
  version: number;
  status: SavedFormulationStatus;
  /** Number of overlapping keyword tokens against the query — higher is more relevant. */
  score: number;
  outcomeNotesExcerpt: string | null;
  equipmentNotesExcerpt: string | null;
}

export interface CrossFormulationContext {
  /** Empty string when nothing relevant matched — callers should treat that as "nothing to add", not an error. */
  promptText: string;
  matched: RelevantCrossFormulationNote[];
  /** chars/4 estimate — Anthropic doesn't expose a local tokenizer; good enough for cost observability, not exact billing. */
  estimatedTokens: number;
}

const CROSS_FORMULATION_MAX_ITEMS = 15;
const CROSS_FORMULATION_NOTE_MAX_CHARS = 300;

const STOPWORDS = new Set([
  'the', 'and', 'is', 'in', 'at', 'to', 'of', 'for', 'with', 'this', 'that',
  'was', 'were', 'not', 'but', 'or', 'as', 'on', 'it', 'be', 'are', 'has',
  'have', 'had', 'than', 'then', 'into', 'out', 'per', 'from', 'after', 'before',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9%]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

function compositionText(f: {
  actives: SavedFormulationActive[];
  fillerName: string;
  disintegrantName: string | null;
  lubricantName: string | null;
}): string {
  return [...f.actives.map((a) => a.label), f.fillerName, f.disintegrantName ?? '', f.lubricantName ?? ''].join(' ');
}

function truncateNote(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trimEnd()}…` : trimmed;
}

/**
 * Simple keyword-overlap relevance filter over OTHER formulations' saved
 * iterations (candidates from the current lineage are excluded — that
 * history is already included in full by buildTroubleshootSystemPrompt).
 * See the block comment above for the cost/design rationale.
 */
export function findRelevantCrossFormulationNotes(
  candidates: CrossFormulationCandidate[],
  currentLineageId: string,
  currentComposition: {
    actives: SavedFormulationActive[];
    fillerName: string;
    disintegrantName: string | null;
    lubricantName: string | null;
  },
  userMessage: string
): CrossFormulationContext {
  const queryTokens = tokenize(`${compositionText(currentComposition)} ${userMessage}`);

  const scored = candidates
    .filter((c) => effectiveLineageId(c) !== currentLineageId)
    .filter((c) => (c.outcomeNotes && c.outcomeNotes.trim()) || (c.equipmentNotes && c.equipmentNotes.trim()))
    .map((c) => {
      const docTokens = tokenize(`${compositionText(c)} ${c.name} ${c.outcomeNotes ?? ''} ${c.equipmentNotes ?? ''}`);
      let score = 0;
      for (const token of docTokens) {
        if (queryTokens.has(token)) score++;
      }
      return { candidate: c, score };
    })
    // The relevance bar itself: no overlap at all means excluded, full
    // stop — this is what makes it "relevance over recency-only" rather
    // than a flat recent-N cutoff that would include unrelated history.
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.candidate.createdAt).getTime() - new Date(a.candidate.createdAt).getTime())
    .slice(0, CROSS_FORMULATION_MAX_ITEMS);

  if (scored.length === 0) {
    return { promptText: '', matched: [], estimatedTokens: 0 };
  }

  const matched: RelevantCrossFormulationNote[] = scored.map(({ candidate, score }) => ({
    id: candidate.id,
    name: candidate.name,
    version: candidate.version,
    status: candidate.status,
    score,
    outcomeNotesExcerpt: candidate.outcomeNotes?.trim() ? truncateNote(candidate.outcomeNotes, CROSS_FORMULATION_NOTE_MAX_CHARS) : null,
    equipmentNotesExcerpt: candidate.equipmentNotes?.trim()
      ? truncateNote(candidate.equipmentNotes, CROSS_FORMULATION_NOTE_MAX_CHARS)
      : null,
  }));

  // [SUCCESS]/[FAILURE]/[ISSUE]/[UNTESTED] tags up front, per entry, so the
  // model can't blur "this worked" with "this didn't" the way a flat list
  // of notes would risk — required framing, not a nice-to-have.
  const lines = matched.map((m) => {
    const tag =
      m.status === 'passed' ? 'SUCCESS' : m.status === 'failed' ? 'FAILURE' : m.status === 'issue' ? 'ISSUE' : 'UNTESTED';
    const parts = [`[${tag}] "${m.name}" v${m.version}`];
    if (m.outcomeNotesExcerpt) parts.push(`Outcome: ${m.outcomeNotesExcerpt}`);
    if (m.equipmentNotesExcerpt) parts.push(`Equipment/tooling: ${m.equipmentNotesExcerpt}`);
    return parts.join(' — ');
  });

  const promptText = `Relevant history from OTHER formulations (matched by keyword overlap with this formulation's composition and the operator's message, most relevant first — not an exhaustive record, just what's related). [SUCCESS] and [FAILURE]/[ISSUE] are distinct signals: don't treat a failed attempt as evidence something works.
${lines.join('\n')}`;

  return { promptText, matched, estimatedTokens: Math.ceil(promptText.length / 4) };
}

/**
 * Serializes a formulation's full version chain (composition via
 * deriveSavedFormulation + recorded status/outcomeNotes) into the system
 * prompt for the troubleshooting chat (lib/chat.ts's runChatTurn). Read-only
 * text generation — never feeds into calculateFreshBatch/calculateRegrind or
 * any saved-formulation write.
 *
 * crossFormulationContext is purely additive: omit it (or pass one whose
 * promptText is empty, e.g. nothing relevant matched) and the output is
 * identical to the original per-lineage-only prompt — see
 * findRelevantCrossFormulationNotes below for how it's built.
 */
export function buildTroubleshootSystemPrompt(
  versions: SavedFormulationRecord[],
  crossFormulationContext?: CrossFormulationContext
): string {
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
    const equipmentText = v.equipmentNotes?.trim() || 'none';
    return `Version ${v.version} (${new Date(v.createdAt).toLocaleDateString()}): Actives: ${activesText}. ${excipientsText}. Status: ${savedFormulationStatusLabel(v.status)}. Notes: ${notesText}. Equipment/tooling: ${equipmentText}.`;
  });

  const crossSection = crossFormulationContext?.promptText ? `\n\n${crossFormulationContext.promptText}` : '';

  return `${TROUBLESHOOT_SYSTEM_PROMPT_PREFIX}

Formulation version history (oldest to newest):
${versionBlocks.join('\n')}${crossSection}

${TROUBLESHOOT_SYSTEM_PROMPT_SUFFIX}`;
}
