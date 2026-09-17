/**
 * Last-resort account recovery, run on the computer hosting the app:
 *
 *   npm run reset-password                   list accounts
 *   npm run reset-password -- you@company.com
 *
 * For someone who has forgotten their password AND lost their recovery code,
 * when no admin can issue a reset link (e.g. the only admin). Anyone who can
 * run this can already read and edit the database file, so it grants nothing
 * new — which is why it needs no password.
 *
 * Sets a random temporary password, ends every session for the account and
 * clears any sign-in lock, then prints the password once. The person signs in
 * with it and changes it under Settings -> Your account, where they should
 * also create a new recovery code. It never reactivates a deactivated account
 * or changes a role.
 */
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';
import { normaliseEmail } from '../lib/loginThrottle';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    console.log('Accounts:');
    for (const u of users) {
      console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(9)} ${u.deletedAt ? 'deactivated' : 'active'}`);
    }
    console.log('\nUsage: npm run reset-password -- <email>');
    return;
  }

  const email = normaliseEmail(arg);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account with email ${email}. Run without an email to list accounts.`);
    process.exitCode = 1;
    return;
  }
  if (user.deletedAt) {
    console.error(`${email} is deactivated. An admin must reactivate it first (Settings -> Accounts).`);
    process.exitCode = 1;
    return;
  }

  const temporary = randomBytes(12).toString('base64url');
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(temporary), sessionsValidFrom: now } }),
    prisma.loginThrottle.deleteMany({ where: { email } }),
  ]);

  console.log(`Temporary password for ${email} (${user.role}):\n\n  ${temporary}\n`);
  console.log('Sign in with it, then change it under Settings -> Your account, and create a new recovery code there.');
  console.log('All existing sessions for this account have been signed out.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
