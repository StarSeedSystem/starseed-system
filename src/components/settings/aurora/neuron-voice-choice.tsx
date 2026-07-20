"use client";

/**
 * NeuronVoiceChoice — tarjeta reutilizable «Voz de esta neurona» (Adenda 87 · Misión 3).
 * ---------------------------------------------------------------------------
 * Muestra y permite CAMBIAR la elección de voz POR DISPOSITIVO (nube gratis ↔
 * motor local), la misma que decide la ventana de bienvenida por neurona y que
 * ORDENA la cadena de voz de este equipo. No duplica lógica: reutiliza los
 * helpers de `voice-neuron-onboarding` (clave `starseed.voz.neurona.v2`) y el
 * `LocalEngineInstaller`.
 *
 * Se monta en tres superficies: la sección de NEURONAS, el panel de voz de la
 * cuenta (voice-oss-panel) y donde haga falta. SSR-safe, defensivo.
 */

import { useEffect, useState } from "react";
import { Cloud, Cpu, Network, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocalEngineInstaller } from "@/components/settings/aurora/local-engine-installer";
import {
  forceReopenNeuronVoiceWindow,
  probeLocalDaemon,
  readNeuronVoiceChoice,
  writeNeuronVoiceChoice,
  NEURON_VOICE_REOPEN_EVENT,
  type NeuronVoiceMode,
} from "@/components/aurora/voice-neuron-onboarding";

export interface NeuronVoiceChoiceProps {
  className?: string;
  /** Variante compacta (sin el instalador expandido por defecto). */
  compact?: boolean;
}

export function NeuronVoiceChoice({ className, compact = false }: NeuronVoiceChoiceProps) {
  const [mode, setMode] = useState<NeuronVoiceMode | null>(null);
  const [localVivo, setLocalVivo] = useState(false);
  const [showInstaller, setShowInstaller] = useState(false);

  // Lee la elección actual y sondea si el motor local vive (best-effort).
  useEffect(() => {
    let alive = true;
    const load = () => {
      const c = readNeuronVoiceChoice();
      if (alive) setMode(c && c.mode !== "later" ? c.mode : null);
    };
    load();
    void probeLocalDaemon().then((v) => {
      if (alive) setLocalVivo(v);
    });
    if (typeof window === "undefined") return () => { alive = false; };
    // Refresca cuando la elección cambia en otra superficie (evento silent/reopen).
    const onChange = () => load();
    window.addEventListener(NEURON_VOICE_REOPEN_EVENT, onChange as EventListener);
    return () => {
      alive = false;
      window.removeEventListener(NEURON_VOICE_REOPEN_EVENT, onChange as EventListener);
    };
  }, []);

  const pick = (m: NeuronVoiceMode) => {
    writeNeuronVoiceChoice(m);
    setMode(m);
    if (m === "local" && !localVivo) setShowInstaller(true);
  };

  const isCloud = mode === "cloud";
  const isLocal = mode === "local";

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-3 space-y-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Network className="h-4 w-4 text-emerald-300" />
        <span className="text-sm font-medium text-foreground/90">Voz de esta neurona</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          por dispositivo · ordena la cadena de voz
        </span>
        {localVivo && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
            <Zap className="h-3 w-3" /> Motor local vivo
          </span>
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {mode === null
          ? "Esta neurona aún no ha elegido cómo prefiere hablar. Elige la vía preferida (la otra queda siempre de respaldo)."
          : isLocal
            ? "Preferencia actual: motor LOCAL de este equipo (privado y sin internet). La nube gratis queda de respaldo."
            : "Preferencia actual: nube gratuita de Hugging Face (sin instalar nada). El motor local, si lo instalas, la adelanta."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => pick("cloud")}
          className={cn(
            "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
            isCloud
              ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-sky-400/30 hover:bg-sky-500/10",
          )}
          aria-pressed={isCloud}
        >
          <Cloud className="h-4 w-4 shrink-0 text-sky-300" />
          <span className="min-w-0">
            <span className="block text-xs font-medium">Nube gratis</span>
            <span className="block text-[10px] text-white/45">OpenVoice por Hugging Face</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => pick("local")}
          className={cn(
            "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
            isLocal
              ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
              : "border-white/10 bg-white/[0.03] text-white/70 hover:border-emerald-400/30 hover:bg-emerald-500/10",
          )}
          aria-pressed={isLocal}
        >
          <Cpu className="h-4 w-4 shrink-0 text-emerald-300" />
          <span className="min-w-0">
            <span className="block text-xs font-medium">Motor local</span>
            <span className="block text-[10px] text-white/45">privado, en este equipo</span>
          </span>
        </button>
      </div>

      {(showInstaller || (!compact && !localVivo)) && (
        <LocalEngineInstaller installed={localVivo} />
      )}

      <button
        type="button"
        onClick={() => forceReopenNeuronVoiceWindow()}
        className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/40 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        title="Volver a preguntar en una ventana (como la primera vez)"
      >
        <RotateCcw className="h-3 w-3" /> Volver a elegir en una ventana
      </button>
    </div>
  );
}

export default NeuronVoiceChoice;
