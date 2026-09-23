/**
 * Configuration PM2 (gestionnaire de processus Node sur le VPS).
 *
 *   pm2 start ecosystem.config.cjs     # premier démarrage
 *   pm2 reload saha                    # après une mise à jour
 *   pm2 logs saha                      # journaux
 *
 * Une seule instance (mode fork) : le temps réel (SSE) et les tâches
 * planifiées tournent dans ce processus.
 */
module.exports = {
  apps: [
    {
      name: "saha",
      cwd: __dirname,
      script: ".output/server/index.mjs",
      // Charge le fichier .env (Node >= 20.6)
      node_args: "--env-file=.env",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "700M",
      kill_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
