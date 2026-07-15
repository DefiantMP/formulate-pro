import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import type { PotencyInput } from './calc-engine/types';

export function listRegrindLotPresets() {
  return prisma.regrindLotPreset.findMany({ orderBy: { name: 'asc' } });
}

export function createRegrindLotPreset(data: {
  name: string;
  potency: PotencyInput;
  disintegrantPercent: number | null;
  lubricantPercent: number | null;
}) {
  return prisma.regrindLotPreset.create({
    data: {
      name: data.name,
      potency: data.potency as unknown as Prisma.InputJsonValue,
      disintegrantPercent: data.disintegrantPercent,
      lubricantPercent: data.lubricantPercent,
    },
  });
}

export function deleteRegrindLotPreset(id: string) {
  return prisma.regrindLotPreset.delete({ where: { id } });
}
