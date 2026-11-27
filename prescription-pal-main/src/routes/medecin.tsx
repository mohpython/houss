import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/medecin")({
  head: () => ({
    meta: [
      { title: "SAHA Santé — e-Ordonnance médecin" },
      {
        name: "description",
        content:
          "Rédigez, signez et transmettez vos ordonnances électroniques en toute sécurité. Vérification par QR code pour les pharmacies.",
      },
    ],
  }),
  component: () => (
    <div className="rx-portal">
      <Outlet />
    </div>
  ),
});
