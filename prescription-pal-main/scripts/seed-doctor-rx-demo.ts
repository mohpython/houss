/**
 * Jeu de démonstration pour l'e-Ordonnance médecin (idempotent).
 *
 *   npm run doctor:demo
 *
 * Crée / met à jour :
 *  - praticien@exemple.com : médecin approuvé, rattaché à une fiche praticien
 *    avec établissement et cachet, accessible sur /medecin ;
 *  - patient@exemple.com : patient avec identité complète (date de naissance,
 *    sexe, adresse) pour la recherche et la vérification d'identité.
 *
 * Mot de passe des comptes existants : inchangé. Pour un nouveau compte,
 * utilisez DEMO_PASSWORD (par défaut MotDePasse123).
 */
import { addRole, createAccount } from "../src/server/auth.server";
import { basePrisma } from "../src/server/prisma-base.server";

const PASSWORD = process.env.DEMO_PASSWORD ?? "MotDePasse123";

async function ensureAccount(email: string, fullName: string): Promise<string> {
  const existing = await basePrisma.users.findUnique({ where: { email }, select: { id: true } });
  if (existing) return existing.id;
  const id = await createAccount({
    email,
    password: PASSWORD,
    fullName,
    emailVerified: true,
  });
  console.log(`✓ Compte créé : ${email}`);
  return id;
}

async function main() {
  const doctorUserId = await ensureAccount("praticien@exemple.com", "Fatoumata Dembélé");
  await addRole(doctorUserId, "doctor");

  const specialty = await basePrisma.practitioner_specialties.findUnique({
    where: { code: "general" },
    select: { code: true },
  });
  if (!specialty) throw new Error("Spécialité 'general' absente : lancez d'abord npm run db:seed.");

  const establishment = {
    establishment_name: "Centre de Santé SAHA — Bamako",
    establishment_address: "Hamdallaye ACI 2000, Bamako (Mali)",
    establishment_phone: "+223 71 25 77 60",
    establishment_email: "contact@sahasantemali.com",
    signature_note: "Signature électronique SAHA Santé — ordonnance vérifiable par QR code.",
  };

  const practitioner = await basePrisma.practitioners.findFirst({
    where: { license_number: "ML-MED-DEMO-1" },
    select: { id: true },
  });

  const doctorData = {
    type: "doctor" as const,
    user_id: doctorUserId,
    claim_email: null,
    full_name: "Fatoumata Dembélé",
    specialty_code: specialty.code,
    license_number: "ML-MED-DEMO-1",
    phone: "+223 76 00 00 03",
    address: "Sébénikoro, Bamako",
    city: "Bamako",
    status: "approved" as const,
    approved_at: new Date(),
    approved_by: null,
    is_available: true,
    bio: "Médecin généraliste — compte de démonstration e-Ordonnance SAHA Santé.",
    ...establishment,
  };

  if (practitioner) {
    await basePrisma.practitioners.update({ where: { id: practitioner.id }, data: doctorData });
  } else {
    await basePrisma.practitioners.create({
      data: { ...doctorData, lat: 12.626, lng: -8.068, home_visits: true, consultation_fee: 10000 },
    });
  }
  console.log("✓ Médecin approuvé et établissement renseigné");

  const patientId = await ensureAccount("patient@exemple.com", "Aïcha Patient");
  await addRole(patientId, "patient");
  await basePrisma.profiles.update({
    where: { id: patientId },
    data: {
      full_name: "Aïcha Patient",
      phone: "+223 76 00 00 02",
      date_of_birth: new Date("1992-05-14T00:00:00.000Z"),
      sex: "F",
      address: "Bamako, Mali",
    },
  });
  console.log("✓ Patient avec identité complète");

  console.log("\nConnexion /medecin : praticien@exemple.com / MotDePasse123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
