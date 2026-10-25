"use client";

/**
 * ConClave · envoltura genérica de «Variaciones públicas» (Ola 1019V, tarea W
 * del contrato architecture/variaciones-publicas.md §2).
 * ---------------------------------------------------------------------------
 * Envuelve CUALQUIER bloque del OS y le pone la clave canónica del elemento en
 * el atributo `data-ss-elemento`, para que el anfitrión global del clic derecho
 * la encuentre:
 *
 *   <ConClave clave="ajuste:tema-apariencia" className="…">
 *     …el contenido del bloque…
 *   </ConClave>
 *
 * La clave nombra el TIPO de elemento (todas las personas comparten
 * `ajuste:tema-apariencia`), nunca la instancia ni dato privado. Sale sin el
 * atributo (degrada en silencio) si la clave no llega o su formato no pasa
 * `leerClave`: el anfitrión no la verá, pero el bloque se muestra igual.
 *
 * Extrae los atributos de `atributosClave` (módulo puro probado en
 * src/lib/variaciones/__tests__/claves-protomolecula.test.ts) para que aquí
 * solo quede el cableado de React.
 */
import { createElement, type ElementType, type ReactNode } from "react";
import { atributosClave } from "@/lib/variaciones/claves-protomolecula";

export interface ConClaveProps {
  /** Clave canónica `<familia>:<id>`; si no valida, el bloque sale sin atributo. */
  clave: string | null | undefined;
  /** Etiqueta HTML del bloque envuelto (por defecto `<div>`). */
  elemento?: ElementType;
  className?: string;
  children?: ReactNode;
}

export function ConClave({
  clave,
  elemento = "div",
  className,
  children,
}: ConClaveProps) {
  return createElement(
    elemento,
    { className, ...atributosClave(clave) },
    children,
  );
}
