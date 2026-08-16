import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  computeCriterionStatuses,
  lotSpecStatus,
  lotSpecStatusInclude,
} from '@/lib/lotSpecStatus';

/**
 * One lot, with its computed QC verdict and its full testing record.
 *
 * `specStatus` is computed here from the DB rather than stored on the row —
 * it's derived from the material's current criteria plus every test and OOS
 * investigation, all of which change independently of the lot. Storing it
 * would mean recomputing on every spec revision, test, and approval, with
 * the usual risk of the cached value drifting from the facts.
 *
 * `specTests` is the FULL history, not just the latest result per
 * criterion — including results for criteria since retired from the spec
 * (excluded from status, retained as record). `criterionStatuses` explains
 * which parameter is responsible for the overall verdict.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const lot = await prisma.lot.findUnique({
    where: { id: params.id },
    include: {
      ...lotSpecStatusInclude,
      specTests: {
        include: {
          oosInvestigations: true,
          specCriterion: true,
        },
        orderBy: { testedAt: 'desc' },
      },
    },
  });
  if (!lot) {
    return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
  }

  const criteria = lot.rawMaterial.spec?.criteria ?? [];

  return NextResponse.json({
    ...lot,
    specStatus: lotSpecStatus(lot),
    criterionStatuses: computeCriterionStatuses(criteria, lot.specTests),
  });
}
