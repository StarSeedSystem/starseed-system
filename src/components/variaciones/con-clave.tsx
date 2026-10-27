"use client";

/**
 * Variaciones públicas · `<ConClave>`. Envuelve cualquier bloque del OS y le
 * pone la clave canónica en el DOM como `data-ss-elemento`, para que el
 * anfitrión del clic derecho la encuentre y ofrezca «Variaciones públicas».
 * Si la clave falla `leerClave` no pone ningún atributo: degrada en silencio.
 *
 * Uso: `<ConClave clave={claveDeAjuste("appearance", "tema-apariencia")}>…</ConClave>`.
 *
 * Contrato: architecture/variaciones-publicas.md §2 y §3.
 */
import type { ReactNode } from "react";
import { atributosClave } from "@/lib/variaciones/claves-protomolecula";

interface ConClaveProps {
  /** Clave canónica `<familia>:<id>[#<parte>]` (null → sin atributos). */
  clave: string | null | undefined;
  children: ReactNode;
  /** Etiqueta/píldora: clases extra para el contenedor. */
  className?: string;
}

export function ConClave({ clave, children, className }: ConClaveProps) {
  return (
    <div {...atributosClave(clave)} className={className}>
      {children}
    </div>
  );
}
