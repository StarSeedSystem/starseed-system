"use client";

/**
 * SELECTOR DE VOZ DE LA BIENVENIDA (Adenda 194).
 * ----------------------------------------------------------------------------
 * Antes solo había «voz» o «texto», y la voz que salía era la que el navegador
 * rankeara. Ahora se elige de verdad: femenina, masculina o neutra —las tres
 * afinadas para sonar bien sin tocar nada—, con dos accesos opcionales:
 *   · «Ajustes de voz»: abre la ventana de voz de la neurona (motor, idioma,
 *     timbre) para quien quiera afinar a mano.
 *   · «Voz autónoma»: la voz deja de ser un ajuste fijo y se modula sola según
 *     el carácter de cada personalidad y el momento del día.
 * La elección queda vinculada a la personalidad activa de Aurora y se puede
 * cambiar después desde su editor.
 */

import { useCallback, useEffect, useState } from "react";
import { Mic, Volume2, Sliders, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getModoVoz, setModoVoz, MODOS_VOZ, type ModoVoz } from "@/lib/aurora/voz-inicial";

const FRASE_PRUEBA =
  "Hola, soy Astraura. Así sueno en este dispositivo; puedes cambiarme cuando quieras.";

export function SelectorVozInicial({
  onElegir,
  className,
}: {
  /** Se llama al elegir una voz: el rito arranca el modo voz con ella. */
  onElegir: (modo: ModoVoz) => void | Promise<void>;
  className?: string;
}) {
  const [modo, setModo] = useState<ModoVoz>("femenina");
  const [probando, setProbando] = useState<ModoVoz | null>(null);

  useEffect(() => { setModo(getModoVoz()); }, []);

  const elegir = useCallback(async (m: ModoVoz) => {
    setProbando(m);
    setModo(m);
    try {
      await setModoVoz(m);
      await onElegir(m);
    } finally {
      setProbando(null);
    }
  }, [onElegir]);

  const abrirAjustes = useCallback(() => {
    try {
      // Ventana de voz de la neurona (motor, idioma, timbre): existe y se abre
      // a demanda; aquí es OPCIONAL, nunca aparece sola.
      window.dispatchEvent(new CustomEvent("starseed:voz-neurona-reopen", { detail: { reopen: true } }));
    } catch { /* si no está montada, los ajustes siguen en Ajustes → Voz */ }
  }, []);

  const principales = MODOS_VOZ.filter((m) => m.id !== "autonoma");
  const autonoma = MODOS_VOZ.find((m) => m.id === "autonoma")!;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="flex items-center justify-center gap-2 text-[12px] text-white/70">
        <Mic className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden /> Elige cómo quieres que suene
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {principales.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void elegir(m.id)}
            aria-pressed={modo === m.id}
            className={cn(
              "rounded-2xl border-2 p-3 text-left transition-all hover:scale-[1.02]",
              modo === m.id
                ? "border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_24px_rgba(217,70,239,0.2)]"
                : "border-white/10 bg-white/[0.02] hover:border-fuchsia-400/50",
            )}
          >
            <span className="mb-1 flex items-center gap-1.5 text-[13px] font-bold">
              {probando === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Volume2 className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />}
              {m.label}
            </span>
            <span className="block text-[11px] leading-snug text-white/55">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => void elegir("autonoma")}
          aria-pressed={modo === "autonoma"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] transition-colors",
            modo === "autonoma"
              ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
              : "border-white/12 bg-white/[0.03] text-white/70 hover:border-cyan-400/40",
          )}
          title={autonoma.desc}
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Voz autónoma
        </button>
        <button
          type="button"
          onClick={abrirAjustes}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/70 transition-colors hover:border-white/25"
        >
          <Sliders className="h-3.5 w-3.5" aria-hidden /> Ajustes de voz (opcional)
        </button>
      </div>

      <p className="text-center text-[10px] leading-snug text-white/40">
        {modo === "autonoma"
          ? "Cada personalidad y cada agente modularán su propia voz según su carácter y el momento."
          : "Queda vinculada a la personalidad de Astraura; puedes cambiarla o intercambiarla luego en su editor."}
      </p>
      <span className="sr-only">{FRASE_PRUEBA}</span>
    </div>
  );
}

export default SelectorVozInicial;
