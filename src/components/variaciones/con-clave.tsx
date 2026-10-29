"use client";

/**
 * `<ConClave clave="ajuste:tema-apariencia">…</ConClave>` envuelve cualquier
 * bloque de la interfaz y le pone `data-ss-elemento`, la marca común que el
 * anfitrión global del clic derecho usa para encontrar «la clave más cercana».
 *
 * No pinta nada propio: conserva la etiqueta, el `className` y el resto de
 * atributos que recibe, para que envolver no cambie el aspecto ni el layout de
 * lo que envuelve. Si la clave no es canónica se degrada en silencio (sin
 * atributo), igual que `atributosClave`, y nunca se inventa una clave.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import React from "react";
import { leerClave } from "@/lib/variaciones/clave-elemento";

/** Etiquetas de bloque admitidas; `div` es la de por defecto. */
export type EtiquetaConClave = "div" | "section" | "article" | "aside" | "li" | "span";

export interface ConClaveProps extends React.HTMLAttributes<HTMLElement> {
  /** Clave canónica `<familia>:<id>[#<parte>]` del TIPO de elemento. */
  clave?: string | null;
  /** Etiqueta HTML a usar; por defecto `div`. */
  etiqueta?: EtiquetaConClave;
  children?: React.ReactNode;
}

export function ConClave({
  clave,
  etiqueta = "div",
  children,
  ...resto
}: ConClaveProps) {
  const valida = typeof clave === "string" ? leerClave(clave) : null;
  const atributos: React.HTMLAttributes<HTMLElement> & { "data-ss-elemento"?: string } = {
    ...resto,
  };
  if (valida) atributos["data-ss-elemento"] = valida;
  return React.createElement(etiqueta, atributos, children);
}
