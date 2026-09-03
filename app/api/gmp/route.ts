import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getGmpSettings } from '@/lib/gmpSettings';
import { isLotStatusEnforcement } from '@/lib/gmp';
import { GMP_SETTINGS_ID } from '@/lib/gmpSettings';
import { getCurrentUser } from '@/lib/session';

/** Current settings plus the full toggle history — the log is the compliance
 *  artifact, so it is served alongside rather than behind a second call. */
export async function GET() {
  const settings = await getGmpSettings();
  const log = await prisma.gmpModeToggleLog.findMany({ orderBy: { changedAt: 'desc' }, take: 200 });
  return NextResponse.json({ ...settings, log });
}

/**
 * Change the mode and/or the lot-status enforcement fork.
 *
 * A change to `enabled` writes an append-only GmpModeToggleLog row in the same
 * transaction as the settings update, so the two can never disagree — a
 * settings row saying "on" with no log entry explaining who turned it on is
 * exactly the hole this feature exists to close. A no-op toggle (setting it to
 * the state it already has) writes nothing rather than padding the log.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { enabled, lotStatusEnforcement, note } = body;

  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }
  if (lotStatusEnforcement !== undefined && !isLotStatusEnforcement(lotStatusEnforcement)) {
    return NextResponse.json({ error: "lotStatusEnforcement must be 'warn' or 'block'" }, { status: 400 });
  }
  if (note !== null && note !== undefined && typeof note !== 'string') {
    return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 });
  }

  const current = await prisma.gmpSettings.upsert({
    where: { id: GMP_SETTINGS_ID },
    update: {},
    create: { id: GMP_SETTINGS_ID },
  });

  const changingMode = enabled !== undefined && enabled !== current.enabled;
  // Only a real state change needs an actor: adjusting the enforcement fork is
  // a configuration tweak, flipping the mode is the audit event. It must be
  // attributable to an account — a typed name proves nothing, which was the
  // whole point of adding auth.
  const actor = changingMode ? await getCurrentUser() : null;
  if (changingMode && !actor) {
    return NextResponse.json(
      { error: 'Sign in to change GMP mode — the change is recorded against your account.' },
      { status: 401 }
    );
  }

  const data: Record<string, unknown> = {};
  if (enabled !== undefined) data.enabled = enabled;
  if (lotStatusEnforcement !== undefined) data.lotStatusEnforcement = lotStatusEnforcement;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.gmpSettings.update({ where: { id: GMP_SETTINGS_ID }, data });
    if (changingMode) {
      await tx.gmpModeToggleLog.create({
        data: {
          actorId: actor!.id,
          previousState: current.enabled,
          newState: enabled as boolean,
          note: typeof note === 'string' && note.trim() ? note.trim() : null,
        },
      });
    }
    return row;
  });

  return NextResponse.json({
    enabled: updated.enabled,
    lotStatusEnforcement: updated.lotStatusEnforcement,
  });
}
