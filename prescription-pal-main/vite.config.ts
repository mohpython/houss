import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";


// Build autonome (sans Lovable) : serveur Node.js (preset `node-server`) prêt
// pour un VPS. Le build produit `.output/server/index.mjs`, lancé par PM2.
export default defineConfig(({ mode }) => {
  // Les variables VITE_* du fichier .env sont injectées au build (navigateur).
  // `APP_URL` n'est pas exposée au client par Vite (préfixe VITE_ requis) : on
  // la publie explicitement, et elle seule, pour que les URL publiques
  // (canonical, Open Graph, sitemap) suivent exactement le domaine du serveur
  // sans jamais mettre de secret dans le bundle.
  const env = loadEnv(mode, process.cwd(), "");
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  return {
    define: { __APP_URL__: JSON.stringify(appUrl) },
    server: {
      port: 3000,
      host: true,
      // Hôtes acceptés en développement. Le domaine de production n'est plus
      // autorisé : le poste de travail ne sert QUE le domaine de dev.
      allowedHosts: [".trycloudflare.com"],
    },
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
    },
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // src/server.ts enveloppe le point d'entrée SSR (page d'erreur propre).
        server: { entry: "server" },
      }),
      nitro({
        preset: "node-server",
        // Prisma embarque un moteur natif : on le laisse dans node_modules.
        rollupConfig: { external: [/^@prisma\/client/, /^\.prisma/] },
      }),
      viteReact(),
      tailwindcss(),
    ],
  };
});
