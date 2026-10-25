"use client";

/**
 * ConClave — envoltorio mínimo de «Variaciones públicas» (Ola 1019V ·
 * contrato architecture/variaciones-publicas.md §2). Envuelve cualquier
 * bloque y le pone `data-ss-elemento` con la clave canónica del TIPO de
 * elemento (`<familia>:<id>`); si la clave falta o su formato no pasa
 * `leerClave`, el bloque se pinta igual, sin atributo (degrada en
 * silencio, sin inventar claves).
 *
 * Las claves por familia: Ajustes → `claves-ajustes.ts`; Protomolécula →
 * `claves-protomolecula.ts`; la validación es siempre la de atributosClave.
 */
import React from "react";
import { atributosClave } from "@/lib/variaciones/claves-protomolecula";

export interface ConClaveProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Clave canónica del elemento; null/vacía ⇒ bloque sin atributo. */
  clave: string | null | undefined;
}

/**
 * Props puras de un bloque con clave: la función testable detrás de
 * `<ConClave>` (sin render, solo el objeto que se expande en el div).
 */
export function propsDeClave(
  clave: string | null | undefined,
  className?: string,
) {
  return { ...atributosClave(clave), ...(className ? { className } : {}) };
}

/**
 * `<ConClave clave="widget:clima">…</ConClave>` — el div final pinta lo
 * mismo que su hijo enviaría, con el atributo de clave encima para que el
 * anfitrión global del clic derecho encuentre el elemento más cercano.
 */
export function ConClave({ clave, className, children, ...rest }: ConClaveProps) {
  return (
    <div {...propsDeClave(clave, className)} {...rest}>
      {children}
    </div>
  );
}

export default ConClave;

