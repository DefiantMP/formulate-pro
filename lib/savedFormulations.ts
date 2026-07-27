import { activePercentOfBlendFromDose } from './calc-engine';

/** One active ingredient within a drafted/reference formulation. */
export interface SavedFormulationActive {
  label: string;
  targetMgPerTablet: number;
  potencyPercent: number;
  /** Free-text description of the raw material's source, e.g. a vendor or COA reference — informational only. */
  source: string;
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
