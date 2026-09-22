/**
 * Crée (ou promeut) un compte administrateur.
 *
 *   npm run admin:create -- admin@exemple.com "MotDePasseSolide"
 *
 * - Si le compte n'existe pas, il est créé avec ce mot de passe.
 * - S'il existe déjà, il reçoit simplement le rôle admin (mot de passe inchangé,
 *   sauf si vous ajoutez --reset-password).
 */
import { addRole, createAccount, hashPassword, normalizeEmail } from "../src/server/auth.server";
import { basePrisma } from "../src/server/prisma-base.server";

async function main() {
  const [emailArg, password, ...flags] = process.argv.slice(2);
  if (!emailArg) {
    console.error(
      'Usage : npm run admin:create -- email@exemple.com "mot de passe" [--reset-password]',
    );
    process.exit(1);
  }
  const email = normalizeEmail(emailArg);
  const existing = await basePrisma.users.findUnique({ where: { email }, select: { id: true } });

  let userId: string;
  if (existing) {
    userId = existing.id;
    if (password && flags.includes("--reset-password")) {
      await basePrisma.users.update({
        where: { id: userId },
        data: { password_hash: await hashPassword(password) },
      });
      console.log("✔ Mot de passe réinitialisé");
    }
  } else {
    if (!password || password.length < 8) {
      console.error("Pour un nouveau compte, indiquez un mot de passe d'au moins 8 caractères.");
      process.exit(1);
    }
    userId = await createAccount({
      email,
      password,
      fullName: "Administrateur",
      emailVerified: true,
    });
    console.log("✔ Compte créé");
  }

  await addRole(userId, "admin");
  console.log(`✔ ${email} est administrateur (id ${userId})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
