import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookMarked,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteDoctorTemplate,
  listDoctorTemplates,
  saveDoctorTemplate,
} from "@/lib/doctor-rx.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PaperItemEditor,
  emptyItem,
  type EditorItem,
} from "@/components/doctor-rx/PrescriptionEditor";
import { formatDateTimeFr } from "@/components/doctor-rx/rx-ui";

export const Route = createFileRoute("/medecin/app/modeles")({
  component: TemplatesPage,
});

type Template = {
  id: string;
  name: string;
  diagnosis: string | null;
  advice: string | null;
  items: unknown;
  updated_at: string;
};

type Form = {
  id?: string;
  name: string;
  diagnosis: string;
  advice: string;
  items: EditorItem[];
};

const EMPTY_FORM: Form = { name: "", diagnosis: "", advice: "", items: [emptyItem()] };

function TemplatesPage() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    listDoctorTemplates()
      .then((r) => setRows(r as Template[]))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"));
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, items: [emptyItem()] });
    setOpen(true);
  };

  const openEdit = (t: Template) => {
    const raw = Array.isArray(t.items) ? (t.items as Array<Record<string, string>>) : [];
    setForm({
      id: t.id,
      name: t.name,
      diagnosis: t.diagnosis ?? "",
      advice: t.advice ?? "",
      items:
        raw.length > 0
          ? raw.map((i) => ({
              key: crypto.randomUUID(),
              medicineName: i.medicineName ?? i.medicine_name ?? "",
              dosage: i.dosage ?? "",
              form: i.form ?? "",
              quantity: i.quantity ?? "",
              posology: i.posology ?? "",
              frequency: i.frequency ?? "",
              duration: i.duration ?? "",
              route: i.route ?? "",
              instructions: i.instructions ?? "",
            }))
          : [emptyItem()],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Donnez un nom au modèle.");
      return;
    }
    const items = form.items.filter((i) => i.medicineName.trim());
    if (items.length === 0) {
      toast.error("Ajoutez au moins un médicament.");
      return;
    }
    setSaving(true);
    try {
      await saveDoctorTemplate({
        data: {
          id: form.id,
          name: form.name.trim(),
          diagnosis: form.diagnosis,
          advice: form.advice,
          items: items.map((i) => ({
            medicineName: i.medicineName,
            dosage: i.dosage,
            form: i.form,
            quantity: i.quantity,
            posology: i.posology,
            frequency: i.frequency,
            duration: i.duration,
            route: i.route,
            instructions: i.instructions,
          })),
        },
      });
      toast.success(form.id ? "Modèle mis à jour." : "Modèle créé.");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoctorTemplate({ data: { id: deleteTarget.id } });
      toast.success("Modèle supprimé.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2ee0aa]">
            Espace médecin
          </p>
          <h1 className="font-display text-3xl text-white sm:text-4xl">Modèles d'ordonnance</h1>
          <p className="mt-1 text-xs text-[#9fc4b9]">
            Réutilisez vos prescriptions fréquentes : diagnostic, conseils et médicaments.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="rx-btn-primary px-4 py-2.5 text-sm">
          <FilePlus2 className="h-4 w-4" />
          Nouveau modèle
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {!rows && (
        <div className="flex items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] py-16 text-[#9fc4b9]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] px-6 py-14 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/[0.06]">
            <BookMarked className="h-8 w-8 text-[#2ee0aa]" />
          </span>
          <p className="mt-3 text-sm font-bold text-white">Aucun modèle enregistré</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-[#9fc4b9]">
            Créez un modèle pour préremplir vos ordonnances en un clic : infections ORL, paludisme,
            hypertension…
          </p>
          <button type="button" onClick={openCreate} className="rx-btn-primary mt-5 px-4 py-2.5 text-xs">
            <Plus className="h-4 w-4" />
            Créer mon premier modèle
          </button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => {
            const count = Array.isArray(t.items) ? t.items.length : 0;
            return (
              <div key={t.id} className="rx-card flex flex-col rounded-[24px] p-4">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eef8f4]">
                    <img src="/icons3d/records.png" alt="" aria-hidden className="h-7 w-7 object-contain" />
                  </span>
                  <span className="rx-chip bg-[#e2f7ee] text-[#047857]">{count} médicament(s)</span>
                </div>
                <h2 className="mt-3 text-sm font-bold text-[#072b26]">{t.name}</h2>
                <p className="mt-1 line-clamp-2 text-[11px] text-[#5f7f76]">
                  {t.diagnosis || "Sans diagnostic renseigné"}
                </p>
                {t.advice && (
                  <p className="mt-1 line-clamp-2 text-[10px] italic text-[#8aa39c]">{t.advice}</p>
                )}
                <p className="mt-2 text-[9px] text-[#9fb3ad]">
                  Modifié le {formatDateTimeFr(t.updated_at)}
                </p>
                <div className="mt-3 flex gap-2 border-t border-[#eef5f2] pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#d7e7e1] px-3 py-1.5 text-[10px] font-bold text-[#047857] transition hover:bg-[#f4faf7]"
                  >
                    <Pencil className="h-3 w-3" />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t)}
                    className="grid h-7 w-7 place-items-center rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50"
                    aria-label={`Supprimer ${t.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] text-[#9fc4b9]">
        <Sparkles className="h-4 w-4 shrink-0 text-[#5ff0c4]" />
        Les modèles sont privés : ils ne sont visibles que par vous. Vous pouvez les charger depuis
        l'éditeur d'ordonnance.
        <Link to="/medecin/app/ordonnances/nouvelle" className="ml-auto shrink-0 font-bold text-[#5ff0c4]">
          Essayer
        </Link>
      </div>

      {/* Création / édition */}
      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto border-0 bg-transparent p-0 shadow-none rx-scroll">
          <div className="rx-form-sheet rounded-[26px] p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl text-[#072b26]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2f7ee] text-[#047857]">
                  <BookMarked className="h-4 w-4" />
                </span>
                {form.id ? "Modifier le modèle" : "Nouveau modèle"}
              </DialogTitle>
              <DialogDescription className="text-left text-xs text-[#5f7f76]">
                Le modèle préremplit le diagnostic, les conseils et les médicaments. Vous pourrez
                toujours ajuster avant de signer.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              <div className="rx-write-row grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <span className="rx-write-label">Nom du modèle *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex. Angine — adulte"
                  className="rx-write-input"
                />
              </div>
              <div className="rx-write-row grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <span className="rx-write-label">Diagnostic</span>
                <input
                  value={form.diagnosis}
                  onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
                  placeholder="Ex. Infection ORL"
                  className="rx-write-input"
                />
              </div>
              <div className="rx-write-row grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <span className="rx-write-label">Conseils</span>
                <input
                  value={form.advice}
                  onChange={(e) => setForm((f) => ({ ...f, advice: e.target.value }))}
                  placeholder="Ex. Boire beaucoup d'eau"
                  className="rx-write-input"
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="rx-section-title mt-0">Médicaments du modèle</p>
              {form.items.map((item, index) => (
                <PaperItemEditor
                  key={item.key}
                  item={item}
                  index={index}
                  readOnly={false}
                  canRemove={form.items.length > 1}
                  onChange={(patch) =>
                    setForm((f) => ({
                      ...f,
                      items: f.items.map((it) => (it.key === item.key ? { ...it, ...patch } : it)),
                    }))
                  }
                  onRemove={() =>
                    setForm((f) => ({ ...f, items: f.items.filter((it) => it.key !== item.key) }))
                  }
                />
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#9fc9ba] bg-[#f4faf7] px-3 py-2 text-[11px] font-bold text-[#047857] transition hover:border-[#00a97c] hover:bg-[#eaf8f2]"
              >
                <Plus className="h-4 w-4" />
                Ajouter un médicament
              </button>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Annuler
              </Button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rx-btn-primary flex-[1.5] px-4 py-2.5 text-sm"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                {saving ? "Enregistrement…" : "Enregistrer le modèle"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppression */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !deleting && !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm border-0 bg-transparent p-0 shadow-none">
          <div className="rx-paper rounded-[26px] p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-xl text-[#072b26]">
                <Trash2 className="h-5 w-5 text-rose-500" />
                Supprimer ce modèle ?
              </DialogTitle>
              <DialogDescription className="text-left text-xs text-[#5f7f76]">
                « {deleteTarget?.name} » sera définitivement supprimé. Les ordonnances déjà créées
                ne sont pas affectées.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-full border-[#d7e7e1] text-[#4f6f67]"
              >
                Annuler
              </Button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
