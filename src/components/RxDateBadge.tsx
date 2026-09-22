import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CalendarClock, CalendarX } from "lucide-react";
import { rxDateStatus, daysSince } from "@/lib/date-utils";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/i18n";

export function RxDateBadge({
  date,
  raw,
  className,
}: {
  date: string | null | undefined;
  raw?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const status = rxDateStatus(date);

  const label = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(getDateLocale(), {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : (raw ?? t("rxDate.missing"));

  const map = {
    valid: {
      cls: "bg-success/10 text-success border-success/30",
      icon: <CalendarCheck className="mr-1 h-3 w-3" />,
      suffix: t("rxDate.valid"),
    },
    expired: {
      cls: "bg-destructive/10 text-destructive border-destructive/30",
      icon: <CalendarX className="mr-1 h-3 w-3" />,
      suffix: date ? t("rxDate.expiredDays", { days: daysSince(date) }) : t("rxDate.expired"),
    },
    future: {
      cls: "bg-destructive/10 text-destructive border-destructive/30",
      icon: <CalendarX className="mr-1 h-3 w-3" />,
      suffix: t("rxDate.future"),
    },
    missing: {
      cls: "bg-warning/10 text-warning border-warning/30",
      icon: <CalendarClock className="mr-1 h-3 w-3" />,
      suffix: t("rxDate.missingShort"),
    },
  } as const;

  const s = map[status];

  return (
    <Badge variant="secondary" className={`border ${s.cls} ${className ?? ""}`}>
      {s.icon}
      {label} · {s.suffix}
    </Badge>
  );
}
