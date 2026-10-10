/**
 * Lógica por capa: lo MÍNIMO que hay que hacer en cada aparato (contrato §3).
 * ═══════════════════════════════════════════════════════════════════════════
 * Una versión nueva no significa «reinstalar»: cada capa se aplica con el gesto más pequeño que
 * la hace efectiva. Este módulo dice qué gesto toca, si interrumpe a la persona y qué capas de un
 * manifiesto faltan en una neurona según las versiones que declara.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { CAPAS_ORDEN, compararVersiones, type CapaActualizacion, type ManifiestoVersion } from "./manifiesto";

export type GestoCapa =
  | "en-caliente" // se aplica sin recargar (datos)
  | "recarga-suave" // recarga cuando nadie escribe ni está en una llamada (interfaz)
  | "activar-sw" // skipWaiting del service worker + recarga suave (sw)
  | "reiniciar-servicio" // reinicio de ESE servicio, nada más (servicios)
  | "descarga-verificada" // descarga comprobando la huella y cambio en caliente (modelos)
  | "relanzar-app"; // actualizador nativo y relanzar (nativa)

export interface ComoSeAplica {
  gesto: GestoCapa;
  /** ¿La persona nota algo (recarga, reinicio, relanzar)? */
  interrumpe: boolean;
  reinstala: boolean;
  /** Puede descargar mucho: se mira la conexión antes. */
  pesada: boolean;
  texto: string;
}

export const COMO_SE_APLICA: Record<CapaActualizacion, ComoSeAplica> = {
  datos: { gesto: "en-caliente", interrumpe: false, reinstala: false, pesada: false, texto: "Se aplica en caliente, sin recargar." },
  interfaz: { gesto: "recarga-suave", interrumpe: true, reinstala: false, pesada: false, texto: "Recarga suave cuando no estás escribiendo, en una llamada ni en un directo." },
  sw: { gesto: "activar-sw", interrumpe: true, reinstala: false, pesada: false, texto: "Activa la copia sin conexión nueva y recarga suave." },
  servicios: { gesto: "reiniciar-servicio", interrumpe: false, reinstala: false, pesada: false, texto: "Reinicia solo ese servicio de la neurona." },
  modelos: { gesto: "descarga-verificada", interrumpe: false, reinstala: false, pesada: true, texto: "Descarga verificada por su huella y cambio en caliente." },
  nativa: { gesto: "relanzar-app", interrumpe: true, reinstala: true, pesada: true, texto: "Actualizador nativo y relanzar la app." },
};

export type VersionesPorCapa = Partial<Record<CapaActualizacion, string>>;

export interface CapaPendiente {
  capa: CapaActualizacion;
  /** Versión que declara la neurona (null = no lo sabe o no la tiene). */
  tiene: string | null;
  deberia: string;
  como: ComoSeAplica;
}

/**
 * Qué capas del manifiesto le faltan a una neurona, en orden de aplicación. Una capa cuya versión
 * la neurona no declara cuenta como pendiente (no se presume que esté al día).
 */
export function capasPendientes(m: Pick<ManifiestoVersion, "capas" | "version">, instaladas: VersionesPorCapa): CapaPendiente[] {
  const out: CapaPendiente[] = [];
  for (const capa of CAPAS_ORDEN) {
    if (!m.capas.includes(capa)) continue;
    const tiene = typeof instaladas[capa] === "string" && instaladas[capa] ? (instaladas[capa] as string) : null;
    if (tiene && compararVersiones(tiene, m.version) >= 0) continue;
    out.push({ capa, tiene, deberia: m.version, como: COMO_SE_APLICA[capa] });
  }
  return out;
}

/** Resumen honesto del coste de aplicar: lo que nota la persona, en una frase. */
export function resumenCoste(pendientes: readonly CapaPendiente[]): string {
  if (pendientes.length === 0) return "Al día: no hay nada que aplicar.";
  if (pendientes.some((p) => p.como.reinstala)) return "Hace falta relanzar la app (actualizador nativo).";
  if (pendientes.some((p) => p.como.interrumpe)) return "Una recarga suave cuando no estés escribiendo.";
  return "Se aplica sin interrumpirte.";
}

/** ¿Hay que esperar a una conexión sin límite antes de descargar? */
export function esPesada(pendientes: readonly CapaPendiente[]): boolean {
  return pendientes.some((p) => p.como.pesada);
}
