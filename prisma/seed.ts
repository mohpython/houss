/**
 * Données de référence (idempotent — peut être relancé sans risque) :
 *   npm run db:seed
 *
 * - spécialités médicales / infirmières (utilisées par le triage IA) ;
 * - quartiers de Bamako (livraison dans un autre quartier) ;
 * - praticiens de démonstration : uniquement avec SEED_DEMO=1.
 *
 * Si vous importez les données de l'ancienne base Supabase
 * (scripts/migrate-from-supabase.sh), le seed est inutile.
 */
import { PrismaClient, type practitioner_type } from "@prisma/client";

const prisma = new PrismaClient();

const SPECIALTIES: Array<{
  code: string;
  type: practitioner_type;
  fr: string;
  en: string;
  ar: string;
  keywords: string[];
}> = [
  {
    code: "general",
    type: "doctor",
    fr: "Médecine générale",
    en: "General practice",
    ar: "طب عام",
    keywords: ["fièvre", "paludisme", "fatigue", "toux", "douleur", "grippe"],
  },
  {
    code: "cardiology",
    type: "doctor",
    fr: "Cardiologie",
    en: "Cardiology",
    ar: "أمراض القلب",
    keywords: ["tension", "hypertension", "coeur", "palpitations", "poitrine"],
  },
  {
    code: "pediatrics",
    type: "doctor",
    fr: "Pédiatrie",
    en: "Pediatrics",
    ar: "طب الأطفال",
    keywords: ["enfant", "bébé", "nourrisson", "vaccin", "croissance"],
  },
  {
    code: "infectious",
    type: "doctor",
    fr: "Maladies infectieuses",
    en: "Infectious diseases",
    ar: "الأمراض المعدية",
    keywords: ["paludisme", "typhoïde", "dengue", "infection", "fièvre"],
  },
  {
    code: "gynecology",
    type: "doctor",
    fr: "Gynécologie-obstétrique",
    en: "Gynecology & obstetrics",
    ar: "أمراض النساء والتوليد",
    keywords: ["grossesse", "règles", "enceinte", "contraception"],
  },
  {
    code: "dermatology",
    type: "doctor",
    fr: "Dermatologie",
    en: "Dermatology",
    ar: "الأمراض الجلدية",
    keywords: ["peau", "bouton", "démangeaison", "allergie", "eczéma"],
  },
  {
    code: "diabetology",
    type: "doctor",
    fr: "Diabétologie",
    en: "Diabetology",
    ar: "أمراض السكري",
    keywords: ["diabète", "glycémie", "sucre", "soif"],
  },
  {
    code: "ophthalmology",
    type: "doctor",
    fr: "Ophtalmologie",
    en: "Ophthalmology",
    ar: "طب العيون",
    keywords: ["oeil", "yeux", "vue", "conjonctivite"],
  },
  {
    code: "ent",
    type: "doctor",
    fr: "ORL",
    en: "Ear, nose & throat",
    ar: "الأنف والأذن والحنجرة",
    keywords: ["oreille", "gorge", "nez", "sinusite", "angine"],
  },
  {
    code: "injection",
    type: "nurse",
    fr: "Injections et perfusions",
    en: "Injections & IV",
    ar: "الحقن والتسريب",
    keywords: ["injection", "piqûre", "perfusion", "sérum"],
  },
  {
    code: "wound_care",
    type: "nurse",
    fr: "Soins de plaies et pansements",
    en: "Wound care & dressings",
    ar: "العناية بالجروح والضمادات",
    keywords: ["plaie", "pansement", "blessure", "brûlure"],
  },
  {
    code: "vaccination",
    type: "nurse",
    fr: "Vaccination",
    en: "Vaccination",
    ar: "التطعيم",
    keywords: ["vaccin", "vaccination", "rappel"],
  },
  {
    code: "nursing",
    type: "nurse",
    fr: "Soins infirmiers à domicile",
    en: "Home nursing",
    ar: "التمريض المنزلي",
    keywords: ["tension", "glycémie", "soins", "domicile", "prise de sang"],
  },
];

const NEIGHBORHOODS: Array<[string, number, number]> = [
  ["Daoudabougou", 12.592, -7.98],
  ["Hamdallaye ACI 2000", 12.628, -8.025],
  ["Badalabougou", 12.618, -7.984],
  ["Kalaban Coura", 12.578, -7.989],
  ["Magnambougou", 12.605, -7.957],
  ["Sotuba", 12.656, -7.926],
  ["Lafiabougou", 12.63, -8.04],
  ["Sébénikoro", 12.626, -8.068],
  ["Niamakoro", 12.576, -7.956],
  ["Faladié", 12.59, -7.955],
  ["Banankabougou", 12.582, -7.964],
  ["Hippodrome", 12.653, -7.98],
  ["Missira", 12.653, -7.988],
  ["Djélibougou", 12.666, -7.988],
  ["Boulkassoumbougou", 12.676, -7.98],
  ["Sabalibougou", 12.598, -7.999],
  ["Yirimadio", 12.592, -7.92],
  ["Baco Djicoroni", 12.596, -8.018],
  ["Torokorobougou", 12.61, -8.0],
  ["Quinzambougou", 12.648, -7.975],
  ["Médina Coura", 12.651, -7.993],
  ["Bamako Coura", 12.641, -7.999],
  ["Bolibana", 12.644, -8.018],
  ["Kalaban Coro", 12.56, -7.995],
  ["Sirakoro Meguetana", 12.55, -7.95],
  ["Titibougou", 12.689, -7.95],
  ["Sogoniko", 12.599, -7.972],
  ["Dravéla", 12.647, -8.006],
  ["Golf", 12.645, -8.031],
  ["Korofina", 12.669, -7.971],
  ["Sikoroni", 12.679, -7.996],
  ["Kalabambougou", 12.61, -8.078],
];

const DEMO_PRACTITIONERS = [
  [
    "doctor",
    "Dr Aminata Traoré",
    "general",
    "ML-MED-1001",
    "+22370112233",
    "Hamdallaye ACI 2000",
    12.6392,
    -8.0029,
    true,
    10000,
    "Médecine générale, suivi du paludisme et des maladies courantes.",
  ],
  [
    "doctor",
    "Dr Moussa Diarra",
    "cardiology",
    "ML-MED-1002",
    "+22370112244",
    "Badalabougou, Rue 24",
    12.627,
    -7.988,
    false,
    20000,
    "Cardiologue, hypertension artérielle et suivi cardiaque.",
  ],
  [
    "doctor",
    "Dr Fatoumata Keïta",
    "pediatrics",
    "ML-MED-1003",
    "+22370112255",
    "Magnambougou, Route de Sogoniko",
    12.6032,
    -7.9539,
    true,
    15000,
    "Pédiatre, fièvre et vaccination de l'enfant.",
  ],
  [
    "doctor",
    "Dr Ibrahim Coulibaly",
    "infectious",
    "ML-MED-1004",
    "+22370112266",
    "Point G, près du CHU",
    12.657,
    -8.0075,
    false,
    18000,
    "Maladies infectieuses : paludisme, typhoïde, dengue.",
  ],
  [
    "doctor",
    "Dr Awa Sangaré",
    "gynecology",
    "ML-MED-1005",
    "+22370112277",
    "Kalaban Coura ACI",
    12.594,
    -8.01,
    false,
    17000,
    "Gynécologie et suivi de grossesse.",
  ],
  [
    "doctor",
    "Dr Seydou Camara",
    "dermatology",
    "ML-MED-1006",
    "+22370112288",
    "Faladié, Avenue de l'OUA",
    12.5981,
    -7.9411,
    false,
    15000,
    "Dermatologie générale, allergies cutanées.",
  ],
  [
    "doctor",
    "Dr Kadiatou Sissoko",
    "diabetology",
    "ML-MED-1007",
    "+22370112299",
    "Djélibougou, Rue 300",
    12.6689,
    -7.9962,
    true,
    16000,
    "Diabète et maladies métaboliques.",
  ],
  [
    "nurse",
    "Mariam Dembélé",
    "injection",
    "ML-INF-2001",
    "+22376334455",
    "Sébénicoro",
    12.618,
    -8.045,
    true,
    3000,
    "Injections et perfusions à domicile.",
  ],
  [
    "nurse",
    "Oumar Konaté",
    "wound_care",
    "ML-INF-2002",
    "+22376334466",
    "Missira, Rue 12",
    12.648,
    -7.982,
    true,
    4000,
    "Soins de plaies et pansements.",
  ],
  [
    "nurse",
    "Salimata Touré",
    "vaccination",
    "ML-INF-2003",
    "+22376334477",
    "Lafiabougou",
    12.6355,
    -8.0301,
    true,
    3500,
    "Vaccination et suivi nourrisson.",
  ],
  [
    "nurse",
    "Bakary Sidibé",
    "nursing",
    "ML-INF-2004",
    "+22376334488",
    "Yirimadio",
    12.611,
    -7.92,
    true,
    3000,
    "Soins infirmiers généraux, tension et glycémie à domicile.",
  ],
] as const;

async function main() {
  for (const s of SPECIALTIES) {
    await prisma.practitioner_specialties.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        label_fr: s.fr,
        label_en: s.en,
        label_ar: s.ar,
        practitioner_type: s.type,
        keywords: s.keywords,
      },
      update: {},
    });
  }
  console.log(`✔ ${SPECIALTIES.length} spécialités`);

  for (const [name, lat, lng] of NEIGHBORHOODS) {
    await prisma.neighborhoods.upsert({
      where: { city_name: { city: "Bamako", name } },
      create: { name, city: "Bamako", lat, lng },
      update: {},
    });
  }
  console.log(`✔ ${NEIGHBORHOODS.length} quartiers de Bamako`);

  if (process.env.SEED_DEMO === "1") {
    let created = 0;
    for (const [
      type,
      full_name,
      specialty_code,
      license_number,
      phone,
      address,
      lat,
      lng,
      home_visits,
      fee,
      bio,
    ] of DEMO_PRACTITIONERS) {
      const exists = await prisma.practitioners.findFirst({ where: { license_number } });
      if (exists) continue;
      await prisma.practitioners.create({
        data: {
          type,
          full_name,
          specialty_code,
          license_number,
          phone,
          address,
          city: "Bamako",
          lat,
          lng,
          home_visits,
          consultation_fee: fee,
          is_available: true,
          status: "approved",
          bio,
        },
      });
      created++;
    }
    console.log(`✔ ${created} praticiens de démonstration`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
