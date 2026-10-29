"use client";

/**
 * ConClave · envoltorio mínimo para poner la clave de variaciones públicas en
 * el DOM (Ola 1019V, tarea W). Envuelve cualquier bloque del OS y aplica
 * `data-ss-elemento` con la clave canónica `data-ss-elemento` (contrato §2):
 * con la clave válida el bloque queda localizable por el clic derecho global;
 * sin clave o con clave mal formada, se pinta igual pero sin atributo.
 *
 * No añade comportamientos: ni clic, ni foco, ni cursor — solo la marca que el
 * anfitrión de variaciones lee. La parte opcional de la clave (`#<parte>`)
 * llega ya dentro del string.
 *
 * Contrato: architecture/variaciones-publicas.md §2.
 */
import type { HTMLAttributes } from "react";
import { atributosClave } from "@/lib/variaciones/claves-protomolecula";

/** Etiquetas de envoltorio admitidas: todos contenedores de flujo del DOM. */
export type EtiquetaConClave = "div" | "span" | "section" | "article" | "li";

/** Props de ConClave: la clave a marcar y las props corrientes del envoltorio. */
export interface ConClaveProps extends HTMLAttributes<HTMLElement> {
  clave: string | null | undefined;
  como?: EtiquetaConClave;
}

/** Envuelve un bloque y le pone `data-ss-elemento` cuando la clave es válida. */
export function ConClave({ clave, como = "div", className, children, ...resto }: ConClaveProps) {
  // La unión de etiquetas es segura: todas aceptan HTMLAttributes en JSX.
  const Etiqueta = como as "div";
  return (
    <Etiqueta className={className} {...atributosClave(clave)} {...resto}>
      {children}
    </Etiqueta>
  );
}

/** ConClave por defecto del módulo, para importar en una sola forma. */
export default ConClave;
