"use client";

/**
 * <ConClave clave> — envoltorio del clic derecho «Variaciones públicas»
 * (contrato: architecture/variaciones-publicas.md §2, tarea W Ola 1019V).
 * Pone `data-ss-elemento` en el bloque que envuelve con la clave canónica que
 * recibe, para que el anfitrión del clic derecho encuentre la clave más
 * cercana. La clave la genera el módulo puro `claves-ajustes.ts` (o
 * `claves-protomolecula.ts`); con clave ausente o mal formada el bloque se
 * pinta igual, solo sin atributo.
 */

import type { ReactNode } from "react";
import { atributosClave } from "@/lib/variaciones/claves-protomolecula";

export interface ConClaveProps {
  /** Clave canónica `<familia>:<id>[#<parte>]`; nula o inválida → sin atributo. */
  clave: string | null | undefined;
  /** Contenido del bloque: el ajuste, panel o control tal y como se pintaba. */
  children?: ReactNode;
  /** Clases extra: no toca el estilo del bloque envuelto si no se piden. */
  className?: string;
}

export function ConClave({ clave, children, className }: ConClaveProps) {
  return (
    <div {...atributosClave(clave)} className={className}>
      {children}
    </div>
  );
}

export default ConClave;
