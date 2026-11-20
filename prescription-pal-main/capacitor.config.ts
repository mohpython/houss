import type { CapacitorConfig } from "@capacitor/cli";

/**
 * URL chargée par l'application Android (webview Capacitor).
 *
 * Par défaut : le site hébergé, comme pour la version publiée sur le Play
 * Store. Pour un build de test local, définir `CAPACITOR_SERVER_URL` :
 *   set CAPACITOR_SERVER_URL=http://localhost:3000 && npx cap sync android
 * Le trafic en clair n'est alors autorisé que dans ce cas.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://sahasantemali.com";

const config: CapacitorConfig = {
  appId: "app.lovable.sahasante",
  appName: "SAHA Santé",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // L'application mobile affiche le site hébergé sur le VPS (rendu serveur +
    // API) : cette URL doit rester active, y compris pour la version Play Store.
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
