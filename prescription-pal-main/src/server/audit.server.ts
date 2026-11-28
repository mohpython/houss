/**
 * Écriture non bloquante dans la table d'audit existante (`audit_logs`).
 * Ne jamais y placer de mot de passe ni de jeton d'accès.
 */
import { basePrisma } from "./prisma-base.server";

function requestMeta(request: Request | undefined | null) {
  return {
    ip:
      request?.headers.get("x-real-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };
}

export async function writeAudit({
  actorUserId,
  action,
  entity,
  entityId,
  meta,
  request,
}: {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  request?: Request | null;
}): Promise<void> {
  try {
    const { ip, userAgent } = requestMeta(request);
    await basePrisma.audit_logs.create({
      data: {
        actor_user_id: actorUserId ?? null,
        action,
        entity,
        entity_id: entityId ?? null,
        meta: {
          ip,
          user_agent: userAgent,
          at: new Date().toISOString(),
          ...meta,
        } as never,
      },
    });
  } catch {
    // L'audit ne doit jamais faire échouer une connexion ou une action admin.
  }
}
