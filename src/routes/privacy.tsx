import { createFileRoute, Link } from "@tanstack/react-router";
import { Pill, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — SAHA Santé" },
      {
        name: "description",
        content:
          "Comment SAHA Santé collecte, utilise et protège vos données personnelles, ordonnances, localisation et accès caméra.",
      },
      { property: "og:title", content: "Politique de confidentialité — SAHA Santé" },
      {
        property: "og:description",
        content:
          "Politique de confidentialité de SAHA Santé : ordonnances, caméra, localisation, notifications.",
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
            Accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : 23 juillet 2026</p>

        <div className="prose prose-sm mt-8 max-w-none space-y-6 text-foreground">
          <section>
            <p>
              Cette page est maintenue par l'équipe SAHA Santé pour répondre aux questions courantes
              sur la confidentialité et la sécurité de l'application SAHA Santé (« l'Application »).
              Elle décrit les données que nous collectons, comment nous les utilisons et les choix
              dont vous disposez.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">1. Données que nous collectons</h2>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <strong>Compte :</strong> email, nom complet, langue préférée et rôle (patient,
                pharmacie, livreur, admin).
              </li>
              <li>
                <strong>Ordonnances :</strong> photos ou PDF d'ordonnances que vous téléversez, et
                les médicaments extraits automatiquement par notre système d'IA.
              </li>
              <li>
                <strong>Localisation :</strong> position approximative ou précise, utilisée
                uniquement pour trouver les pharmacies proches et pour la livraison.
              </li>
              <li>
                <strong>Caméra :</strong> accès demandé uniquement lorsque vous choisissez de
                photographier une ordonnance. Aucune capture en arrière-plan.
              </li>
              <li>
                <strong>Notifications :</strong> jeton d'appareil pour les notifications liées à vos
                réservations et livraisons.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Utilisation des données</h2>
            <p>
              Vos données servent à faire fonctionner l'Application : analyser vos ordonnances,
              trouver les pharmacies partenaires qui disposent des médicaments prescrits, gérer les
              réservations et coordonner la livraison. Les données de santé ne sont jamais utilisées
              à des fins publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Partage des données</h2>
            <ul className="ml-6 list-disc space-y-2">
              <li>
                <strong>Pharmacie sélectionnée :</strong> reçoit votre ordonnance et vos
                informations de contact strictement nécessaires pour préparer la commande.
              </li>
              <li>
                <strong>Livreur assigné :</strong> reçoit l'adresse de livraison et le point de
                retrait, uniquement pendant la durée de la course.
              </li>
              <li>
                <strong>Sous-traitants techniques :</strong> Hostinger (hébergement du serveur et de
                la base de données), Google Maps (géolocalisation et itinéraires), fournisseur d'IA
                (extraction des médicaments). Ces prestataires traitent vos données pour notre
                compte et sous contrat.
              </li>
              <li>Nous ne vendons pas vos données personnelles.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Conservation</h2>
            <p>
              Les ordonnances et réservations sont conservées le temps nécessaire au suivi du
              service et pour répondre aux obligations légales. Vous pouvez demander la suppression
              de votre compte à tout moment.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Sécurité</h2>
            <p>
              Les données sont chiffrées en transit (HTTPS) et au repos. L'accès aux ordonnances est
              restreint via des règles de sécurité au niveau des lignes (RLS) : seul le patient
              concerné, la pharmacie destinataire et le livreur assigné peuvent y accéder.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Vos droits</h2>
            <p>
              Vous pouvez accéder, corriger ou supprimer vos données, retirer les autorisations
              caméra / localisation depuis les réglages de votre téléphone, et demander l'export de
              vos données en nous contactant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Enfants</h2>
            <p>
              L'Application n'est pas destinée aux enfants de moins de 13 ans. Les mineurs doivent
              utiliser l'Application sous la responsabilité d'un parent ou tuteur.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Contact</h2>
            <p>
              Pour toute question ou demande relative à vos données, contactez :{" "}
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
            <h2 className="text-xl font-semibold">9. Modifications</h2>
            <p>
              Nous pouvons mettre à jour cette politique. En cas de changement significatif, nous
              vous en informerons dans l'Application.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
