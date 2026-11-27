// Notificación de un encuentro NFC/BLE/QR con los mismos botones que la hoja «Cerca de ti»
// (contrato: architecture/nfc-neuronas.md §4 y §6). Módulo puro: sin red, disco ni Node. Funciona sin conexión.

import type { DecisionEncuentro } from "@/lib/nfc/decidir";
import { botonesDe, textoNotificacion } from "@/lib/nfc/encuentros";
import type { ViaAcercar } from "@/lib/nfc/respaldo";

export interface AccionNotificacion {
  label: string;
  href: string;
}

export interface NotificacionEncuentro {
  appId: "nfc";
  title: string;
  body: string;
  icon: "Nfc";
  dedupeKey: string;
  actions: AccionNotificacion[];
}

/** Enlace que abre Señales › Cercanía con el encuentro y el botón elegido (la hoja ejecuta la acción). */
export function enlaceBoton(encuentroId: string, boton: string): string {
  const q = new URLSearchParams({ vista: "cercania", encuentro: encuentroId, accion: boton });
  return `/senales?${q.toString()}`;
}

/** Notificación con un botón por cada opción de la hoja; `null` si el encuentro no debe avisar (ignorado o silenciado). */
export function notificacionDeEncuentro(
  d: DecisionEncuentro,
  via: ViaAcercar,
  encuentroId: string,
): NotificacionEncuentro | null {
  const txt = textoNotificacion(d, via);
  if (!txt) return null;
  return {
    appId: "nfc",
    title: txt.titulo,
    body: txt.cuerpo,
    icon: "Nfc",
    dedupeKey: encuentroId,
    actions: botonesDe(d).map((b) => ({ label: b.etiqueta, href: enlaceBoton(encuentroId, b.id) })),
  };
}
