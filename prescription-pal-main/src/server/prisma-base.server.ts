import { PrismaClient } from "@prisma/client";

/**
 * Client Prisma « brut », sans les hooks métier.
 * À n'utiliser que dans les hooks eux-mêmes (lifecycle.server.ts) pour éviter
 * les boucles ; partout ailleurs, utiliser `prisma` de `db.server.ts`.
 */
const globalForPrisma = globalThis as unknown as { __sahaPrisma?: PrismaClient };

export const basePrisma: PrismaClient =
  globalForPrisma.__sahaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

globalForPrisma.__sahaPrisma = basePrisma;
