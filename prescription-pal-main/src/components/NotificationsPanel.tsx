import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { fr as frLocale, enUS, arSA } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { useNotifications, type Notification } from "@/hooks/useNotifications";

function notifLink(n: Notification): string | null {
  const d = (n.data ?? {}) as {
    reservation_id?: string;
    pharmacy_id?: string;
    prescription_id?: string;
    decision?: string;
  };

  // Prescription validated by the admin → the patient picks a pharmacy.
  if (n.type === "prescription_review" && d.prescription_id) {
    return d.decision === "rejected"
      ? `/app/prescriptions/${d.prescription_id}`
      : `/app/prescriptions/${d.prescription_id}/pharmacies`;
  }
  if (d.prescription_id && !d.reservation_id) return `/app/prescriptions/${d.prescription_id}`;

  const rid = d.reservation_id;
  if (!rid) return null;
  if (n.type === "new_reservation") {
    return d.pharmacy_id ? `/app/pharmacy/${d.pharmacy_id}/reservations` : null;
  }
  if (n.type === "new_delivery" || n.type === "courier_assigned") return `/app/reservations/${rid}/track`;
  return `/app/reservations/${rid}`;
}

/**
 * Liste des notifications, partagee par la cloche de l'en-tete et par la
 * bandeau de l'accueil. Extraite pour que les deux affichent exactement le
 * meme contenu : il y avait un risque de divergence des deux listes.
 */
export function NotificationsPanel({
  userId,
  onNavigate,
}: {
  /** Compte courant : le hook ne charge rien sans lui. */
  userId: string;
  /** Appele apres un clic sur une notification (la feuille se referme). */
  onNavigate?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { items, unreadCount, markAllRead, markRead } = useNotifications(userId);

  const locale = i18n.resolvedLanguage === "ar" ? arSA : i18n.resolvedLanguage === "en" ? enUS : frLocale;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b p-4">
        {/* SheetTitle et non un <h2> : Radix l'expose aux lecteurs d'ecran
            comme titre de la feuille de dialogue. */}
        <SheetTitle className="font-display text-lg">{t("common.notifications")}</SheetTitle>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            {t("common.markAllRead")}
          </Button>
        )}
      </div>

      <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
        {items.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("common.noNotifications")}</div>
        )}
        <ul className="divide-y divide-border">
          {items.map((n) => {
            const href = notifLink(n);
            const content = (
              <div className={`flex gap-3 p-4 transition ${!n.read_at ? "bg-brand/5" : ""}`}>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {t(`notif.${n.type}.title`, { defaultValue: n.title })}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t(`notif.${n.type}.body`, { defaultValue: n.body })}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale })}
                  </div>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link
                    to={href}
                    onClick={() => {
                      void markRead(n.id);
                      onNavigate?.();
                    }}
                    className="block hover:bg-accent"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      void markRead(n.id);
                      onNavigate?.();
                    }}
                    className="block w-full text-left hover:bg-accent"
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}