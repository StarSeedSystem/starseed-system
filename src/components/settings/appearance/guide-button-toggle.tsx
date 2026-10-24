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
import {
  Atom,
  Brain,
  GraduationCap,
  Landmark,
  Layers,
  LifeBuoy,
  Library,
  LogIn,
  Network,
  Palette,
  Play,
  ShieldCheck,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { OPEN_GUIDE_EVENT } from "@/components/onboarding/aurora-guide";
import { abrirGuia } from "@/lib/onboarding/guia-acceso";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { abrirPrimerArranque } from "@/lib/onboarding/primer-arranque";
import {
  getGuideButtonVisible,
  setGuideButtonVisible,
  subscribeGuideButtonVisible,
} from "@/lib/onboarding/guide-visibility";

/** (GUI1021O) Icono de cada tema de la guía, por clave. Fallback: Sparkles. */
const ICONO_POR_TEMA: Record<string, LucideIcon> = {
  "protomolecula": Atom,
  "malla": Network,
  "capas-conciencia": Layers,
  "neuronas-cerebro": Brain,
  "pilar-politica": Landmark,
  "pilar-educacion": GraduationCap,
  "pilar-cultura": Palette,
  "libreria-biblioteca": Library,
  "genesis": Wand2,
  "personalizacion-segura": ShieldCheck,
};

const BOTON_TEMA =
  "inline-flex min-h-[44px] w-full cursor-pointer select-none items-center gap-2.5 rounded-xl " +
  "border border-white/10 bg-white/[0.02] px-3 text-left text-xs font-medium text-foreground " +
  "outline-none transition-colors duration-200 motion-safe:hover:border-white/20 " +
  "focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "motion-reduce:transition-none";

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
        className="h-8 gap-1.5 text-xs"
        onClick={() => {
          const w = window as unknown as { openStarseedGuide?: () => void };
          if (typeof w.openStarseedGuide === "function") w.openStarseedGuide();
          else window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
        }}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Ver la guía de introducción
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
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
        className="h-8 gap-1.5 text-xs"
        onClick={() => abrirPrimerArranque()}
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden />
        Primer arranque: acceso y ajustes de esta neurona
      </Button>
    </div>
    {/* (GUI1021O, §5) Los diez temas de la guía: cada uno la abre por ese tema,
        por la puerta común, desde «ajustes». */}
    <ul
      aria-label="Empezar la guía de introducción por un tema"
      className="mt-2 grid list-none gap-1 sm:grid-cols-2"
    >
      {TODOS_LOS_TEMAS.map((tema) => {
        const Icono = ICONO_POR_TEMA[tema.key] ?? Sparkles;
        return (
          <li key={tema.key}>
            <button
              type="button"
              className={BOTON_TEMA}
              onClick={() => abrirGuia({ desde: "ajustes", temaInicial: tema.key })}
            >
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground"
              >
                <Icono className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 truncate">{tema.titulo}</span>
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}

export default GuideButtonToggle;
