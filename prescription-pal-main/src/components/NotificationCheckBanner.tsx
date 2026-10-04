import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Bandeau de notification en tete de l'accueil, facon WhatsApp : une coche
 * verte qui rappelle qu'il y a du neuf a lire, sans avoir a viser l'icone de
 * l'en-tete. Masque des qu'il n'y a plus rien non lu, donc l'accueil ne
 * porte jamais de bandeau decoratif.
 */
export function NotificationCheckBanner({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications(userId);
  const [open, setOpen] = useState(false);

  if (unreadCount === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* `primary` et non `brand` : blanc sur #25D366 ne donnerait que
              2,2:1 de contraste. Le texte vert tres sombre sur vert vif
              reste lisible, et le texte blanc sur le vert sombre de nuit
              l'est aussi. Un seul couple, lisible dans les deux themes. */}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15"
            aria-hidden
          >
            <Check className="h-5 w-5" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t("common.unreadNotifications", { count: unreadCount })}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md p-0">
        <NotificationsPanel userId={userId} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}