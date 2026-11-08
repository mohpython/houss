import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs, type AuditLogCounts, type AuditLogRow } from "@/lib/audit-logs.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Bike,
  Bot,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { getDateLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/app/admin/logs")({
  head: () => ({
    meta: [
      { title: i18n.t("adminLogs.metaTitle") },
      { name: "description", content: i18n.t("adminLogs.metaDesc") },
      { property: "og:title", content: i18n.t("adminLogs.metaTitle") },
      { property: "og:description", content: i18n.t("adminLogs.metaDesc") },
    ],
  }),
  component: AdminLogs,
});

type RoleFilter =
  "all" | "patient" | "pharmacy_staff" | "courier" | "doctor" | "nurse" | "admin" | "system";

type CategoryFilter =
  "all" | "auth" | "prescription" | "reservation" | "delivery" | "payment" | "pharmacy" | "admin";

type Category = Exclude<CategoryFilter, "all">;

type RangeFilter = "1" | "7" | "30" | "90" | "0";

const ROLES: RoleFilter[] = [
  "all",
  "patient",
  "pharmacy_staff",
  "courier",
  "doctor",
  "nurse",
  "admin",
  "system",
];

const CATEGORIES: CategoryFilter[] = [
  "all",
  "auth",
  "prescription",
  "reservation",
  "delivery",
  "payment",
  "pharmacy",
  "admin",
];

const RANGES: RangeFilter[] = ["1", "7", "30", "90", "0"];

const CATEGORY_LABEL_KEYS: Record<Category, string> = {
  auth: "catAuth",
  prescription: "catPrescription",
  reservation: "catReservation",
  delivery: "catDelivery",
  payment: "catPayment",
  pharmacy: "catPharmacy",
  admin: "catAdmin",
};

const EMPTY_COUNTS: AuditLogCounts = {
  total: 0,
  patients: 0,
  pharmacies: 0,
  couriers: 0,
  system: 0,
};

/** Catégorie affichée pour une action (même découpage que la fonction serveur). */
function categoryOf(action: string): Category {
  if (action.startsWith("auth.")) return "auth";
  if (action.startsWith("prescription") || action.startsWith("pharmacy_search")) {
    return "prescription";
  }
  if (action.startsWith("reservation")) return "reservation";
  if (
    action.startsWith("delivery") ||
    action.startsWith("courier") ||
    action.startsWith("fulfillment")
  ) {
    return "delivery";
  }
  if (action.startsWith("payment")) return "payment";
  if (action.startsWith("pharmacy")) return "pharmacy";
  return "admin";
}

function AdminLogs() {
  const { t } = useTranslation();
  const listFn = useServerFn(listAuditLogs);

  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [counts, setCounts] = useState<AuditLogCounts>(EMPTY_COUNTS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [range, setRange] = useState<RangeFilter>("7");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const requestId = useRef(0);

  // La recherche est envoyée 350 ms après la dernière frappe.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await listFn({
        data: {
          q: debouncedQuery,
          role,
          category,
          days: Number(range),
          limit: 300,
        },
      });
      if (id !== requestId.current) return;
      setRows(res.rows as AuditLogRow[]);
      setCounts(res.counts as AuditLogCounts);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setRows([]);
      setError(e instanceof Error ? e.message : i18n.t("adminLogs.error"));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    }, [listFn, debouncedQuery, role, category, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionLabel = useCallback(
    (action: string) => {
      const key = `adminLogs.actions.${action.replace(/\./g, "_")}`;
      const label = t(key);
      return label === key
        ? action.replace(/[._]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
        : label;
    },
    [t],
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kpis = useMemo(
    () => [
      {
        key: "total",
        label: t("adminLogs.kpiTotal"),
        value: counts.total,
        icon: <ScrollText className="h-4 w-4" />,
        tone: "bg-primary/10 text-primary",
      },
      {
        key: "patients",
        label: t("adminLogs.kpiPatients"),
        value: counts.patients,
        icon: <Users className="h-4 w-4" />,
        tone: "bg-primary/10 text-primary",
      },
      {
        key: "pharmacies",
        label: t("adminLogs.kpiPharmacies"),
        value: counts.pharmacies,
        icon: <Store className="h-4 w-4" />,
        tone: "bg-success/10 text-success",
      },
      {
        key: "couriers",
        label: t("adminLogs.kpiCouriers"),
        value: counts.couriers,
        icon: <Bike className="h-4 w-4" />,
        tone: "bg-warning/10 text-warning",
      },
      {
        key: "system",
        label: t("adminLogs.kpiSystem"),
        value: counts.system,
        icon: <Bot className="h-4 w-4" />,
        tone: "bg-muted text-muted-foreground",
      },
    ],
    [counts, t],
  );

  const dateLocale = getDateLocale();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        to="/app/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("adminLogs.back")}
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ScrollText className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("adminLogs.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminLogs.subtitle")}</p>
        </div>
      </div>

      <section
        aria-label={t("adminLogs.filtersTitle")}
        className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        {kpis.map((k) => (
          <Card key={k.key} className="p-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}
              aria-hidden="true"
            >
              {k.icon}
            </div>
            <div className="mt-2 text-2xl font-bold">
              {rows === null ? "…" : k.value.toLocaleString(dateLocale)}
            </div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </Card>
        ))}
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative lg:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("adminLogs.searchPh")}
            className="h-10 pl-9"
            aria-label={t("adminLogs.searchAria")}
          />
        </div>

        <div className="lg:col-span-2">
          <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)}>
            <SelectTrigger aria-label={t("adminLogs.roleAria")} className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "all"
                    ? t("adminLogs.roleAll")
                    : r === "system"
                      ? t("adminLogs.roleSystem")
                      : t("role." + r, r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="lg:col-span-2">
          <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
            <SelectTrigger aria-label={t("adminLogs.categoryAria")} className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "all" ? t("adminLogs.catAll") : t("adminLogs." + CATEGORY_LABEL_KEYS[c])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="lg:col-span-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeFilter)}>
            <SelectTrigger aria-label={t("adminLogs.periodAria")} className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "0" ? t("adminLogs.periodAll") : t("adminLogs.period" + r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-10 lg:col-span-2"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("adminLogs.refresh")}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {t("adminLogs.shown", {
            shown: rows?.length ?? 0,
            total: counts.total,
          })}
        </span>
        {debouncedQuery && (
          <span className="truncate">
            {t("common.search")} : « {debouncedQuery} »
          </span>
        )}
      </div>

      {error && (
        <Card className="mt-4 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">{t("adminLogs.error")}</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            {t("adminLogs.retry")}
          </Button>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {rows === null && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {rows !== null && rows.length === 0 && !error && (
          <Card className="p-8 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium">{t("adminLogs.emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("adminLogs.empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("adminLogs.emptyHint")}</p>
          </Card>
        )}

        {rows?.map((row) => {
          const isOpen = expanded.has(row.id);
          const cat = categoryOf(row.action);
          const actorName = row.actor
            ? row.actor.full_name ||
              row.actor.email ||
              row.actor.phone ||
              t("adminLogs.deletedUser")
            : t("adminLogs.anonymous");
          const hasMeta =
            row.meta != null &&
            (typeof row.meta !== "object" || Object.keys(row.meta as object).length > 0);

          return (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.actor ? (
                      <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                    <p className="font-semibold">{actorName}</p>
                    {row.actor ? (
                      row.actor.roles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                          {t("role." + r, r)}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">{t("adminLogs.kpiSystem")}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.actor
                      ? [row.actor.email, row.actor.phone].filter(Boolean).join(" · ") ||
                        t("adminLogs.noMeta")
                      : t("adminLogs.anonymous")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <Badge variant="outline">{t("adminLogs." + CATEGORY_LABEL_KEYS[cat])}</Badge>
                  <time className="text-xs text-muted-foreground" dateTime={row.created_at}>
                    {new Date(row.created_at).toLocaleString(dateLocale)}
                  </time>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{actionLabel(row.action)}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {row.action}
                </code>
                <span className="text-xs text-muted-foreground">
                  {t("adminLogs.target")} : {row.entity}
                  {row.entity_id ? ` #${row.entity_id.slice(0, 8).toUpperCase()}` : ""}
                </span>
                {hasMeta && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-8"
                    onClick={() => toggle(row.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? (
                      <ChevronUp className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    )}
                    {isOpen ? t("adminLogs.hideDetails") : t("adminLogs.showDetails")}
                  </Button>
                )}
              </div>

              {isOpen && hasMeta && (
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
                  {JSON.stringify(row.meta, null, 2)}
                </pre>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("adminLogs.subtitle")}
      </p>
    </main>
  );
}
