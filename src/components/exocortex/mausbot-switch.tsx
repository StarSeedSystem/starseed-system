"use client";

/** Exocórtex · interruptor del Mausbot (contrato `architecture/mausbot-astraura.md` §4):
 *  encendido/apagado, modo (cursor · acompañante · ambos), diseño de la personalidad
 *  activa y «Personalizar». Lee y guarda con `leerConfigMausbot`/`guardarConfigMausbot`
 *  y reacciona al evento `starseed:mausbot`. Defensivo: sin datos, inerte. */

import { useCallback, useEffect, useState } from "react";
import { MousePointer2, Palette, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAurora } from "@/components/aurora/aurora-provider";
import {
  EVENTO_MAUSBOT, leerConfigMausbot, guardarConfigMausbot, disenoParaPersonalidad,
  type ConfigMausbot, type ModoMausbot,
} from "@/lib/mausbot/config";
import { disenoPorId } from "@/lib/mausbot/disenos";

/** Ruta «Personalizar»: los ajustes viven en /cuenta (?section=…); el panel
 *  propio del Mausbot aún no tiene sección, así que enlazamos a Apariencia. */
const RUTA_PERSONALIZAR = "/cuenta?section=personalizacion";

const ETIQUETAS_MODO: Record<ModoMausbot, string> = {
  cursor: "Es el cursor",
  acompanante: "Acompaña al cursor",
  ambos: "Ambos",
};

/** Ciclo del modo: cursor → acompañante → ambos → cursor. */
export function siguienteModoMausbot(modo: ModoMausbot): ModoMausbot {
  if (modo === "cursor") return "acompanante";
  if (modo === "acompanante") return "ambos";
  return "cursor";
}

/** El componente. Enraizado en la pestaña de control del Exocórtex, debajo de
 *  «Aurora siempre encendida». */
export function MausbotSwitch({ className }: { className?: string }) {
  const aurora = useAurora();
  const [cfg, setCfg] = useState<ConfigMausbot | null>(null);

  useEffect(() => {
    const refrescar = () => setCfg(leerConfigMausbot());
    refrescar();
    window.addEventListener(EVENTO_MAUSBOT, refrescar);
    return () => window.removeEventListener(EVENTO_MAUSBOT, refrescar);
  }, []);

  const alternar = useCallback(() => {
    const guardado = guardarConfigMausbot({ encendido: !(cfg?.encendido ?? false) });
    if (guardado) setCfg(leerConfigMausbot());
  }, [cfg]);

  const cambiarModo = useCallback(() => {
    const guardado = guardarConfigMausbot({ modo: siguienteModoMausbot(cfg?.modo ?? "acompanante") });
    if (guardado) setCfg(leerConfigMausbot());
  }, [cfg]);

  if (!cfg) return null;

  const persona = aurora?.activePersonality as { id?: string; name?: string } | undefined;
  const personaId = persona?.id || "aurora";
  const personaNombre = persona?.name || "Aurora";
  const designo = disenoPorId(disenoParaPersonalidad(cfg, personaId));
  const encendido = cfg.encendido;

  return (
    <div className={cn("axo-card", className)} data-on={encendido ? "true" : "false"}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="axo-ico">
          <MousePointer2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90">Mausbot</span>
            <span className="axo-state idle">
              <span className="d" /> {ETIQUETAS_MODO[cfg.modo]}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">
            El cursor con cara de Astraura: actúa, acompaña y refleja lo que hace la IA.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={encendido}
          onClick={alternar}
          className="axc-switch mt-0.5"
          title={encendido ? "Apagar el Mausbot" : "Encender el Mausbot"}
        >
          <span className="knob" />
        </button>
      </div>

      {/* Encendido: modo, diseño de la personalidad activa y Personalizar */}
      {encendido && (
        <div className="border-t border-white/5 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
            <button
              type="button"
              onClick={cambiarModo}
              className="axo-state passive cursor-pointer"
              title="Cambiar el modo del Mausbot"
            >
              <SlidersHorizontal className="h-2.5 w-2.5" /> {ETIQUETAS_MODO[cfg.modo]}
            </button>
            <span className="inline-flex items-center gap-1.5">
              <Palette className="h-3 w-3 text-[#c4b5fd]" />
              <span className="font-medium text-white/75">{designo.nombre}</span>
              <span className="text-white/40">· {personaNombre}</span>
            </span>
            <a href={RUTA_PERSONALIZAR} className="axo-link ml-auto">Personalizar</a>
          </div>
        </div>
      )}
    </div>
  );
}

