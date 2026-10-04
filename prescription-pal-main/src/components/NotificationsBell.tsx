import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Cloche de l'en-tete. Elle ne fait plus que compter : la liste elle-meme vit
 * dans `NotificationsPanel`, partagee avec la bandeau de l'accueil. Deux
 * appels a `useNotifications` sur la meme page etaient redondants.
 */
export function NotificationsBell({ userId }: { userId: string }) {
  const { unreadCount } = useNotifications(userId);
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `${unreadCount}` : undefined}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md p-0">
        <NotificationsPanel userId={userId} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}