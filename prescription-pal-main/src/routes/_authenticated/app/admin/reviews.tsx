import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPrescriptionReviews,
  resolvePrescriptionReview,
  requestRetake,
  editExtraction,
} from "@/lib/review.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShieldAlert,
  Check,
  X,
  RotateCcw,
  Edit3,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Ordonnances à vérifier — SAHA Santé" },
      {
        name: "description",
        content: "File de vérification des ordonnances signalées par l'IA.",
      },
      { property: "og:title", content: "Ordonnances à vérifier — SAHA Santé" },
      {
        property: "og:description",
        content: "File de vérification des ordonnances signalées par l'IA.",
      },
    ],
  }),
  component: Reviews,
});

type Review = Awaited<ReturnType<typeof listPrescriptionReviews>>[number];

const severityStyles: Record<string, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  moderate: "border-warning/30 bg-warning/10 text-warning",
  minor: "border-info/30 bg-info/10 text-info-foreground",
};

const severityIcon: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="h-4 w-4" />,
  moderate: <ShieldAlert className="h-4 w-4" />,
  minor: <ShieldAlert className="h-4 w-4" />,
};

function Reviews() {
  const [rows, setRows] = useState<Review[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    prescriptionDate: string;
    doctorName: string;
    hospital: string;
    items: Record<string, { medicineNameRaw: string; strength: string; dosage: string; quantity: string; duration: string }>;
  } | null>(null);
  const list = useServerFn(listPrescriptionReviews);
  const resolve = useServerFn(resolvePrescriptionReview);
  const retake = useServerFn(requestRetake);
  const edit = useServerFn(editExtraction);

  const load = async () => {
    try {
      setRows(await list({}));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await resolve({ data: { prescriptionId: id, decision } });
      toast.success(decision === "approved" ? "Validée" : "Refusée");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const doRetake = async (id: string) => {
    setBusy(id);
    try {
      await retake({ data: { prescriptionId: id } });
      toast.success("Demande de nouvelle photo envoyée");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (r: Review) => {
    setEditingId(r.id);
    const items: Record<string, { medicineNameRaw: string; strength: string; dosage: string; quantity: string; duration: string }> = {};
    for (const item of r.items) {
      items[item.id] = {
        medicineNameRaw: item.medicine_name_raw ?? "",
        strength: item.strength ?? "",
        dosage: item.dosage ?? "",
        quantity: item.quantity ?? "",
        duration: item.duration ?? "",
      };
    }
    setEditForm({
      prescriptionDate: r.date ?? r.dateRaw ?? "",
      doctorName: r.doctor ?? "",
      hospital: r.hospital ?? "",
      items,
    });
  };

  const saveEdit = async (id: string) => {
    if (!editForm) return;
    setBusy(id);
    try {
      const items = Object.entries(editForm.items).map(([itemId, vals]) => ({
        id: itemId,
        medicineNameRaw: vals.medicineNameRaw || undefined,
        strength: vals.strength || undefined,
        dosage: vals.dosage || undefined,
        quantity: vals.quantity || undefined,
        duration: vals.duration || undefined,
      }));
      await edit({
        data: {
          prescriptionId: id,
          prescriptionDate: editForm.prescriptionDate || undefined,
          doctorName: editForm.doctorName || undefined,
          hospital: editForm.hospital || undefined,
          items,
        },
      });
      toast.success("Extraction corrigée et validée");
      setEditingId(null);
      setEditForm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-warning" />
        <h1 className="text-2xl font-bold tracking-tight">Ordonnances à vérifier</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        L'IA envoie ici les documents douteux : date illisible ou périmée, faible confiance,
        aucun médicament détecté. Les cas critiques sont affichés en premier.
      </p>

      {rows === null ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-6 p-6 text-sm text-muted-foreground">
          Aucune ordonnance en attente de vérification.
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((r) => (
            <Card key={r.id} className={`p-4 ${editingId === r.id ? "ring-2 ring-primary/40" : ""}`}>
              <div className="flex flex-wrap items-start gap-4">
                {r.imageUrl && (
                  <a href={r.imageUrl} target="_blank" rel="noreferrer">
                    <img
                      src={r.imageUrl}
                      alt="Ordonnance signalée"
                      className="h-56 w-44 rounded-lg border border-border object-cover"
                    />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={severityStyles[r.severity] ?? severityStyles.moderate}>
                      {severityIcon[r.severity] ?? severityIcon.moderate}
                      <span className="ml-1 capitalize">{r.severity}</span>
                    </Badge>
                    {r.reasons.map((reason, idx) => (
                      <Badge
                        key={idx}
                        className="border border-warning/30 bg-warning/10 text-warning"
                      >
                        {reason}
                      </Badge>
                    ))}
                    {r.confidence !== null && (
                      <Badge variant="secondary">IA {r.confidence}%</Badge>
                    )}
                    {r.details?.authenticityScore !== undefined && (
                      <Badge variant="secondary">
                        Authenticité {r.details.authenticityScore}%
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <div>
                      Patient : {r.patientName ?? "—"}{" "}
                      <span className="text-muted-foreground">
                        {r.patientEmail ?? r.patientPhone ?? ""}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Médecin : {r.doctor ?? "—"}
                      {r.hospital ? ` (${r.hospital})` : ""} · Date :{" "}
                      {r.date ?? r.dateRaw ?? "illisible"}
                      {r.details?.dateStatus ? ` · ${r.details.dateStatus}` : ""}
                    </div>
                  </div>

                  {(r.details?.unreadableZones?.length ||
                    r.details?.inconsistencies?.length ||
                    r.details?.qualityNotes) && (
                    <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted p-3 text-xs">
                      {r.details?.unreadableZones?.map((z, idx) => (
                        <div key={`z${idx}`}>Zone illisible : {z}</div>
                      ))}
                      {r.details?.inconsistencies?.map((c, idx) => (
                        <div key={`c${idx}`}>Incohérence : {c}</div>
                      ))}
                      {r.details?.qualityNotes && (
                        <div>Qualité image : {r.details.qualityNotes}</div>
                      )}
                    </div>
                  )}

                  {editingId === r.id && editForm ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Date</Label>
                          <Input
                            value={editForm.prescriptionDate}
                            onChange={(e) =>
                              setEditForm({ ...editForm, prescriptionDate: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Médecin</Label>
                          <Input
                            value={editForm.doctorName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, doctorName: e.target.value })
                            }
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Établissement</Label>
                        <Input
                          value={editForm.hospital}
                          onChange={(e) =>
                            setEditForm({ ...editForm, hospital: e.target.value })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      {Object.entries(editForm.items).map(([itemId, vals]) => (
                        <div key={itemId} className="space-y-1 border-t border-border pt-2">
                          <Label className="text-xs text-muted-foreground">Médicament</Label>
                          <Input
                            value={vals.medicineNameRaw}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                items: {
                                  ...editForm.items,
                                  [itemId]: { ...vals, medicineNameRaw: e.target.value },
                                },
                              })
                            }
                            className="h-8 text-sm"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Dosage"
                              value={vals.strength}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  items: {
                                    ...editForm.items,
                                    [itemId]: { ...vals, strength: e.target.value },
                                  },
                                })
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="Posologie"
                              value={vals.dosage}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  items: {
                                    ...editForm.items,
                                    [itemId]: { ...vals, dosage: e.target.value },
                                  },
                                })
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="Quantité"
                              value={vals.quantity}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  items: {
                                    ...editForm.items,
                                    [itemId]: { ...vals, quantity: e.target.value },
                                  },
                                })
                              }
                              className="h-8 text-xs"
                            />
                            <Input
                              placeholder="Durée"
                              value={vals.duration}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  items: {
                                    ...editForm.items,
                                    [itemId]: { ...vals, duration: e.target.value },
                                  },
                                })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          disabled={busy === r.id}
                          onClick={() => saveEdit(r.id)}
                        >
                          <Check className="mr-1 h-4 w-4" /> Enregistrer et valider
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditForm(null);
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1 text-sm">
                        {r.items.length === 0 && (
                          <li className="text-muted-foreground">Aucun médicament extrait</li>
                        )}
                        {r.items.map((i) => (
                          <li key={i.id}>
                            • {i.medicine_name_raw} {i.strength ?? ""} {i.dosage ?? ""}{" "}
                            {i.quantity ?? ""} {i.duration ?? ""}
                          </li>
                        ))}
                      </ul>

                      {r.aiRaw && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            JSON extrait par l'IA
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-black/30 p-3 text-[11px] leading-relaxed">
                            {r.aiRaw}
                          </pre>
                        </details>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, "approved")}
                        >
                          <Check className="mr-1 h-4 w-4" /> Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, "rejected")}
                        >
                          <X className="mr-1 h-4 w-4" /> Refuser
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => doRetake(r.id)}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Demander une nouvelle photo
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => startEdit(r)}
                        >
                          <Edit3 className="mr-1 h-4 w-4" /> Corriger l'extraction
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
