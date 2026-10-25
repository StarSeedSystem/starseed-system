/**
 * StarSeed OS — Puro · qué adjunto de un mensaje se convierte con Filee
 * ----------------------------------------------------------------------------
 * Del jsonb `attachments` de `astraura_messages` al `ArchivoConvertible` que
 * `useConversionMenu` necesita. Sin red, sin disco: entrada → salida.
 * Contrato: architecture/conversion-archivos.md.
 */

import { normalizeAttachments } from "@/lib/aurora/attachments";

/** Un adjunto del mensaje con URL real, listo para el menú de conversión. */
export interface AdjuntoConvertible {
  nombre: string;
  url: string;
  tipoMime?: string;
}

/** El primero de los adjuntos del mensaje que trae URL (subida o data URL). */
export function primerAdjuntoConvertible(
  adjuntos: unknown[] | null | undefined,
): AdjuntoConvertible | null {
  const a = normalizeAttachments(adjuntos).find((x) => !!x.url);
  if (!a?.url) return null;
  // `normalizeAttachments` ya da nombre («Adjunto») a lo que no lo trae;
  // el `??` es el diseño seguro del tipo (name es opcional en el contrato).
  return { nombre: a.name ?? "Adjunto", url: a.url, tipoMime: a.mime };
}
