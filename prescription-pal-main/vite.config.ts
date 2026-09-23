import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Build autonome (sans Lovable) : serveur Node.js (preset `node-server`) prêt
// pour un VPS. Le build produit `.output/server/index.mjs`, lancé par PM2.
export default defineConfig(() => {
  // Les variables VITE_* du fichier .env sont injectées au build (navigateur).
  return {
    server: { port: 3000, host: true },
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
