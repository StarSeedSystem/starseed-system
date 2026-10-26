"use client";

/**
 * El botón «Soñar juntos» de la cabecera del mundo (Ola 1025U · U4). Abre y cierra el panel de sueños. Mientras un
 * sueño corre, lo dice (con `role=status`) para que quien no mira el panel sepa que hay agentes soñando.
 */
import { Moon } from "lucide-react";

export interface BotonSonarProps {
  abierto: boolean;
  alAlternar: () => void;
  /** Hay un sueño corriendo ahora. */
  sonando: boolean;
  /** Nadie vive en este escenario: el botón sigue ahí y el panel explica por qué no hay a quién elegir. */
  deshabilitado?: boolean;
}

export function BotonSonar({ abierto, alAlternar, sonando, deshabilitado = false }: BotonSonarProps) {
  return (
    <button
      type="button"
      onClick={alAlternar}
      disabled={deshabilitado}
      aria-pressed={abierto}
      data-testid="boton-sonar"
      className={
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 font-headline text-sm font-semibold tracking-wide text-white transition duration-150 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF] disabled:cursor-not-allowed disabled:opacity-50 " +
        (abierto ? "border-[#007FFF]/70 bg-[#007FFF]/25" : "border-white/15 bg-white/8 hover:bg-white/15")
      }
    >
      <Moon className={"size-4 shrink-0 " + (sonando ? "text-[#39FF14] motion-safe:animate-pulse" : "text-sky-200")} aria-hidden="true" />
      <span>Soñar juntos</span>
      {sonando && (
        <span className="rounded-full border border-[#39FF14]/45 bg-[#39FF14]/10 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#c9ffbd]" role="status">
          Soñando
        </span>
      )}
    </button>
  );
}
