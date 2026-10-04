import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/integrations/auth/client";
import { getMyLanguage } from "@/lib/account.functions";
import { applyLanguage } from "@/i18n";
import { applyTheme, getStoredTheme, useTheme } from "@/hooks/useTheme";
import { AuroraBackground } from "@/components/AuroraBackground";
import { WhatsAppFab } from "@/components/WhatsAppFab";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <AuroraBackground />
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <h1 className="font-display text-7xl aurora-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full aurora-bg px-5 py-2.5 text-sm font-medium text-on-aurora transition-transform hover:scale-[1.03]"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <AuroraBackground />
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl text-foreground">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Impossible de charger cette page. Réessayez ou revenez à l'accueil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full aurora-bg px-4 py-2 text-sm font-medium text-on-aurora transition-transform hover:scale-[1.03]"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="rounded-full border border-border/60 bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SAHA Santé — Votre ordonnance. Livrée." },
      {
        name: "description",
        content:
          "Scannez votre ordonnance, l'IA extrait vos médicaments et les livre depuis la pharmacie la plus proche.",
      },
      { property: "og:title", content: "SAHA Santé" },
      {
        property: "og:description",
        content:
          "Scannez votre ordonnance, l'IA extrait vos médicaments et les livre depuis la pharmacie la plus proche.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0A1931" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Fira+Sans:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('saha_theme');var r=document.documentElement;if(t==='light'){r.classList.remove('dark');r.classList.add('light');}}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const { theme } = useTheme();

  useEffect(() => {
    applyTheme(getStoredTheme());

    try {
      const stored = localStorage.getItem("saha_lang");
      if (stored) applyLanguage(stored);
      else applyLanguage("fr");
    } catch {
      applyLanguage("fr");
    }

    auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const language = await getMyLanguage().catch(() => null);
      if (language) applyLanguage(language);
    });

    let lastUserId: string | null | undefined;
    const { data } = auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const userId = session?.user?.id ?? null;
      // Only react when the identity actually changed, otherwise the whole tree
      // remounts needlessly.
      if (lastUserId !== undefined && userId === lastUserId && event !== "USER_UPDATED") return;
      lastUserId = userId;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <WhatsAppFab />
      <Toaster richColors position="top-right" theme={theme} />
    </QueryClientProvider>
  );
}
