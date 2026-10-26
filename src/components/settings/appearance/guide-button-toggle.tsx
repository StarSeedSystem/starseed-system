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
 *
 * (Ola 1025U · GUIA1025U) «Reproducir guía del sistema» abre la guía COMPLETA (el catálogo único
 * `guia-completa.ts`: la misma que la introducción de la ventana de acceso), con o sin sesión; sin
 * `temaInicial` retoma por donde se quedó y «Empezar por…» salta directo a un capítulo. Se abre por la
 * puerta común (`abrirGuia`), sin importar el componente de la guía en este panel.
 */

import { useEffect, useState } from "react";
import { LifeBuoy, LogIn, Play, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { abrirGuia } from "@/lib/onboarding/guia-acceso";
import { CAPITULOS_GUIA, PASOS_GUIA, primerPasoDelCapitulo } from "@/lib/onboarding/guia-completa";
import { abrirPrimerArranque } from "@/lib/onboarding/primer-arranque";
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
    <>
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
    {/* Adenda 188: la guía ya no vive en un botón flotante permanente — se
        reproduce desde aquí cuando se quiera, igual que la bienvenida. */}
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        className="min-h-[44px] gap-1.5 text-xs cursor-pointer"
        onClick={() => abrirGuia({ desde: "ajustes" })}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Reproducir guía del sistema
      </Button>
      <label className="inline-flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground">
        <span>Empezar por…</span>
        <select
          aria-label="Abrir la guía del sistema desde un capítulo"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const capitulo = CAPITULOS_GUIA.find((c) => c.id === id);
            if (capitulo) abrirGuia({ desde: "ajustes", temaInicial: PASOS_GUIA[primerPasoDelCapitulo(capitulo.id)].id });
            e.target.value = "";
          }}
          className="min-h-[44px] cursor-pointer rounded-md border border-white/10 bg-background px-2 text-xs text-foreground"
        >
          <option value="">Elige un capítulo</option>
          {CAPITULOS_GUIA.map((c, n) => (
            <option key={c.id} value={c.id}>
              {n + 1}. {c.titulo}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        className="min-h-[44px] gap-1.5 text-xs cursor-pointer"
        onClick={() => window.dispatchEvent(new Event("starseed:open-onboarding"))}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Reproducir bienvenida
      </Button>
      {/* (2026-09-25) La ventana del primer arranque, a mano: sin sesión, la
          introducción con «Iniciar sesión o crear cuenta» (aunque se hubiera
          saltado con «Explorar sin cuenta»); con cuenta, los ajustes de esta neurona. */}
      <Button
        size="sm"
        variant="outline"
        className="min-h-[44px] gap-1.5 text-xs cursor-pointer"
        onClick={() => abrirPrimerArranque()}
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden />
        Primer arranque: acceso y ajustes de esta neurona
      </Button>
    </div>
    </>
  );
}

export default GuideButtonToggle;
