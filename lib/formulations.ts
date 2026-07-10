import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { defaultIngredients } from './calc-engine';

export const DEFAULT_FORMULATION_NAME = 'Default (API / Emdex / PVPP XL / MagSter)';

export async function getOrCreateDefaultFormulation() {
  const existing = await prisma.formulation.findUnique({
    where: { name: DEFAULT_FORMULATION_NAME },
  });
  if (existing) return existing;
  return prisma.formulation.create({
    data: {
      name: DEFAULT_FORMULATION_NAME,
      ingredients: defaultIngredients() as unknown as Prisma.InputJsonValue,
    },
  });
}
