/**
 * Client Prisma de l'application — à utiliser partout côté serveur :
 *
 *   const { prisma } = await import("@/server/db.server");
 *
 * Il reproduit automatiquement le comportement des anciens triggers
 * PostgreSQL (notifications, codes de retrait, péremption des ordonnances,
 * exclusivité des rôles, diffusion temps réel). Voir lifecycle.server.ts.
 *
 * ⚠️ Les hooks relisent les lignes après écriture hors transaction : ne pas
 * écrire dans `reservations`, `appointments` ou `notifications` à l'intérieur
 * d'un `prisma.$transaction(...)` (les effets seraient perdus).
 */
import { Prisma } from "@prisma/client";
import { basePrisma } from "./prisma-base.server";
import {
  afterAppointmentWrite,
  afterCourierPositionInsert,
  afterCourierWrite,
  afterNotificationInserted,
  afterPharmacyWrite,
  afterReservationWrite,
  background,
  guardCourier,
  guardPharmacyMember,
  guardPractitioner,
  prescriptionExpiry,
  reservationCreateDefaults,
} from "./lifecycle.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyArgs = any;
type Row = Record<string, unknown>;

/** Garantit que `id` fait partie du résultat pour pouvoir relire la ligne. */
function ensureId(args: AnyArgs) {
  if (args?.select && !args.select.id) args.select = { ...args.select, id: true };
}

function dataValue(data: AnyArgs, key: string): unknown {
  if (!data || !(key in data)) return undefined;
  const v = data[key];
  if (v && typeof v === "object" && !(v instanceof Date) && "set" in v) return v.set;
  return v;
}

function withExpiry(data: AnyArgs) {
  if (!data || !("prescription_date" in data)) return data;
  const d = dataValue(data, "prescription_date") as Date | string | null;
  const out = { ...data, is_expired: prescriptionExpiry(d) };
  if (out.date_source !== undefined && !["ai", "manual"].includes(String(out.date_source))) {
    out.date_source = "ai";
  }
  return out;
}

type Model = "reservations" | "appointments" | "pharmacies" | "couriers";

const delegate = (model: Model): any => (basePrisma as any)[model];

/**
 * Enveloppe générique « avant / après » pour create / update / upsert /
 * updateMany / delete d'un modèle suivi.
 */
function tracked(model: Model, after: (before: Row | null, after: Row | null) => Promise<void>) {
  return {
    async create({ args, query }: AnyArgs) {
      ensureId(args);
      const result = await query(args);
      background(`${model}.create`, async () => {
        const row = await delegate(model).findUnique({ where: { id: result.id } });
        await after(null, row);
      });
      return result;
    },
    async update({ args, query }: AnyArgs) {
      ensureId(args);
      const before = await delegate(model).findUnique({ where: args.where });
      const result = await query(args);
      background(`${model}.update`, async () => {
        const row = await delegate(model).findUnique({ where: { id: result.id } });
        await after(before, row);
      });
      return result;
    },
    async upsert({ args, query }: AnyArgs) {
      ensureId(args);
      const before = await delegate(model).findUnique({ where: args.where });
      const result = await query(args);
      background(`${model}.upsert`, async () => {
        const row = await delegate(model).findUnique({ where: { id: result.id } });
        await after(before, row);
      });
      return result;
    },
    async updateMany({ args, query }: AnyArgs) {
      const befores: Row[] = await delegate(model).findMany({ where: args.where });
      const result = await query(args);
      if (befores.length > 0) {
        background(`${model}.updateMany`, async () => {
          const rows: Row[] = await delegate(model).findMany({
            where: { id: { in: befores.map((b) => b.id) } },
          });
          const byId = new Map(befores.map((b) => [b.id, b]));
          for (const row of rows) await after(byId.get(row.id) ?? null, row);
        });
      }
      return result;
    },
    async delete({ args, query }: AnyArgs) {
      const before = await delegate(model).findUnique({ where: args.where });
      const result = await query(args);
      if (before && (model === "pharmacies" || model === "couriers")) {
        background(`${model}.delete`, () => after(before, null));
      }
      return result;
    },
  };
}

function createClient() {
  return basePrisma.$extends({
    name: "saha-lifecycle",
    query: {
      // --- Ordonnances : is_expired calculé comme l'ancien trigger ---------
      prescriptions: {
        async create({ args, query }) {
          args.data = withExpiry(args.data);
          return query(args);
        },
        async update({ args, query }) {
          args.data = withExpiry(args.data);
          return query(args);
        },
        async updateMany({ args, query }) {
          args.data = withExpiry(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          args.create = withExpiry(args.create);
          args.update = withExpiry(args.update);
          return query(args);
        },
      },

      // --- Commandes : codes + notifications + temps réel -------------------
      reservations: {
        ...tracked("reservations", afterReservationWrite),
        async create({ args, query }) {
          args.data = (await reservationCreateDefaults(args.data as Row)) as AnyArgs;
          ensureId(args);
          const result = await query(args);
          background("reservations.create", async () => {
            const row = await basePrisma.reservations.findUnique({ where: { id: result.id } });
            await afterReservationWrite(null, row as Row | null);
          });
          return result;
        },
      },

      // --- Rendez-vous : notifications + temps réel -------------------------
      appointments: tracked("appointments", afterAppointmentWrite),

      // --- Pharmacies : exclusivité des rôles + temps réel -----------------
      pharmacies: {
        ...tracked("pharmacies", afterPharmacyWrite),
        async create({ args, query }) {
          await guardPharmacyMember(dataValue(args.data, "owner_user_id") as string | null);
          ensureId(args);
          const result = await query(args);
          background("pharmacies.create", async () => {
            const row = await basePrisma.pharmacies.findUnique({ where: { id: result.id } });
            await afterPharmacyWrite(null, row as Row | null);
          });
          return result;
        },
        async update(params: AnyArgs) {
          const owner = dataValue(params.args.data, "owner_user_id");
          if (owner) await guardPharmacyMember(owner as string);
          return tracked("pharmacies", afterPharmacyWrite).update(params);
        },
      },

      pharmacy_staff: {
        async create({ args, query }) {
          await guardPharmacyMember(dataValue(args.data, "user_id") as string);
          return query(args);
        },
        async upsert({ args, query }) {
          await guardPharmacyMember(dataValue(args.create, "user_id") as string);
          return query(args);
        },
      },

      // --- Livreurs : exclusivité + temps réel ------------------------------
      couriers: {
        ...tracked("couriers", afterCourierWrite),
        async create({ args, query }) {
          await guardCourier(dataValue(args.data, "user_id") as string);
          ensureId(args);
          const result = await query(args);
          background("couriers.create", async () => {
            const row = await basePrisma.couriers.findUnique({ where: { id: result.id } });
            await afterCourierWrite(null, row as Row | null);
          });
          return result;
        },
        async upsert(params: AnyArgs) {
          await guardCourier(dataValue(params.args.create, "user_id") as string);
          return tracked("couriers", afterCourierWrite).upsert(params);
        },
      },

      courier_positions: {
        async create({ args, query }) {
          ensureId(args);
          const result = await query(args);
          background("courier_positions.create", async () => {
            const row = await basePrisma.courier_positions.findUnique({ where: { id: result.id } });
            if (row) await afterCourierPositionInsert(row as unknown as Row);
          });
          return result;
        },
      },

      // --- Praticiens : exclusivité ----------------------------------------
      practitioners: {
        async create({ args, query }) {
          await guardPractitioner(dataValue(args.data, "user_id") as string | null);
          return query(args);
        },
        async update({ args, query }) {
          const uid = dataValue(args.data, "user_id");
          if (uid) await guardPractitioner(uid as string);
          return query(args);
        },
      },

      // --- Notifications : push + temps réel --------------------------------
      notifications: {
        async create({ args, query }) {
          ensureId(args);
          const result = await query(args);
          background("notifications.create", async () => {
            const row = await basePrisma.notifications.findUnique({ where: { id: result.id } });
            if (row) afterNotificationInserted(row);
          });
          return result;
        },
        async createMany({ args }) {
          const list = Array.isArray(args.data) ? args.data : [args.data];
          let count = 0;
          for (const data of list) {
            const row = await basePrisma.notifications.create({ data: data as AnyArgs });
            afterNotificationInserted(row);
            count++;
          }
          return { count };
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;

const g = globalThis as unknown as { __sahaPrismaExt?: ExtendedClient };
export const prisma: ExtendedClient = g.__sahaPrismaExt ?? createClient();
g.__sahaPrismaExt = prisma;

export { Prisma };
