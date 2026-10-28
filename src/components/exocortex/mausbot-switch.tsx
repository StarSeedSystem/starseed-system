"use client";

/**
 * StarSeed OS — Exocórtex · interruptor del Mausbot de Astraura (MBT1027G)
 * -------------------------------------------------------------------------
 * Enciende y apaga el cursor-mascota, elige su modo (cursor · acompañante ·
 * ambos), anuncia el diseño de la personalidad activa y enlaza a los ajustes.
 * Contrato: `architecture/mausbot-astraura.md` §4. Persiste con `leerConfigMausbot`/
 * `guardarConfigMausbot` y reacciona a `starseed:mausbot`. Cliente puro (trampa 11).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONFIG_MAUSBOT_DEFECTO, EVENTO_MAUSBOT, disenoParaPersonalidad,
  guardarConfigMausbot, leerConfigMausbot, type ConfigMausbot, type ModoMausbot } from "@/lib/mausbot/config";
import { disenoPorId } from "@/lib/mausbot/disenos";
/** Dónde se personaliza: la sección «Personalización» de la cuenta (Apariencia). */
export const RUTA_AJUSTES_MAUSBOT = "/cuenta?section=personalizacion";

const ETIQUETAS_MODO: Record<ModoMausbot, string> = {
  cursor: "Cursor",
  acompanante: "Acompañante",
  ambos: "Ambos",
};

/** Etiqueta legible de un modo (pura, para la UI y las pruebas). */
export function etiquetaModoMausbot(modo: ModoMausbot): string {
  return ETIQUETAS_MODO[modo];
}

export interface MausbotSwitchProps {
  /** Id de la personalidad activa; decide qué diseño se anuncia. */
  personaId?: string;
  className?: string;
}

export function MausbotSwitch({ personaId, className }: MausbotSwitchProps) {
  const [config, setConfig] = useState<ConfigMausbot>(CONFIG_MAUSBOT_DEFECTO);

  useEffect(() => {
    const sincronizar = () => setConfig(leerConfigMausbot());
    sincronizar();
    window.addEventListener(EVENTO_MAUSBOT, sincronizar);
    return () => window.removeEventListener(EVENTO_MAUSBOT, sincronizar);
  }, []);

  const nombreDiseno = useMemo(
    () => disenoPorId(disenoParaPersonalidad(config, personaId ?? "aurora")).nombre,
    [config, personaId],
  );

  const alternar = useCallback(() => {
    guardarConfigMausbot({ encendido: !config.encendido });
    setConfig(leerConfigMausbot());
  }, [config.encendido]);

  const cambiarModo = useCallback((modo: ModoMausbot) => {
    guardarConfigMausbot({ modo });
    setConfig(leerConfigMausbot());
  }, []);

  const on = config.encendido;
  return (
    <div
      className={cn("rounded-[18px] border px-3.5 py-3 transition-colors", className,
        on ? "border-[#39FF14]/30 bg-[#39FF14]/[0.06]" : "border-white/10 bg-white/[0.03]")}
      data-on={on ? "true" : "false"}
    >
      <div className="flex items-start gap-3">
        <div className={cn("grid h-8 w-8 flex-none place-items-center rounded-[11px] border",
          on ? "border-[#39FF14]/30 bg-[#39FF14]/10 text-[#c9f9d3]" : "border-white/10 text-white/45")}>
          <MousePointer2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white/90">Mausbot</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]",
              on ? "border-[#39FF14]/30 bg-[#39FF14]/10 text-[#c9f9d3]" : "border-white/10 text-white/45")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-[#39FF14]" : "bg-white/30")} />
              {on ? "Encendido" : "Apagado"}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/50">
            Tu cursor con cara que mira, reacciona y acompaña lo que hace Astraura.
          </p>
        </div>
        <button role="switch" aria-checked={on} onClick={alternar}
          className="axc-switch mt-0.5" title={on ? "Apagar el Mausbot" : "Encender el Mausbot"}>
          <span className="knob" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2.5 border-t border-white/5 pt-2.5">
        <label className="flex items-center gap-1.5 text-[10.5px] text-white/55">
          <span className="uppercase tracking-wider text-white/40">Modo</span>
          <select aria-label="Modo del Mausbot" className="axc-select w-auto py-1 text-[11px]"
            value={config.modo} onChange={(e) => cambiarModo(e.target.value as ModoMausbot)}
            title="Cómo se muestra el Mausbot">
            <option value="cursor">{etiquetaModoMausbot("cursor")}</option>
            <option value="acompanante">{etiquetaModoMausbot("acompanante")}</option>
            <option value="ambos">{etiquetaModoMausbot("ambos")}</option>
          </select>
        </label>
        <span className="text-[10.5px] text-white/50">
          Diseño: <span className="font-medium text-[#c9f9d3]">{nombreDiseno}</span>
        </span>
        <a href={RUTA_AJUSTES_MAUSBOT}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[10.5px] text-[#7fb8ff] underline underline-offset-2 hover:text-[#bfe0ff]"
          title="Cambiar personalidad, diseño y nivel de actuación del Mausbot">
          Personalizar <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

export default MausbotSwitch;
