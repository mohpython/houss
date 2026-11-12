import { useEffect, useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { isSpeaking, isVoiceEnabled, speak, stopSpeaking } from "@/lib/speech";

/**
 * Bouton « Écouter » : lit un texte à voix haute dans la langue choisie.
 * L'icône change quand la synthèse est en cours.
 */
export function SpeakButton({
  text,
  className,
  label,
}: {
  /** Texte à lire (déjà traduit). */
  text: string;
  className?: string;
  /** Libellé affiché (par défaut : « Écouter »). */
  label?: string;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setEnabled(isVoiceEnabled());
    const s = window.speechSynthesis;
    if (!s) return;
    const onStart = () => setSpeaking(true);
    const onEnd = () => setSpeaking(false);
    s.addEventListener("start", onStart);
    s.addEventListener("end", onEnd);
    s.addEventListener("cancel", onEnd);
    return () => {
      s.removeEventListener("start", onStart);
      s.removeEventListener("end", onEnd);
      s.removeEventListener("cancel", onEnd);
    };
  }, []);

  if (!enabled) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label ?? t("voice.listen", "Écouter")}
      title={label ?? t("voice.listen", "Écouter")}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        speak(text, i18n.resolvedLanguage ?? "fr");
      }}
    >
      {speaking ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </Button>
  );
}
