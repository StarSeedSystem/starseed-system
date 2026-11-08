/**
 * rele-bidireccional — relé de trozos sellados de DOS vías: ida y vuelta (PTA1108C · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.2.
 *
 * Antes el relé de StarSeed era de ida: el receptor contestaba (aceptar, reanudar, huecos) por las vías directas, así que no
 * servía cuando el destino solo se alcanzaba por relé. Ahora cada trozo que sale por un relé va envuelto con QUIÉN lo manda
 * (`fr` = identidad de relé de esta neurona, `fu` = su cuenta): el receptor arma un canal de vuelta hacia esa identidad por el
 * MISMO relé y se lo da al motor, que contesta ahí. Sirve igual para el relé de StarSeed y para el servidor propio.
 *
 * El envoltorio no añade secretos: el contenido sigue sellado de punta a punta. Un envoltorio ajeno o mal formado se ignora.
 * Un receptor antiguo (sin esto) recibe `t: "archivo.rele2"` y lo descarta sin romper nada: el emisor sigue contando con las vías
 * directas para la vuelta, como antes. Puro: el envío real se inyecta.
 */

import type { CanalArchivos } from "@/lib/network/archivos-malla";
import { crearCanalPorTexto } from "@/lib/malla/rele-archivo";

export const T_RELE_BIDIRECCIONAL = "archivo.rele2";
export const MAX_ENVOLTORIO = 160 * 1024;

export interface RemitenteRele {
  /** Identidad de relé de la neurona que manda (a ella se contesta). */
  rele: string;
  /** Cuenta de la neurona que manda (para el campo `to` del relé), si se conoce. */
  uid?: string;
}

export function envolverRele(p: string, de: RemitenteRele): string {
  return JSON.stringify({ t: T_RELE_BIDIRECCIONAL, fr: de.rele, ...(de.uid ? { fu: de.uid } : {}), p });
}

/** Lee un trozo envuelto (objeto ya parseado o texto). Null si no lo es o no cumple los límites. */
export function leerReleEnvuelto(x: unknown): { p: string; de: RemitenteRele } | null {
  let o: unknown = x;
  if (typeof x === "string") {
    if (!x.startsWith('{"t":"archivo.rele2"') || x.length > MAX_ENVOLTORIO) return null;
    try {
      o = JSON.parse(x);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (r.t !== T_RELE_BIDIRECCIONAL || typeof r.p !== "string" || typeof r.fr !== "string") return null;
  if (!r.fr || r.fr.length > 128 || r.p.length > MAX_ENVOLTORIO) return null;
  const uid = typeof r.fu === "string" && r.fu.length > 0 && r.fu.length <= 128 ? r.fu : undefined;
  return { p: r.p, de: { rele: r.fr, ...(uid ? { uid } : {}) } };
}

export interface OpcionesRetorno {
  /** Quién soy en este relé (null si aún no se sabe: entonces no se envuelve ni se contesta). */
  yo: () => Promise<RemitenteRele | null> | RemitenteRele | null;
  /** Manda el texto YA envuelto a `para` por el relé. */
  enviar: (para: RemitenteRele, textoEnvuelto: string) => Promise<boolean> | boolean;
  arriba?: () => boolean;
  /** Tope de canales de vuelta guardados (uno por emisor). */
  maxCanales?: number;
}

export interface RetornoRele {
  /** Canal de vuelta hacia ese emisor, por este relé. Siempre el mismo objeto para el mismo emisor (el motor guarda estado por canal). */
  canalDe(de: RemitenteRele): CanalArchivos;
  /** Envuelve un trozo de salida con mi identidad (si no la tengo, sale tal cual: relé de ida, como antes). */
  envolverIda(p: string): Promise<string>;
}

export function crearRetornoRele(o: OpcionesRetorno): RetornoRele {
  const canales = new Map<string, CanalArchivos>();
  const max = o.maxCanales ?? 64;
  return {
    canalDe(de) {
      const clave = `${de.rele}\u0000${de.uid ?? ""}`;
      const previo = canales.get(clave);
      if (previo) {
        // Se renueva su posición (el más reciente al final).
        canales.delete(clave);
        canales.set(clave, previo);
        return previo;
      }
      const canal = crearCanalPorTexto({
        enviarTexto: async (t) => {
          const yo = await o.yo();
          if (!yo) return false;
          return o.enviar(de, envolverRele(t, yo));
        },
        suscribir: () => () => undefined,
        ...(o.arriba ? { arriba: o.arriba } : {}),
      });
      canales.set(clave, canal);
      while (canales.size > max) canales.delete(canales.keys().next().value as string);
      return canal;
    },
    async envolverIda(p) {
      const yo = await o.yo();
      return yo ? envolverRele(p, yo) : p;
    },
  };
}
