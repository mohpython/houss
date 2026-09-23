import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.sahasante",
  appName: "SAHA Santé",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // L'application mobile affiche le site hébergé sur le VPS (rendu serveur +
    // API) : cette URL doit rester active, y compris pour la version Play Store.
    url: "https://sahasantemali.com",
    cleartext: false,
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
