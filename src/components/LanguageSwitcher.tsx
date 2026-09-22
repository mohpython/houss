import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applyLanguage, SUPPORTED_LANGS, type SupportedLang } from "@/i18n";
import { auth } from "@/integrations/auth/client";
import { setMyLanguage } from "@/lib/account.functions";

const FLAGS: Record<SupportedLang, string> = { fr: "🇫🇷", en: "🇬🇧", ar: "🇸🇦" };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "fr") as SupportedLang;

  const change = async (lang: SupportedLang) => {
    applyLanguage(lang);
    const { data } = await auth.getSession();
    if (data.session) {
      await setMyLanguage({ data: { language: lang } }).catch(() => undefined);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "icon" : "sm"} className="gap-2">
          <Globe className="h-4 w-4" />
          {!compact && (
            <span>
              {FLAGS[current]} {t(`languages.${current}`)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGS.map((l) => (
          <DropdownMenuItem key={l} onClick={() => change(l)}>
            <span className="mr-2">{FLAGS[l]}</span>
            {t(`languages.${l}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
