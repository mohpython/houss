import { createFileRoute, Link } from "@tanstack/react-router";
import { Pill, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: i18n.t("meta.privacyTitle") },
      {
        name: "description",
        content:
          i18n.t("meta.privacyDesc"),
      },
      { property: "og:title", content: i18n.t("meta.privacyTitle") },
      {
        property: "og:description",
        content:
          i18n.t("meta.privacyOgDesc"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://sahasantemali.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://sahasantemali.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Pill className="h-4 w-4" />
            </div>
            <span className="font-semibold">SAHA Santé</span>
          </Link>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.home")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{t("privacy.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("privacy.updated")}</p>

        <div className="prose prose-sm mt-8 max-w-none space-y-6 text-foreground">
          <section>
            <p>
              {t("privacy.intro")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s1")}</h2>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <strong>{t("privacy.s1Account")}</strong> {t("privacy.s1AccountText")}
              </li>
              <li>
                <strong>{t("privacy.s1Rx")}</strong> {t("privacy.s1RxText")}
              </li>
              <li>
                <strong>{t("privacy.s1Location")}</strong> {t("privacy.s1LocationText")}
              </li>
              <li>
                <strong>{t("privacy.s1Camera")}</strong> {t("privacy.s1CameraText")}
              </li>
              <li>
                <strong>{t("privacy.s1Notif")}</strong> {t("privacy.s1NotifText")}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s2")}</h2>
            <p>
              {t("privacy.s2Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s3")}</h2>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <strong>{t("privacy.s3Pharmacy")}</strong> {t("privacy.s3PharmacyText")}
              </li>
              <li>
                <strong>{t("privacy.s3Courier")}</strong> {t("privacy.s3CourierText")}
              </li>
              <li>
                <strong>{t("privacy.s3Sub")}</strong> {t("privacy.s3SubText")}
              </li>
              <li>{t("privacy.s3NoSale")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s4")}</h2>
            <p>
              {t("privacy.s4Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s5")}</h2>
            <p>
              {t("privacy.s5Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s6")}</h2>
            <p>
              {t("privacy.s6Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s7")}</h2>
            <p>
              {t("privacy.s7Text")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s8")}</h2>
            <p>
              {t("privacy.contactIntro")}{" "}
              <a
                href="mailto:housseinifofana0091@gmail.com"
                className="text-primary hover:underline"
              >
                housseinifofana0091@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("privacy.s9")}</h2>
            <p>
              {t("privacy.s9Text")}
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
