import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { productsFrom } from '@/lib/productHistory';

/**
 * The distinct products that have runs, with how many runs each has.
 *
 * Derived from Run.product rather than stored in its own table: a product is
 * only meaningful here as "something we have made batches of", so the run
 * history IS the list. A separate table would need its own CRUD and could
 * drift out of step with the runs it claims to describe.
 */
export async function GET() {
  // deletedAt: null — an archived run's product name shouldn't keep
  // surfacing as a suggestion after the run itself is gone from history.
  const runs = await prisma.run.findMany({ where: { deletedAt: null }, select: { product: true } });
  return NextResponse.json(productsFrom(runs));
}
