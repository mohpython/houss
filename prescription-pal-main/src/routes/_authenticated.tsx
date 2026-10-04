import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { auth, type AuthUser } from "@/integrations/auth/client";
import { getMyRoles } from "@/lib/account.functions";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  Camera,
  ListChecks,
  Store,
  ShieldCheck,
  LogOut,
  Menu,
  Bike,
  Package,
  MoreHorizontal,
  Users,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { AuroraBackground } from "@/components/AuroraBackground";
import { PushOptIn } from "@/components/PushOptIn";
import { PushAutoAsk } from "@/components/PushAutoAsk";
import { attachNativeTapHandler, refreshPushRegistration } from "@/lib/push-client";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";
import { ensurePractitionerAccess } from "@/lib/practitioner.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

type NavEntry = { to: string; icon: React.ReactNode; label: string };

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [roles, setRoles] = useState<string[]>([]);
  const [practitionerLinked, setPractitionerLinked] = useState(false);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    void getMyRoles()
      .then((r) => setRoles(r))
      .catch(() => setRoles([]));
    void ensurePractitionerAccess()
      .then((r) => setPractitionerLinked(r.isPractitioner))
      .catch(() => setPractitionerLinked(false));
  }, [user.id]);

  useEffect(() => {
    void refreshPushRegistration(i18n.language);
    void attachNativeTapHandler((path) => router.navigate({ to: path }));
  }, [i18n.language, router]);

  const signOut = async () => {
    await auth.signOut();
    router.navigate({ to: "/" });
  };

  const isPharmacy = roles.includes("pharmacy_staff");
  const isAdmin = roles.includes("admin");
  const isCourier = roles.includes("courier");
  const isPractitioner = roles.includes("doctor") || roles.includes("nurse") || practitionerLinked;

  const primary: NavEntry[] = [
    { to: "/app", icon: <LayoutGrid className="h-5 w-5" />, label: t("nav.home") },
    { to: "/app/scan", icon: <Camera className="h-5 w-5" />, label: t("nav.scan") },
    {
      to: "/app/prescriptions",
      icon: <ListChecks className="h-5 w-5" />,
      label: t("nav.prescriptions"),
    },
    { to: "/app/reservations", icon: <Store className="h-5 w-5" />, label: t("nav.reservations") },
  ];
  const extras: NavEntry[] = [];
  if (!isPharmacy && !isCourier) {
    extras.push({
      to: "/app/pharmacy/onboarding",
      icon: <Store className="h-5 w-5" />,
      label: t("nav.registerPharmacy"),
    });
    extras.push({
      to: "/app/courier/onboarding",
      icon: <Bike className="h-5 w-5" />,
      label: t("nav.becomeCourier"),
    });
  }
  if (isAdmin) {
    extras.push({
      to: "/app/admin",
      icon: <ShieldCheck className="h-5 w-5" />,
      label: t("nav.admin"),
    });
    extras.push({
      to: "/app/admin/pharmacies",
      icon: <Store className="h-5 w-5" />,
      label: "Gérants",
    });
    extras.push({
      to: "/app/admin/inventory",
      icon: <Package className="h-5 w-5" />,
      label: t("nav.stocks"),
    });
    extras.push({
      to: "/app/admin/couriers",
      icon: <Bike className="h-5 w-5" />,
      label: t("nav.couriers"),
    });
    extras.push({
      to: "/app/admin/patients",
      icon: <Users className="h-5 w-5" />,
      label: "Patients",
    });
  }

  const roleTabs: NavEntry[] = [];
  if (isPharmacy)
    roleTabs.push({
      to: "/app/pharmacy",
      icon: <Store className="h-5 w-5" />,
      label: t("nav.pharmacy"),
    });
  if (isCourier)
    roleTabs.push({
      to: "/app/courier",
      icon: <Bike className="h-5 w-5" />,
      label: t("nav.courier"),
    });
  if (isPractitioner)
    roleTabs.push({
      to: "/app/praticien",
      icon: <Stethoscope className="h-5 w-5" />,
      label: t("nav.practitioner"),
    });
  if (isAdmin && roleTabs.length === 0)
    roleTabs.push({
      to: "/app/admin",
      icon: <ShieldCheck className="h-5 w-5" />,
      label: t("nav.admin"),
    });

  const bottomBar: NavEntry[] = roleTabs.length > 0 ? [...primary, roleTabs[0]] : [...primary];
  const showBottomMore = roleTabs.length === 0;

  const nav = (
    <NavList
      isPharmacy={isPharmacy}
      isAdmin={isAdmin}
      isCourier={isCourier}
      isPractitioner={isPractitioner}
      onNavigate={() => setOpen(false)}
    />
  );

  return (
    <div className="relative flex min-h-screen">
      <AuroraBackground />

      {/* Desktop glass sidebar */}
      <aside className="hidden w-64 shrink-0 md:flex md:flex-col">
        <div className="sticky top-4 mx-3 my-4 flex h-[calc(100vh-2rem)] flex-col glass rounded-3xl">
          <SidebarHeader />
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{nav}</nav>
          <SidebarFooter user={user} onSignOut={signOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/60 px-4 backdrop-blur-xl md:hidden">
          <Link to="/app" className="flex items-center gap-2">
            <img
              src={sahaLogo.url}
              alt="SAHA Santé"
              className="h-8 w-8 rounded-xl object-cover ring-1 ring-ring"
            />
            <span className="font-display text-lg">SAHA</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeSwitcher compact />
            <LanguageSwitcher compact />
            <NotificationsBell userId={user.id} />

            {!showBottomMore && (
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="rounded-t-3xl border-border bg-background/95 p-0 backdrop-blur-xl"
                >
                  <MoreMenu
                    extras={extras}
                    user={user}
                    onClose={() => setMoreOpen(false)}
                    onSignOut={signOut}
                  />
                </SheetContent>
              </Sheet>
            )}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ouvrir le menu de navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 border-border bg-background/95 p-0 backdrop-blur-xl"
              >
                <SidebarHeader />
                <nav className="flex-1 space-y-1 px-3 py-4">{nav}</nav>
                <SidebarFooter user={user} onSignOut={signOut} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Desktop top bar */}
        <div className="hidden h-14 items-center justify-end gap-1 px-6 md:flex">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <NotificationsBell userId={user.id} />
        </div>

        <main className="min-w-0 flex-1 overflow-x-hidden pb-28 md:pb-6">
          <PushAutoAsk />
          <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6">
            <PushOptIn />
          </div>
          <Outlet />
        </main>

        {/* Floating pill bottom nav */}
        <nav
          className="fixed inset-x-3 bottom-3 z-40 md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="glass mx-auto flex max-w-md items-center justify-around rounded-full px-2 py-2">
            {bottomBar.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                activeOptions={{ exact: item.to === "/app" }}
                className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/60 transition-all [&.active]:aurora-bg [&.active]:text-primary-foreground [&.active]:shadow-lg [&.active]:shadow-primary/30"
              >
                {item.icon}
              </Link>
            ))}
            {showBottomMore && (
              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                  <button
                    aria-label={t("nav.more")}
                    title={t("nav.more")}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/60 hover:text-foreground"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  className="rounded-t-3xl border-border bg-background/95 p-0 backdrop-blur-xl"
                >
                  <MoreMenu
                    extras={extras}
                    user={user}
                    onClose={() => setMoreOpen(false)}
                    onSignOut={signOut}
                  />
                </SheetContent>
              </Sheet>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}

function MoreMenu({
  extras,
  user,
  onClose,
  onSignOut,
}: {
  extras: NavEntry[];
  user: AuthUser;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
      <div className="px-5 pb-8 pt-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground/60">
          {t("nav.menu")}
        </div>
        {extras.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {extras.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-muted p-3 text-xs font-medium text-foreground transition hover:bg-secondary [&.active]:aurora-bg [&.active]:text-primary-foreground"
              >
                {item.icon}
                <span className="text-center leading-tight">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 truncate px-1 text-xs text-foreground/60">
            {user.email ?? user.phone}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 hover:bg-secondary"
            onClick={() => {
              onClose();
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    </>
  );
}

function SidebarHeader() {
  return (
    <div className="flex h-16 items-center border-b border-border px-5">
      <Link to="/app" className="flex items-center gap-3">
        <img
          src={sahaLogo.url}
          alt="SAHA Santé"
          className="h-9 w-9 rounded-xl object-cover ring-1 ring-ring"
        />
        <span className="font-display text-xl">SAHA Santé</span>
      </Link>
    </div>
  );
}

function SidebarFooter({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 truncate px-2 text-xs text-foreground/60">
        {user.email ?? user.phone}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 hover:bg-secondary"
        onClick={onSignOut}
      >
        <LogOut className="h-4 w-4" />
        {t("common.signOut")}
      </Button>
    </div>
  );
}

function NavList({
  isPharmacy,
  isAdmin,
  isCourier,
  isPractitioner,
  onNavigate,
}: {
  isPharmacy: boolean;
  isAdmin: boolean;
  isCourier: boolean;
  isPractitioner: boolean;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <NavItem
        to="/app"
        icon={<LayoutGrid className="h-4 w-4" />}
        label={t("nav.home")}
        onNavigate={onNavigate}
      />
      <NavItem
        to="/app/scan"
        icon={<Camera className="h-4 w-4" />}
        label={t("nav.scan")}
        onNavigate={onNavigate}
      />
      <NavItem
        to="/app/prescriptions"
        icon={<ListChecks className="h-4 w-4" />}
        label={t("nav.prescriptions")}
        onNavigate={onNavigate}
      />
      <NavItem
        to="/app/reservations"
        icon={<Store className="h-4 w-4" />}
        label={t("nav.reservations")}
        onNavigate={onNavigate}
      />
      {isPharmacy && (
        <>
          <SectionLabel>{t("nav.pharmacy")}</SectionLabel>
          <NavItem
            to="/app/pharmacy"
            icon={<Store className="h-4 w-4" />}
            label={t("nav.pharmacy")}
            onNavigate={onNavigate}
          />
        </>
      )}
      {isPractitioner && (
        <>
          <SectionLabel>{t("nav.practitioner")}</SectionLabel>
          <NavItem
            to="/app/praticien"
            icon={<Stethoscope className="h-4 w-4" />}
            label={t("nav.practitioner")}
            onNavigate={onNavigate}
          />
        </>
      )}
      {isCourier ? (
        <>
          <SectionLabel>{t("nav.courier")}</SectionLabel>
          <NavItem
            to="/app/courier"
            icon={<Bike className="h-4 w-4" />}
            label={t("nav.courier")}
            onNavigate={onNavigate}
          />
        </>
      ) : (
        <>
          <SectionLabel>Pro</SectionLabel>
          {!isPharmacy && (
            <NavItem
              to="/app/pharmacy/onboarding"
              icon={<Store className="h-4 w-4" />}
              label={t("nav.registerPharmacy")}
              onNavigate={onNavigate}
            />
          )}
          <NavItem
            to="/app/courier/onboarding"
            icon={<Bike className="h-4 w-4" />}
            label={t("nav.becomeCourier")}
            onNavigate={onNavigate}
          />
        </>
      )}
      {isAdmin && (
        <>
          <SectionLabel>{t("nav.admin")}</SectionLabel>
          <NavItem
            to="/app/admin"
            icon={<ShieldCheck className="h-4 w-4" />}
            label={t("nav.pharmacy")}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/app/admin/pharmacies"
            icon={<Store className="h-4 w-4" />}
            label="Gérants pharmacies"
            onNavigate={onNavigate}
          />
          <NavItem
            to="/app/admin/inventory"
            icon={<Package className="h-4 w-4" />}
            label={t("nav.stocks")}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/app/admin/couriers"
            icon={<Bike className="h-4 w-4" />}
            label={t("nav.couriers")}
            onNavigate={onNavigate}
          />

          <NavItem
            to="/app/admin/patients"
            icon={<Users className="h-4 w-4" />}
            label="Patients"
            onNavigate={onNavigate}
          />
        </>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-foreground/70 transition-all",
        "hover:bg-muted hover:text-foreground",
        "[&.active]:aurora-bg [&.active]:text-primary-foreground [&.active]:shadow-lg [&.active]:shadow-primary/30",
      )}
      activeOptions={{ exact: to === "/app" }}
    >
      <span className="transition-colors">{icon}</span>
      {label}
    </Link>
  );
}
