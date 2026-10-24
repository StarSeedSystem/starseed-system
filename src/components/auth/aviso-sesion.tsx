"use client";

/**
 * AvisoSesion — el aviso común de cada ventana que pide iniciar sesión (GUI1021L, Ola 1021G).
 * ═══════════════════════════════════════════════════════════════════════════
 * §5 de `architecture/guias-introduccion.md`: unas 30 ventanas decían «Inicia sesión para…» con su
 * propio texto suelto y sin acceso a la guía. Este componente es el único aviso: el texto de la
 * ventana, «Iniciar sesión» (lleva a `/bienvenida`, que muestra la pantalla de acceso) y «Conoce
 * StarSeed», que abre la guía de introducción por la puerta común (`abrirGuia({desde: "aviso"})`).
 *
 * Cristal de la marca (`glass-depth glass-edge`), versión `compacto` para dentro de tarjetas,
 * dianas de 44 px, cursor pointer, foco visible y nada se mueve con movimiento reducido.
 */

import { useId } from "react";
import Link from "next/link";
import { LogIn, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { abrirGuia } from "@/lib/onboarding/guia-acceso";

/** Adonde lleva «Iniciar sesión»: la bienvenida enseña el acceso a quien no tiene cuenta. */
export const RUTA_INICIAR_SESION = "/bienvenida";

export interface AvisoSesionProps {
  /** Lo que pide sesión, en una frase: «Inicia sesión para ver tus notificaciones». */
  texto: string;
  /** Una segunda línea opcional que explica por qué hace falta la cuenta. */
  detalle?: string;
  /** Versión en línea para dentro de tarjetas y paneles. */
  compacto?: boolean;
  className?: string;
}

const BOTON =
  "inline-flex min-h-[44px] cursor-pointer select-none items-center justify-center gap-2 rounded-full px-5 " +
  "text-sm font-semibold outline-none transition-[transform,background-color] duration-200 " +
  "focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 " +
  "motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.98] motion-reduce:transition-none";

export function AvisoSesion({ texto, detalle, compacto = false, className }: AvisoSesionProps) {
  const id = useId();
  const textoId = `${id}-texto`;
  const detalleId = `${id}-detalle`;

  return (
    <section
      role={compacto ? "note" : "region"}
      aria-labelledby={textoId}
      aria-describedby={detalle ? detalleId : undefined}
      data-testid="aviso-sesion"
      data-compacto={compacto ? "1" : undefined}
      className={cn(
        "glass-depth glass-edge border border-white/10 bg-background/40 text-foreground backdrop-blur-lg",
        compacto
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3"
          : "flex flex-col items-center gap-3 rounded-[24px] p-6 text-center",
        className,
      )}
    >
      {!compacto && <LogIn className="h-7 w-7 text-primary" aria-hidden="true" />}
      <div className={compacto ? "min-w-0 flex-1" : undefined}>
        <p id={textoId} className={compacto ? "text-sm font-medium" : "text-base font-semibold"}>
          {texto}
        </p>
        {detalle && (
          <p id={detalleId} className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {detalle}
          </p>
        )}
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", compacto ? "justify-start" : "justify-center")}>
        <Link href={RUTA_INICIAR_SESION} className={cn(BOTON, "bg-primary text-primary-foreground hover:bg-primary/90")}>
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Iniciar sesión
        </Link>
        <button
          type="button"
          onClick={() => abrirGuia({ desde: "aviso" })}
          className={cn(BOTON, "border border-white/15 bg-white/5 text-foreground hover:bg-white/10")}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Conoce StarSeed
        </button>
      </div>
    </section>
  );
}

export default AvisoSesion;
