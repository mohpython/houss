import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, LogOut } from "lucide-react";
import { auth } from "@/integrations/auth/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = Route.useRouteContext();
  const router = useRouter();

  const name = user.user_metadata?.full_name ?? user.email ?? user.phone ?? "SAHA Santé";
  const contact = user.email ?? user.phone ?? t("profile.badge");

  const quickLinks = [
    {
      to: "/app/prescriptions",
      icon: "/icons3d/rx.png",
      label: t("profile.prescriptions"),
    },
    {
      to: "/app/reservations",
      icon: "/icons3d/records.png",
      label: t("profile.orders"),
    },
    {
      to: "/app/pharmacies",
      icon: "/icons3d/pharmacy.png",
      label: t("profile.pharmacies"),
    },
    {
      to: "/app/scan",
      icon: "/icons3d/camera.png",
      label: t("profile.scan"),
    },
  ] as const;

  const signOut = async () => {
    await auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#04150f] text-emerald-50">
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-700/80 via-emerald-900/80 to-[#06251b] p-5 shadow-2xl shadow-emerald-950/50 md:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-bold text-emerald-50">
              <img
                src="/icons3d/person.png"
                alt=""
                aria-hidden
                className="h-4 w-4 object-contain"
              />
              {t("profile.badge")}
            </span>
            <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.05] tracking-tight text-white md:text-4xl">
              {t("profile.title")}
            </h1>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-emerald-100/75 md:text-sm">
              {t("profile.desc")}
            </p>

            <div className="mt-5 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 text-xl font-extrabold text-emerald-950 shadow-lg shadow-emerald-400/25">
                {initials(name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold text-white">{name}</div>
                <div className="truncate text-xs text-emerald-100/60">{contact}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex flex-col gap-2 rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-4 transition hover:border-emerald-300/40 hover:bg-[#0d3528]"
            >
              <div className="flex w-full items-start justify-between">
                <img
                  src={item.icon}
                  alt=""
                  aria-hidden
                  className="h-9 w-9 object-contain drop-shadow"
                />
                <ChevronRight className="h-4 w-4 text-emerald-200/40 transition group-hover:translate-x-0.5 group-hover:text-emerald-200" />
              </div>
              <span className="text-xs font-bold leading-tight text-emerald-50">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-3">
            <img src="/icons3d/globe.png" alt="" aria-hidden className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold text-emerald-50">{t("profile.language")}</span>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/15 bg-[#0a2a20]/90 p-3">
            <img src="/icons3d/palette.png" alt="" aria-hidden className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold text-emerald-50">{t("profile.theme")}</span>
            <div className="ml-auto">
              <ThemeSwitcher />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 text-sm font-bold text-red-300 transition hover:bg-red-500/15 hover:text-red-200"
        >
          <LogOut className="h-4 w-4" />
          {t("profile.signOut")}
        </button>
      </div>
    </div>
  );
}
