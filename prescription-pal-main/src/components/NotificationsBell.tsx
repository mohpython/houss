import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { fr as frLocale, enUS, arSA } from "date-fns/locale";

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


export function NotificationsBell({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { items, unreadCount, markAllRead, markRead } = useNotifications(userId);
  const [open, setOpen] = useState(false);

  const locale = i18n.resolvedLanguage === "ar" ? arSA : i18n.resolvedLanguage === "en" ? enUS : frLocale;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md p-0">
        <SheetHeader className="flex-row items-center justify-between border-b p-4">
          <SheetTitle>{t("common.notifications")}</SheetTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              {t("common.markAllRead")}
            </Button>
          )}
        </SheetHeader>
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
          {items.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("common.noNotifications")}</div>
          )}
          <ul className="divide-y">
            {items.map((n) => {
              const href = notifLink(n);
              const content = (
                <div className={`flex gap-3 p-4 transition ${!n.read_at ? "bg-primary/5" : ""}`}>
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t(`notif.${n.type}.title`, { defaultValue: n.title })}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{t(`notif.${n.type}.body`, { defaultValue: n.body })}</div>
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
                        markRead(n.id);
                        setOpen(false);
                      }}
                      className="block hover:bg-accent"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button onClick={() => markRead(n.id)} className="block w-full text-left hover:bg-accent">
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
