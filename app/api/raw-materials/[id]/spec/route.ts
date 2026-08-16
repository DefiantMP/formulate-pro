import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseSpecCriterion, type SpecCriterionPayload } from '@/lib/rawMaterials';

/**
 * Create or replace a raw material's ComponentSpec and its criteria in one
 * write. PUT rather than POST/PATCH because the body is the full intended
 * criteria list, and the endpoint is idempotent: sending the same payload
 * twice leaves the same rows.
 *
 * Body: { name: string, criteria: SpecCriterionPayload[] }
 * A criterion with an `id` is edited in place; one without is created; one
 * that exists on the spec but is absent from the payload is RETIRED.
 *
 * Retire, never delete. LotSpecTest's FK to SpecCriterion is RESTRICT, so
 * deleting a criterion that has results would either be rejected by the
 * database or would have to cascade those results away — and a lot's test
 * history has to survive a spec revision. Retiring sets retiredAt, which
 * drops the criterion out of the active spec (and so out of
 * computeLotSpecStatus, which only considers criteria currently on the
 * spec) while leaving every LotSpecTest row untouched.
 *
 * The whole reconcile runs in one transaction so a spec revision can't land
 * half-applied — e.g. old criteria retired but their replacements not
 * created, which would silently loosen the spec.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { name, criteria } = body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!Array.isArray(criteria)) {
    return NextResponse.json({ error: 'criteria must be an array' }, { status: 400 });
  }

  const parsed: SpecCriterionPayload[] = [];
  for (const [index, raw] of criteria.entries()) {
    const result = parseSpecCriterion(raw, index);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    parsed.push(result.value);
  }

  const duplicateIds = parsed
    .map((c) => c.id)
    .filter((id, i, all): id is string => id !== undefined && all.indexOf(id) !== i);
  if (duplicateIds.length > 0) {
    return NextResponse.json(
      { error: `criteria contains the same id more than once: ${duplicateIds[0]}` },
      { status: 400 }
    );
  }

  const material = await prisma.rawMaterial.findUnique({
    where: { id: params.id },
    include: { spec: { include: { criteria: true } } },
  });
  if (!material) {
    return NextResponse.json({ error: 'Raw material not found' }, { status: 404 });
  }

  // Every submitted id must already belong to THIS spec — otherwise a
  // payload could reassign another material's criterion to this one.
  const existingIds = new Set((material.spec?.criteria ?? []).map((c) => c.id));
  for (const c of parsed) {
    if (c.id && !existingIds.has(c.id)) {
      return NextResponse.json(
        { error: `Criterion ${c.id} does not belong to this raw material's spec` },
        { status: 400 }
      );
    }
  }

  // Criteria surviving this revision: the ones submitted with an existing
  // id, plus — added inside the transaction below — the ids of any newly
  // created ones. Newly created rows MUST land here before the retire sweep
  // runs, or a spec write would create each new criterion and immediately
  // retire it in the same transaction.
  const keptIds = new Set(parsed.map((c) => c.id).filter((id): id is string => id !== undefined));
  const retiredAt = new Date();

  const spec = await prisma.$transaction(async (tx) => {
    const componentSpec = material.spec
      ? await tx.componentSpec.update({
          where: { id: material.spec.id },
          data: { name: name.trim() },
        })
      : await tx.componentSpec.create({
          data: { rawMaterialId: material.id, name: name.trim() },
        });

    for (const c of parsed) {
      if (c.id) {
        await tx.specCriterion.update({
          where: { id: c.id },
          data: {
            parameterName: c.parameterName,
            testType: c.testType,
            minValue: c.minValue,
            maxValue: c.maxValue,
            targetValue: c.targetValue,
            passCriteriaText: c.passCriteriaText,
            // Re-submitting a previously retired criterion revives it in
            // place, keeping its historical results attached, rather than
            // creating a duplicate parameter alongside the old one.
            retiredAt: null,
          },
        });
      } else {
        const created = await tx.specCriterion.create({
          data: {
            componentSpecId: componentSpec.id,
            parameterName: c.parameterName,
            testType: c.testType,
            minValue: c.minValue,
            maxValue: c.maxValue,
            targetValue: c.targetValue,
            passCriteriaText: c.passCriteriaText,
          },
        });
        keptIds.add(created.id);
      }
    }

    // Anything live on the spec but absent from the payload is retired —
    // never deleted. Already-retired rows keep their original retiredAt.
    await tx.specCriterion.updateMany({
      where: {
        componentSpecId: componentSpec.id,
        retiredAt: null,
        id: { notIn: [...keptIds] },
      },
      data: { retiredAt },
    });

    return tx.componentSpec.findUnique({
      where: { id: componentSpec.id },
      include: { criteria: { where: { retiredAt: null }, orderBy: { createdAt: 'asc' } } },
    });
  });

  return NextResponse.json(spec, { status: material.spec ? 200 : 201 });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const spec = await prisma.componentSpec.findUnique({
    where: { rawMaterialId: params.id },
    include: { criteria: { where: { retiredAt: null }, orderBy: { createdAt: 'asc' } } },
  });
  if (!spec) {
    return NextResponse.json({ error: 'No spec for this raw material' }, { status: 404 });
  }
  return NextResponse.json(spec);
}
