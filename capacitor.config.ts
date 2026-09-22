import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.sahasante",
  appName: "SAHA Santé",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Hot-reload from the Lovable preview while developing on a real device.
    // Comment out this `url` before producing the signed AAB for the Play Store.
    url: "https://sahapharm.lovable.app",
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
