import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashResetToken } from '@/lib/passwordReset';
import { inviteProblem } from '@/lib/invites';

/**
 * What the sign-in page needs before showing "Create account":
 *  - ?token= : is this invite usable, and for which email (so the form can
 *    show it, locked)?
 *  - no token : is the instance still in bootstrap (no active admin), where
 *    the first person may sign up without an invite?
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const bootstrap = (await prisma.user.count({ where: { role: 'admin', deletedAt: null } })) === 0;
  if (!token) return NextResponse.json({ bootstrap });

  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashResetToken(token) } });
  // Checked against the invite's own email, so only expiry/use/revocation can fail here.
  const problem = inviteProblem(invite, invite?.email ?? '', new Date());
  if (problem || !invite) return NextResponse.json({ bootstrap, error: problem }, { status: 400 });
  return NextResponse.json({ bootstrap, email: invite.email, role: invite.role });
}
