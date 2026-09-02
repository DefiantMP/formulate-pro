import { prisma } from './db';
import { gmpFirstEnabledAt, type GmpSettingsShape, type LotStatusEnforcement } from './gmp';

/** Fixed id — GmpSettings is a singleton, same get-or-create shape as the
 *  default Formulation. */
export const GMP_SETTINGS_ID = 'singleton';

export async function getGmpSettings(): Promise<GmpSettingsShape> {
  const row = await prisma.gmpSettings.upsert({
    where: { id: GMP_SETTINGS_ID },
    update: {},
    create: { id: GMP_SETTINGS_ID },
  });
  return {
    enabled: row.enabled,
    lotStatusEnforcement: row.lotStatusEnforcement as LotStatusEnforcement,
  };
}

/**
 * Settings plus the moment enforcement began — almost every gate needs both,
 * and fetching them separately invites a caller to check the mode without
 * checking grandfathering, which would flag historical records.
 */
export async function getGmpContext(): Promise<{
  settings: GmpSettingsShape;
  firstEnabledAt: Date | null;
}> {
  const [settings, log] = await Promise.all([
    getGmpSettings(),
    prisma.gmpModeToggleLog.findMany({
      where: { newState: true },
      orderBy: { changedAt: 'asc' },
      take: 1,
      select: { newState: true, changedAt: true },
    }),
  ]);
  return { settings, firstEnabledAt: gmpFirstEnabledAt(log) };
}
