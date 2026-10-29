"use client";

/**
 * Variaciones públicas · envoltorio con clave canónica (Ola 1019V · tarea W).
 * `<ConClave clave="ajuste:tema-apariencia">…</ConClave>` pone
 * `data-ss-elemento` en el DOM para que el anfitrión del clic derecho
 * reconozca el bloque y ofrezca «Variaciones públicas». La clave nombra el
 * TIPO de elemento, nunca la instancia ni datos privados.
 *
 * Componente liviano: sin estado, sin efectos, sin red; la validación la
 * hace `leerClave` (una clave mal formada no escribe atributo y degrada en
 * silencio). Contrato: architecture/variaciones-publicas.md §2.
 */
import type { ElementType, ReactNode } from "react";
import { leerClave } from "@/lib/variaciones/clave-elemento";

export interface ConClaveProps {
  /** Clave canónica `<familia>:<id>[#<parte>]`; vacía o inválida → sin atributo. */
  clave: string | null | undefined;
  /** Etiqueta del bloque; «div» por defecto. */
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

export function ConClave({ clave, as: bloque = "div", className, children }: ConClaveProps) {
  // Solo una clave canónica llega al DOM: `ajuste:tema-apariencia` sí;
  // `widgetclima` o `widget:cl ima`, no.
  const atributos: Record<string, string> =
    clave && leerClave(clave) ? { "data-ss-elemento": clave } : {};
  // Casteo estrecho: ElementType suelta errores de `never` al repartir props;
  // como etiqueta dinámica solo pasan atributos de datos y clase.
  const Etiqueta = bloque as "div";
  return (
    <Etiqueta {...atributos} className={className}>
      {children}
    </Etiqueta>
  );
}
