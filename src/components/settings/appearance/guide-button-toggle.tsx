"use client";

/**
 * StarSeed OS — Interruptor "Botón de guía" (Ajustes → Personalización).
 * ============================================================================
 * Muestra u oculta el acceso flotante de la Guía (botón abajo-izquierda de
 * `AuroraGuide`, presente en todas las páginas). Activado por defecto. La
 * preferencia es LOCAL por dispositivo (misma familia que el avatar de Aurora)
 * y se aplica EN VIVO: `AuroraGuide` se resuscribe y aparece/desaparece sin
 * recargar. El tour por primera visita y `window.openStarseedGuide()` siguen
 * disponibles aunque el botón esté oculto.
 */

import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getGuideButtonVisible,
  setGuideButtonVisible,
  subscribeGuideButtonVisible,
} from "@/lib/onboarding/guide-visibility";

export function GuideButtonToggle() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(getGuideButtonVisible());
    return subscribeGuideButtonVisible(() => setVisible(getGuideButtonVisible()));
  }, []);

  const onToggle = (next: boolean) => {
    setVisible(next);
    setGuideButtonVisible(next);
  };

  return (
    <label
      htmlFor="guide-button-toggle"
      className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/20"
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#9FE870]/30 bg-[#9FE870]/10 text-[#9FE870]"
      >
        <LifeBuoy className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">Botón de guía</span>
        <span className="block text-xs leading-snug text-muted-foreground">
          Muestra el acceso flotante de la Guía (abajo a la izquierda) en todas las páginas. El
          recorrido sigue disponible por voz o desde Aurora aunque lo ocultes.
        </span>
      </span>
      <Switch
        id="guide-button-toggle"
        checked={visible}
        onCheckedChange={onToggle}
        aria-label="Mostrar el botón de guía flotante en todas las páginas"
      />
    </label>
  );
}

export default GuideButtonToggle;
