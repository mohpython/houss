import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Pill, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/FeedbackForm";
import { checkFeedbackEligibility, submitPhoneFeedback } from "@/lib/feedback.functions";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Donner votre avis — SAHA Santé" },
      {
        name: "description",
        content:
          "Clients SAHA Santé : notez votre commande de médicaments et laissez une remarque après vérification de votre numéro de téléphone.",
      },
      { property: "og:title", content: "Donner votre avis — SAHA Santé" },
      {
        property: "og:description",
        content: "Notez votre expérience SAHA Santé après une commande de médicaments au Mali.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://sahasantemali.com/feedback" },
    ],
    links: [{ rel: "canonical", href: "https://sahasantemali.com/feedback" }],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { t } = useTranslation();
  const check = useServerFn(checkFeedbackEligibility);
  const submit = useServerFn(submitPhoneFeedback);

  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [eligible, setEligible] = useState<{ lastOrderAt: string; pharmacyName: string | null } | null>(null);
  const [done, setDone] = useState(false);

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    try {
      const res = await check({ data: { phone } });
      if (res.eligible) {
        setEligible({ lastOrderAt: res.lastOrderAt, pharmacyName: res.pharmacyName });
        toast.success(t("feedback.verified"));
      } else {
        setEligible(null);
        toast.error(t("feedback.notFound"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Pill className="h-4 w-4" />
            </div>
            <span className="font-semibold">SAHA Santé</span>
          </Link>
          <Link to="/" className="ms-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{t("feedback.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("feedback.intro")}</p>

        {done ? (
          <Card className="mt-6 flex items-center gap-3 p-6">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <span className="font-medium">{t("feedback.thanks")}</span>
          </Card>
        ) : (
          <>
            <Card className="mt-6 p-5">
              <form onSubmit={onVerify} className="space-y-3">
                <label htmlFor="phone" className="text-sm font-medium">
                  {t("feedback.phoneLabel")}
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("feedback.phonePlaceholder")}
                  required
                />
                <Button type="submit" variant="outline" disabled={checking || phone.trim().length < 6}>
                  {checking ? t("common.loading") : t("feedback.verify")}
                </Button>
              </form>

              {eligible && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("feedback.lastOrder")}: {new Date(eligible.lastOrderAt).toLocaleDateString()}
                  {eligible.pharmacyName ? ` — ${t("feedback.atPharmacy")} ${eligible.pharmacyName}` : ""}
                </p>
              )}
            </Card>

            {eligible && (
              <Card className="mt-4 p-5">
                <FeedbackForm
                  submitting={sending}
                  onSubmit={async ({ rating, comment }) => {
                    setSending(true);
                    try {
                      await submit({ data: { phone, rating, comment } });
                      setDone(true);
                      toast.success(t("feedback.thanks"));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t("common.error"));
                    } finally {
                      setSending(false);
                    }
                  }}
                />
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
