import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Camera, MapPin, ShieldCheck, Sparkles, Clock, ArrowUpRight, Bot, Package, Truck } from "lucide-react";
import sahaLogo from "@/assets/saha-logo.jpeg.asset.json";
import { AuroraBackground } from "@/components/AuroraBackground";
import { GlassCard } from "@/components/GlassCard";
import { useTranslation } from "react-i18next";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SAHA Santé — Ordonnance scannée, médicaments livrés" },
      {
        name: "description",
        content:
          "Photo d'ordonnance → IA extrait vos médicaments → pharmacie la plus proche → livraison à domicile au Mali.",
      },
      { property: "og:title", content: "SAHA Santé — Ordonnance scannée, médicaments livrés" },
      {
        property: "og:description",
        content:
          "Photo d'ordonnance → IA extrait vos médicaments → pharmacie la plus proche → livraison à domicile au Mali.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sahasantemali.com/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://sahasantemali.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "SAHA Santé",
          url: "https://sahasantemali.com/",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SAHA Santé",
          url: "https://sahasantemali.com/",
          logo: "https://sahasantemali.com/favicon.png",
          description:
            "Service de scan d'ordonnance par IA, mise en relation avec les pharmacies et livraison de médicaments à domicile au Mali.",
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AuroraBackground intense />

      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={sahaLogo.url}
            alt="SAHA Santé"
            className="h-10 w-10 rounded-2xl object-cover ring-1 ring-white/20"
          />
          <span className="font-display text-xl">SAHA Santé</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#comment" className="hover:text-foreground">{t("landing.navHow")}</a>
          <a href="#pourquoi" className="hover:text-foreground">{t("landing.navWhy")}</a>
          <Link to="/privacy" className="hover:text-foreground">{t("landing.navPrivacy")}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm" className="text-foreground/80 hover:text-foreground">
              {t("common.signIn")}
            </Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" }}>
            <Button size="sm" className="aurora-bg text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-95">
              {t("landing.start")}
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-6 md:pt-10">
        <section className="grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-[10rem_10rem_10rem_10rem]">
          <GlassCard className="p-8 md:col-span-4 md:row-span-3 md:p-12">
            <div className="flex h-full flex-col justify-between gap-6">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-foreground/70">
                  <Sparkles className="h-3 w-3 text-accent" />
                  {t("landing.aiBadge")}
                </span>
                <h1 className="mt-6 font-display text-5xl leading-[1.02] md:text-7xl">
                  {t("landing.heroTitle1")}
                  <br />
                  <span className="aurora-text italic">{t("landing.heroTitle2")}</span>
                </h1>
                <p className="mt-5 max-w-lg text-base text-foreground/70 md:text-lg">
                  {t("landing.heroDesc")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Button size="lg" className="aurora-bg h-12 gap-2 rounded-full px-6 text-primary-foreground shadow-xl shadow-primary/40">
                    <Camera className="h-4 w-4" />
                    {t("landing.scanCta")}
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="ghost" className="h-12 rounded-full border border-white/15 bg-white/5 text-foreground hover:bg-white/10">
                    {t("landing.haveAccount")}
                  </Button>
                </Link>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 md:col-span-2 md:row-span-1">
            <div className="flex h-full items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-foreground/60">{t("landing.pharmacies")}</div>
                <div className="font-display text-4xl aurora-text">200+</div>
              </div>
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
              </span>
            </div>
          </GlassCard>

          <GlassCard className="p-6 md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl aurora-bg text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-2xl">{t("landing.aiExtract")}</div>
                <p className="mt-1 text-sm text-foreground/70">
                  {t("landing.aiExtractDesc")}
                </p>
                <div className="mt-4 space-y-1.5 text-xs font-mono text-foreground/70">
                  <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1">✓ Paracétamol 500mg — 2×/j</div>
                  <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1">✓ Amoxicilline 1g — 3×/j</div>
                  <div className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-accent">{t("landing.aiConfidence")}</div>
                </div>
              </div>
            </div>
          </GlassCard>

          <BentoStep icon={<Camera className="h-4 w-4" />} n="01" title={t("landing.step1")} text={t("landing.step1Text")} className="md:col-span-2" />
          <BentoStep icon={<MapPin className="h-4 w-4" />} n="02" title={t("landing.step2")} text={t("landing.step2Text")} className="md:col-span-2" />
          <BentoStep icon={<Truck className="h-4 w-4" />} n="03" title={t("landing.step3")} text={t("landing.step3Text")} className="md:col-span-2" />
        </section>

        <section id="pourquoi" className="mt-24">
          <div className="max-w-2xl">
            <span className="text-xs uppercase tracking-widest text-foreground/60">{t("landing.whyEyebrow")}</span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl">
              {t("landing.whyTitle1")} <span className="italic aurora-text">{t("landing.whyTitle2")}</span>.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Feature icon={<ShieldCheck className="h-5 w-5" />} title={t("landing.why1Title")} text={t("landing.why1Text")} />
            <Feature icon={<Sparkles className="h-5 w-5" />} title={t("landing.why2Title")} text={t("landing.why2Text")} />
            <Feature icon={<Package className="h-5 w-5" />} title={t("landing.why3Title")} text={t("landing.why3Text")} />
          </div>
        </section>

        <section className="mt-24">
          <GlassCard className="p-10 text-center md:p-16" featured>
            <Clock className="mx-auto h-6 w-6 text-accent" />
            <h2 className="mt-4 font-display text-4xl md:text-6xl">
              {t("landing.ctaTitle1")} <span className="aurora-text italic">{t("landing.ctaTitle2")}</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-foreground/70">
              {t("landing.ctaText")}
            </p>
            <Link to="/auth" search={{ mode: "signup" }} className="mt-8 inline-block">
              <Button size="lg" className="aurora-bg h-12 gap-2 rounded-full px-8 text-primary-foreground shadow-xl shadow-primary/40">
                <Camera className="h-4 w-4" /> {t("landing.ctaStart")}
              </Button>
            </Link>
          </GlassCard>
        </section>
      </main>

      <footer className="relative border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-foreground/60">
          <span>© {new Date().getFullYear()} SAHA Santé · Mali</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">{t("landing.navPrivacy")}</Link>
            <a href="mailto:contact@saha.sn" className="hover:text-foreground">{t("landing.footerContact")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BentoStep({ icon, n, title, text, className }: { icon: React.ReactNode; n: string; title: string; text: string; className?: string }) {
  return (
    <GlassCard className={`p-5 ${className ?? ""}`}>
      <div className="flex h-full items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-accent">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-foreground/50">{n}</div>
          <div className="font-display text-xl">{title}</div>
          <div className="text-xs text-foreground/60">{text}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <GlassCard interactive className="p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="mt-4 font-display text-xl">{title}</div>
      <p className="mt-2 text-sm text-foreground/70">{text}</p>
    </GlassCard>
  );
}
