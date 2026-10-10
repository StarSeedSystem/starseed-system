/**
 * iconos — UN icono 3D propio por TIPO de señal (2026-10-10).
 * ═══════════════════════════════════════════════════════════
 * Antes solo había una forma por familia de antena (esfera, diamante, gema…). Ahora cada tipo de
 * cosa que el mapa dibuja tiene su icono reconocible, y el icono sale SIEMPRE de un dato real de la
 * señal (la familia de antena, el tipo de aparato que declara su registro, el modo de enlace), nunca
 * de una suposición:
 *
 *   nodo-lora       antena de mástil con esfera       — nodo Meshtastic oído por el radio
 *   rele            diamante con anillo               — faro del relé cifrado (red sináptica)
 *   movil/tablet/portatil/escritorio/servidor         — aparato de tu cuenta según su tipo declarado
 *   aparato         gema                              — aparato de tu cuenta de tipo desconocido
 *   enlace-directo  dos anillos enlazados             — aparato emparejado SIN internet (código/QR)
 *   red-ip          disco con esfera                  — portadora IP (Wi-Fi, datos móviles, red)
 *   bluetooth       cubo con cubo inclinado           — dispositivo Bluetooth oído en el escaneo
 *   usb             cono con clavija                  — puerto serie/USB autorizado
 *
 * Puro: sin React, sin three, sin red, sin `node:*`. El dibujo está en `icono-3d.tsx` e `icono-2d.tsx`.
 */

import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { FormaMarcador } from "./mapa-3d";

export type IconoId =
  | "nodo-lora" | "rele" | "movil" | "tablet" | "portatil" | "escritorio" | "servidor" | "aparato"
  | "enlace-directo" | "red-ip" | "bluetooth" | "usb";

export const NOMBRE_ICONO: Record<IconoId, string> = {
  "nodo-lora": "Nodo LoRa",
  rele: "Faro del relé",
  movil: "Móvil",
  tablet: "Tablet",
  portatil: "Portátil",
  escritorio: "Equipo de escritorio",
  servidor: "Servidor",
  aparato: "Aparato de tu cuenta",
  "enlace-directo": "Enlace directo sin internet",
  "red-ip": "Red IP",
  bluetooth: "Bluetooth",
  usb: "Puerto serie / USB",
};

export const ORDEN_ICONOS: readonly IconoId[] = [
  "nodo-lora", "rele", "movil", "tablet", "portatil", "escritorio", "servidor", "aparato", "enlace-directo", "red-ip", "bluetooth", "usb",
];

const POR_TIPO_APARATO: Record<string, IconoId> = {
  mobile: "movil", tablet: "tablet", laptop: "portatil", desktop: "escritorio", server: "servidor",
};

/** El icono de una señal, según lo que ella misma declara. */
export function iconoDeSenal(s: Pick<DetectedSignal, "id" | "antenna" | "starseed">): IconoId {
  if (s.id.startsWith("local:") || s.starseed?.via === "direct-link") return "enlace-directo";
  switch (s.antenna) {
    case "lora": return "nodo-lora";
    case "relay": return "rele";
    case "ip": return "red-ip";
    case "ble": return "bluetooth";
    case "serial": return "usb";
    case "account": return POR_TIPO_APARATO[s.starseed?.deviceKind ?? ""] ?? "aparato";
    default: return "aparato";
  }
}

/** Icono que representa a cada familia de antena (chips de filtro). */
export const ICONO_DE_FAMILIA: Record<DetectedSignal["antenna"], IconoId> = {
  lora: "nodo-lora", relay: "rele", account: "aparato", ip: "red-ip", ble: "bluetooth", serial: "usb",
};

/** La forma sencilla de respaldo (lista, filtros y leyenda) que mejor evoca a cada icono. */
export const FORMA_DE_ICONO: Record<IconoId, FormaMarcador> = {
  "nodo-lora": "esfera",
  rele: "octaedro",
  movil: "icosaedro",
  tablet: "icosaedro",
  portatil: "icosaedro",
  escritorio: "icosaedro",
  servidor: "icosaedro",
  aparato: "icosaedro",
  "enlace-directo": "icosaedro",
  "red-ip": "cilindro",
  bluetooth: "caja",
  usb: "cono",
};

/** Qué iconos hay ahora en el mapa, en un orden fijo (para la leyenda). */
export function iconosPresentes(ids: Iterable<IconoId>): IconoId[] {
  const set = new Set(ids);
  return ORDEN_ICONOS.filter((i) => set.has(i));
}
