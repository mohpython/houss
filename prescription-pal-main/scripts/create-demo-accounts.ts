/**
 * Comptes de démonstration pour chaque interface (idempotent — relançable) :
 *
 *   npm run accounts:demo
 *
 * | Email               | Rôle            | Interface      |
 * |---------------------|-----------------|----------------|
 * | admin@exemple.com   | admin           | /app/admin     |
 * | patient@exemple.com | patient         | /app + mobile  |
 * | livreur@exemple.com | courier         | /app/courier   |
 * | pharmacie@exemple.com | pharmacy_staff | /app/pharmacy  |
 * | praticien@exemple.com | doctor        | /app/praticien |
 *
 * Mot de passe commun des nouveaux comptes : `MotDePasse123`
 * (variable DEMO_PASSWORD pour le changer). Un compte déjà existant n'est
 * jamais modifié (mot de passe conservé).
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
  console.log(`✔ Compte créé : ${email}`);
  return id;
}

async function main() {
  // --- Administrateur -------------------------------------------------------
  const adminId = await ensureAccount("admin@exemple.com", "Administrateur SAHA");
  await addRole(adminId, "admin");
  console.log("✔ Rôle : admin");

  // --- Patient ---------------------------------------------------------------
  const patientId = await ensureAccount("patient@exemple.com", "Aïcha Patient");
  await addRole(patientId, "patient");
  console.log("✔ Rôle : patient");

  // --- Livreur (courier) -----------------------------------------------------
  const courierId = await ensureAccount("livreur@exemple.com", "Moussa Traoré");
  await addRole(courierId, "courier");
  await basePrisma.couriers.upsert({
    where: { user_id: courierId },
    create: {
      user_id: courierId,
      full_name: "Moussa Traoré",
      phone: "+22376000001",
      vehicle_type: "moto",
      license_number: "ML-CO-DEMO-1",
      status: "approved",
      is_online: true,
    },
    update: { status: "approved", is_online: true },
  });
  console.log("✔ Rôle : courier (+ fiche livreur approuvée)");

  // --- Pharmacie -------------------------------------------------------------
  const pharmacyUserId = await ensureAccount("pharmacie@exemple.com", "Pharmacie du Centre");
  await addRole(pharmacyUserId, "pharmacy_staff");
  let pharmacy = await basePrisma.pharmacies.findFirst({
    where: { license_number: "ML-PH-DEMO-1" },
  });
  if (!pharmacy) {
    pharmacy = await basePrisma.pharmacies.create({
      data: {
        name: "Pharmacie du Centre",
        license_number: "ML-PH-DEMO-1",
        address: "Hamdallaye ACI 2000, Bamako",
        city: "Bamako",
        lat: 12.628,
        lng: -8.025,
        phone: "+22376000002",
        status: "approved",
      },
    });
    console.log("✔ Pharmacie créée : Pharmacie du Centre (approuvée)");
  }
  if (pharmacy.owner_user_id !== pharmacyUserId) {
    pharmacy = await basePrisma.pharmacies.update({
      where: { id: pharmacy.id },
      data: { owner_user_id: pharmacyUserId, claim_email: null },
    });
  }
  await basePrisma.pharmacy_staff.upsert({
    where: { user_id: pharmacyUserId },
    create: { pharmacy_id: pharmacy.id, user_id: pharmacyUserId },
    update: {},
  });
  console.log("✔ Rôle : pharmacy_staff (rattaché à la pharmacie)");

  // --- Praticien (doctor) ----------------------------------------------------
  const doctorUserId = await ensureAccount("praticien@exemple.com", "Dr Fatoumata Dembélé");
  await addRole(doctorUserId, "doctor");
  const spec = await basePrisma.practitioner_specialties.findFirst({
    where: { code: "general" },
    select: { code: true },
  });
  if (!spec) throw new Error("Spécialité 'general' absente — lancez npm run db:seed d'abord.");
  let prac = await basePrisma.practitioners.findFirst({
    where: { license_number: "ML-MED-DEMO-1" },
  });
  if (!prac) {
    prac = await basePrisma.practitioners.create({
      data: {
        type: "doctor",
        full_name: "Dr Fatoumata Dembélé",
        specialty_code: "general",
        license_number: "ML-MED-DEMO-1",
        phone: "+22376000003",
        address: "Sébénikoro, Bamako",
        city: "Bamako",
        lat: 12.626,
        lng: -8.068,
        home_visits: true,
        consultation_fee: 10000,
        is_available: true,
        status: "approved",
        bio: "Médecine générale — compte de démonstration SAHA Santé.",
      },
    });
    console.log("✔ Praticien créé : Dr Fatoumata Dembélé (approuvé)");
  }
  if (prac.user_id !== doctorUserId) {
    await basePrisma.practitioners.update({
      where: { id: prac.id },
      data: { user_id: doctorUserId, claim_email: null },
    });
  }
  console.log("✔ Rôle : doctor (rattaché au praticien)");

  console.log("\nRécapitulatif :");
  console.log("  admin@exemple.com     /app/admin");
  console.log("  patient@exemple.com   /app  (+ app mobile)");
  console.log("  livreur@exemple.com   /app/courier");
  console.log("  pharmacie@exemple.com /app/pharmacy");
  console.log("  praticien@exemple.com /app/praticien");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
