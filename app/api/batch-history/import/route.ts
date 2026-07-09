import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Minimal CSV parser: comma-separated, one row per line, no quoted-field
 * escaping. Sufficient for the plain manufacturing exports this endpoint
 * targets.
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? '';
    });
    return row;
  });
}

/**
 * Expected CSV columns:
 *   date, tabletCount, targetWeightG, targetActiveMgPerTablet, notes, formulationName
 * `notes` and `formulationName` are optional.
 */
export async function POST(request: NextRequest) {
  const csvText = await request.text();
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Request body is empty — expected CSV text.' }, { status: 400 });
  }

  const rows = parseCsv(csvText);
  const errors: string[] = [];
  const toInsert: Prisma.BatchHistoryCreateManyInput[] = [];
  const formulationIdCache = new Map<string, string | null>();

  for (const [index, row] of rows.entries()) {
    const rowNum = index + 2; // +1 for header row, +1 for 1-indexing

    const date = new Date(row.date);
    const tabletCount = Number(row.tabletCount);
    const targetWeightG = Number(row.targetWeightG);
    const targetActiveMgPerTablet = Number(row.targetActiveMgPerTablet);

    if (isNaN(date.getTime())) {
      errors.push(`Row ${rowNum}: invalid date "${row.date}"`);
      continue;
    }
    if (!Number.isFinite(tabletCount)) {
      errors.push(`Row ${rowNum}: invalid tabletCount "${row.tabletCount}"`);
      continue;
    }
    if (!Number.isFinite(targetWeightG)) {
      errors.push(`Row ${rowNum}: invalid targetWeightG "${row.targetWeightG}"`);
      continue;
    }
    if (!Number.isFinite(targetActiveMgPerTablet)) {
      errors.push(`Row ${rowNum}: invalid targetActiveMgPerTablet "${row.targetActiveMgPerTablet}"`);
      continue;
    }

    let formulationId: string | null = null;
    if (row.formulationName) {
      if (formulationIdCache.has(row.formulationName)) {
        formulationId = formulationIdCache.get(row.formulationName)!;
      } else {
        const formulation = await prisma.formulation.findUnique({ where: { name: row.formulationName } });
        formulationId = formulation?.id ?? null;
        formulationIdCache.set(row.formulationName, formulationId);
      }
      if (!formulationId) {
        errors.push(`Row ${rowNum}: unknown formulationName "${row.formulationName}"`);
        continue;
      }
    }

    toInsert.push({
      date,
      tabletCount,
      targetWeightG,
      targetActiveMgPerTablet,
      notes: row.notes || null,
      formulationId,
    });
  }

  if (toInsert.length > 0) {
    await prisma.batchHistory.createMany({ data: toInsert });
  }

  const status = toInsert.length === 0 && errors.length > 0 ? 400 : 200;
  return NextResponse.json({ imported: toInsert.length, errors }, { status });
}
