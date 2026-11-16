import { useEffect, useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { isVoiceEnabled, speak, stopSpeaking } from "@/lib/speech";
import { bambaraPhrase, type BambaraPhraseKey } from "@/lib/bambara-phrases";
import {
  getBambaraTtsState,
  prefetchBambara,
  speakBambara,
  stopBambara,
  subscribeBambaraTts,
  type BambaraTtsState,
} from "@/lib/tts";

/**
 * Bouton « Écouter » : lit la phrase bambara via le TTS en ligne quand elle
 * est disponible et configurée, sinon bascule sur la voix du navigateur.
 */
export function SpeakButton({
  text,
  phrase,
  className,
  label,
}: {
  /** Texte à lire (déjà traduit), utilisé en repli. */
  text: string;
  /** Phrase bambara validée (voir `bambara-phrases.ts`). */
  phrase?: BambaraPhraseKey;
  className?: string;
  /** Libellé affiché (par défaut : « Écouter »). */
  label?: string;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [ttsState, setTtsState] = useState<BambaraTtsState>(getBambaraTtsState);
  const bambara = phrase ? bambaraPhrase(phrase) : undefined;

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

  useEffect(() => subscribeBambaraTts(setTtsState), []);

  // Prépare l'audio dès l'affichage : au clic, la lecture démarre sans attente.
  useEffect(() => {
    if (enabled && bambara) void prefetchBambara(bambara);
  }, [enabled, bambara]);

  if (!enabled) return null;

  const busy = speaking || ttsState !== "idle";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label ?? t("voice.listen", "Écouter")}
      title={label ?? t("voice.listen", "Écouter")}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy) {
          stopBambara();
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        if (bambara) {
          const result = await speakBambara(bambara);
          if (result !== "unavailable") return;
        }
        speak(text, i18n.resolvedLanguage ?? "bm");
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}
