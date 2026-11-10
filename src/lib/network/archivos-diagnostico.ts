/**
 * archivos-diagnostico — los hitos de una transferencia de archivo, en el mismo registro que los enlaces (ARC1110A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Cada hito sale como un evento «archivo» del Registro del enlace (`registro-enlace-ble.ts`), que la app nativa copia a
 * `~/Library/Logs/app.starseed.os/enlaces.log` (y el espejo de la tablet, con el prefijo `(Maggaboard)`). Se lee con
 *   grep ' archivo ' ~/Library/Logs/app.starseed.os/enlaces.log
 * Líneas (el id es el de la transferencia; NUNCA se anota el nombre ni el contenido, solo ids, tamaños y tiempos):
 *   archivo <id> anuncio-enviado | anuncio-recibido | preaceptado | preparado ms=… | oferta-enviada | oferta-recibida
 *   archivo <id> aceptado | primer-trozo | progreso 25|50|75 | completo kbps=… vias=… | verificado | fallo motivo=…
 * Nunca lanza.
 */

export type HitoArchivo =
  | "anuncio-enviado"
  | "anuncio-recibido"
  | "preaceptado"
  | "preparado"
  | "oferta-enviada"
  | "oferta-recibida"
  | "aceptado"
  | "primer-trozo"
  | "progreso"
  | "completo"
  | "verificado"
  | "fallo";

export type SumideroArchivo = (linea: { hito: HitoArchivo; id: string; neurona: string | null; detalle: string }) => void;

let sumidero: SumideroArchivo | null = null;

/** Pruebas (o un panel): recibe cada hito además del registro. */
export function fijarSumideroArchivo(f: SumideroArchivo | null): void {
  sumidero = f;
}

/** Texto de una línea de detalle sin saltos ni controles, acotado. Puro. */
export function limpiarDetalleArchivo(detalle: string): string {
  return String(detalle ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 160);
}

export function anotarArchivo(hito: HitoArchivo, id: string, detalle = "", neurona: string | null = null): void {
  const limpio = limpiarDetalleArchivo(detalle);
  const idLimpio = String(id ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64);
  try {
    sumidero?.({ hito, id: idLimpio, neurona, detalle: limpio });
  } catch {
    /* el sumidero de prueba no tumba la transferencia */
  }
  if (typeof window === "undefined") return;
  void import("@/lib/malla/bluetooth-directo-motor")
    .then((m) => {
      const red = m.bluetoothDirectoActivo();
      if (!red) return;
      red.registro().anotar("archivo", neurona, `${idLimpio} ${hito}${limpio ? ` ${limpio}` : ""}`, neurona ? red.enlaceHacia(neurona) : null);
    })
    .catch(() => undefined);
}
