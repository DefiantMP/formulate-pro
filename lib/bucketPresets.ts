import { prisma } from './db';

/**
 * Saved empty-bucket tare weights. Deliberately the same shape as
 * lib/regrindPresets.ts — list / create / delete only, no update endpoint:
 * a bucket's tare doesn't drift, and if one is entered wrong the fix is to
 * delete it and re-save rather than to silently rewrite the figure other
 * fills were computed against.
 */
export function listBucketPresets() {
  return prisma.bucketPreset.findMany({ orderBy: { name: 'asc' } });
}

export function createBucketPreset(data: { name: string; tareWeightG: number }) {
  return prisma.bucketPreset.create({
    data: { name: data.name, tareWeightG: data.tareWeightG },
  });
}

export function deleteBucketPreset(id: string) {
  return prisma.bucketPreset.delete({ where: { id } });
}
