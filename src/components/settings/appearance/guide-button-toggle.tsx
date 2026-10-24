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
  HelpCircle,
  Landmark,
  Layers,
  Library,
  LifeBuoy,
  LogIn,
  Network,
  Palette,
  Play,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { abrirGuia, EVENTO_ABRIR_GUIA } from "@/lib/onboarding/guia-acceso";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { abrirPrimerArranque } from "@/lib/onboarding/primer-arranque";
import {
  getGuideButtonVisible,
  setGuideButtonVisible,
  subscribeGuideButtonVisible,
} from "@/lib/onboarding/guide-visibility";

/** Icono de cada tema; la clave es la del contrato de `architecture/guias-introduccion.md`. */
const ICONO_POR_TEMA: Readonly<Record<string, LucideIcon>> = {
  protomolecula: Atom,
  malla: Network,
  "capas-conciencia": Layers,
  "neuronas-cerebro": Brain,
  "pilar-politica": Landmark,
  "pilar-educacion": GraduationCap,
  "pilar-cultura": Palette,
  "libreria-biblioteca": Library,
  genesis: Sparkles,
  "personalizacion-segura": ShieldCheck,
};

/** Icono del tema, con `HelpCircle` de reserva para una clave que aún no tenga uno. */
export function iconoDeTema(tema: Pick<TemaGuia, "key">): LucideIcon {
  return ICONO_POR_TEMA[tema.key] ?? HelpCircle;
}

/** Los temas con su icono, en el mismo orden que el tour. */
export function temasConIcono(
  temas: readonly TemaGuia[] = TODOS_LOS_TEMAS,
): { tema: TemaGuia; Icono: LucideIcon }[] {
  return temas.map((tema) => ({ tema, Icono: iconoDeTema(tema) }));
}

/** La lista de los diez temas: cada uno abre la guía directamente en él. */
export function ListaTemasGuia() {
  return (
    <ul
      className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      aria-label="Temas de la guía de introducción"
    >
      {temasConIcono().map(({ tema, Icono }) => (
        <li key={tema.key}>
          <button
            type="button"
            onClick={() => abrirGuia({ desde: "ajustes", temaInicial: tema.key })}
            aria-label={`Abrir la guía en «${tema.titulo}»`}
            className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icono className="h-4 w-4 shrink-0 text-[#9FE870]" aria-hidden />
            <span className="min-w-0 truncate">{tema.titulo}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

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
          else window.dispatchEvent(new Event(EVENTO_ABRIR_GUIA));
        }}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        Reproducir guía del sistema
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
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-sm font-medium text-foreground">Ver la guía de introducción</p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
        Los diez temas del sistema y de la red: pulsa uno para abrir la guía directamente en él.
      </p>
      <ListaTemasGuia />
    </div>
    </>
  );
}

export default GuideButtonToggle;
