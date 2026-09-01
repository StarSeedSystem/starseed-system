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
import { getModoVoz, setModoVoz, MODOS_VOZ, hayVozRealPara, generoEfectivo, type ModoVoz } from "@/lib/aurora/voz-inicial";

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
  // ¿El equipo tiene voz real del género elegido? Si no, se dice con honestidad.
  const [sinVozReal, setSinVozReal] = useState(false);

  useEffect(() => { setModo(getModoVoz()); }, []);

  const elegir = useCallback(async (m: ModoVoz) => {
    setProbando(m);
    setModo(m);
    try {
      await setModoVoz(m);
      try { setSinVozReal(!hayVozRealPara(generoEfectivo(m))); } catch { setSinVozReal(false); }
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
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
        El timbre de Astraura
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {principales.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => void elegir(m.id)}
            aria-pressed={modo === m.id}
            className={cn(
              "group rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
              "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
              modo === m.id
                ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]"
                : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40",
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              {probando === m.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-200" aria-hidden />
                : <Volume2 className={cn("h-3.5 w-3.5", modo === m.id ? "text-fuchsia-200" : "text-white/40")} aria-hidden />}
              {m.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/50">{m.desc}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => void elegir("autonoma")}
          aria-pressed={modo === "autonoma"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
            modo === "autonoma"
              ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
              : "border-white/12 bg-white/[0.03] text-white/65 hover:border-cyan-400/40 hover:text-white/85",
          )}
          title={autonoma.desc}
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> Voz autónoma
        </button>
        <button
          type="button"
          onClick={abrirAjustes}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/65 transition-colors hover:border-white/25 hover:text-white/85"
        >
          <Sliders className="h-3.5 w-3.5" aria-hidden /> Ajustes de voz (opcional)
        </button>
      </div>

      {sinVozReal && (
        <p className="rounded-lg border border-white/10 bg-black/20 p-2 text-center text-[10px] leading-snug text-white/55">
          Este equipo no tiene instalada una voz de sistema de ese género en español, así que ajusto el timbre de la
          mejor voz disponible — suena bien igualmente. Si quieres la voz nativa, se descarga en los ajustes de voz
          de tu sistema operativo.
        </p>
      )}
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
