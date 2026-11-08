/*
 * presencia-viva — ¿está abierta AHORA esta neurona, por dónde llega y qué versión y aparato es? La MISMA
 * verdad que dibuja el radar, para el chat de Mensajes › Neuronas y para Ajustes › Neuronas
 * (NEU1108A · 2026-11-08). Contrato: architecture/sincronizacion-neuronas.md §9.2.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11): en la Mac, el chat con «Maggaboard» decía «versión desconocida · no está abierta
 * ahora» mientras el radar la daba «en línea · 57 ms · sin internet» y los mensajes iban por el enlace
 * local. El chat solo miraba la presencia de la CUENTA (Supabase Realtime), que sin internet en la
 * tableta está vacía; el radar mira además el enlace directo sin internet, la malla P2P y el faro de la
 * red local. Aquí se juntan las cuatro fuentes, en este orden:
 *   1. enlace directo sin internet (emparejado o abierto por las dos apps nativas) → «vía red local»;
 *   2. malla P2P conectada por la misma red local → «vía red local»;
 *   3. faro de la app nativa oído en esta red (< 60 s) → «vía red local»;
 *   4. malla P2P conectada por internet o TURN → «vía malla P2P»;
 *   5. presencia de la cuenta → «vía internet».
 * La versión y el aparato salen de la presencia (`d`, `v.nativa`) y, si no los trae (sin internet, web
 * anterior), de lo que la neurona guardó en su fila (`capabilities.aparato`, NEU1108A).
 * Los ids absorbidos por una fusión cuentan como la neurona que se quedó (`vigente`).
 *
 * Puro: sin React, sin red. Nunca lanza.
 */

import type { PresenciaMedio } from "./presencia";
import { mejorMedio, sanearInfoPublica, type InfoPublicaNeurona } from "./info-publica";
import { leerAparato } from "./aparato-registro";

export type ViaViva = "red-local" | "malla" | "cuenta";

/** Lo mínimo de `FotoEnlaceLocal` (lib/malla/registro-enlaces-locales.ts). */
export interface EnlaceLocalMin {
  neuronDeviceId?: string;
  syncDeviceId?: string;
  rttMs: number | null;
}

/** Lo mínimo de `DispositivoMallaRow` (lib/network/malla-neuronas.ts). */
export interface FilaMallaMin {
  neuronId: string;
  syncDeviceId?: string;
  enlace: { estado: string; latenciaMs?: number; ruta?: { clase?: string | null; rttMs?: number | null } | null };
}

/** Lo mínimo de `VecinoRedLocal` y `VinculoNeurona` (lib/malla/sincronizacion-neuronas.ts). */
export interface VecinoMin {
  neurona: string | null;
  ip: string;
  visto_hace_s: number;
}
export interface VinculoMin {
  neurona: string;
  sync?: string;
  ultimaIp?: string;
}

export interface FuentesPresenciaViva {
  /** Presencia de la cuenta (`usePresenciaNeuronas().medios`). */
  medios: readonly PresenciaMedio[];
  /** Enlaces directos sin internet vivos. */
  locales?: readonly EnlaceLocalMin[];
  /** Filas de la malla de neuronas (enlace P2P). */
  malla?: readonly FilaMallaMin[];
  /** Lo que la app nativa oye por faro en esta red, y los vínculos recordados. */
  vecinos?: readonly VecinoMin[];
  vinculos?: readonly VinculoMin[];
  /** La fila guardada de esa neurona (`capabilities`): su `syncDeviceId` y su `aparato`. */
  capacidades?: Record<string, unknown> | null;
  /** Alias de fusión: absorbida → la que se queda. */
  vigente?: (id: string) => string;
}

export interface PresenciaViva {
  enLinea: boolean;
  via: ViaViva | null;
  rttMs: number | null;
  /** El medio que mejor la describe en la presencia de la cuenta (si está ahí). */
  medio: PresenciaMedio | null;
  info: InfoPublicaNeurona | null;
  /** Versión del binario nativo (semver) si se sabe. */
  version: string | null;
  /** De dónde salen `info` y `version`. */
  fuenteInfo: "presencia" | "registro" | null;
  /** Plataforma, para las neuronas que no dicen más. */
  plataforma: string | null;
}

/** Un faro de la red local vale como «abierta» si se oyó hace menos de esto. */
export const FARO_LOCAL_VIGENTE_S = 60;

export const TEXTO_VIA: Record<ViaViva, string> = {
  "red-local": "vía red local",
  malla: "vía malla P2P",
  cuenta: "vía internet",
};

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

/** Une las fuentes para UNA neurona. Pura. Nunca lanza. */
export function presenciaViva(neuronaId: string, f: FuentesPresenciaViva): PresenciaViva {
  const vacia: PresenciaViva = { enLinea: false, via: null, rttMs: null, medio: null, info: null, version: null, fuenteInfo: null, plataforma: null };
  try {
    if (!neuronaId) return vacia;
    const vig = (id: string | null | undefined): string => {
      if (!id) return "";
      try {
        return f.vigente ? f.vigente(id) || id : id;
      } catch {
        return id;
      }
    };
    const n = vig(neuronaId);
    const caps = f.capacidades && typeof f.capacidades === "object" ? f.capacidades : null;
    const medios = (f.medios ?? []).filter((m) => m && vig(m.n) === n);
    const filasMalla = (f.malla ?? []).filter((r) => r && vig(r.neuronId) === n);
    const vinculos = (f.vinculos ?? []).filter((v) => v && vig(v.neurona) === n);
    const sync = new Set<string>(
      [typeof caps?.syncDeviceId === "string" ? caps.syncDeviceId : "", ...medios.map((m) => m.sid ?? ""), ...filasMalla.map((r) => r.syncDeviceId ?? ""), ...vinculos.map((v) => v.sync ?? "")].filter(Boolean),
    );

    let via: ViaViva | null = null;
    let rttMs: number | null = null;
    const local = (f.locales ?? []).find((l) => l && ((l.neuronDeviceId && vig(l.neuronDeviceId) === n) || (l.syncDeviceId && sync.has(l.syncDeviceId))));
    const conectada = filasMalla.find((r) => r.enlace?.estado === "conectado") ?? null;
    const rttMalla = conectada ? num(conectada.enlace.latenciaMs) ?? num(conectada.enlace.ruta?.rttMs) : null;
    const faro = (f.vecinos ?? []).find(
      (v) => v && v.visto_hace_s <= FARO_LOCAL_VIGENTE_S && ((v.neurona && vig(v.neurona) === n) || (!v.neurona && vinculos.some((x) => x.ultimaIp === v.ip))),
    );
    if (local) {
      via = "red-local";
      rttMs = num(local.rttMs);
    } else if (conectada && conectada.enlace.ruta?.clase === "misma-red-local") {
      via = "red-local";
      rttMs = rttMalla;
    } else if (faro) {
      via = "red-local";
    } else if (conectada) {
      via = "malla";
      rttMs = rttMalla;
    } else if (medios.length) {
      via = "cuenta";
    }

    // Versión y aparato: la presencia manda; si no los trae, lo que la neurona guardó en su fila.
    const mejor = mejorMedio(medios);
    let info = sanearInfoPublica(mejor?.d);
    let version = mejor?.v?.nativa ?? null;
    let fuenteInfo: PresenciaViva["fuenteInfo"] = info || version ? "presencia" : null;
    const ap = leerAparato(caps);
    if (!info && ap) {
      const medio = ap.medio ?? ap.ultimoMedio;
      info = medio ? sanearInfoPublica({ medio, app: ap.app, so: ap.so, soV: ap.soV, arq: ap.arq, equipo: ap.equipo }) : null;
      if (info) fuenteInfo = "registro";
    }
    if (!version && ap?.version) {
      version = ap.version;
      fuenteInfo = fuenteInfo ?? "registro";
    }
    const plataforma = mejor?.plataforma ?? (typeof caps?.platform === "string" && caps.platform ? caps.platform : null);
    return { enLinea: via !== null, via, rttMs, medio: mejor, info, version, fuenteInfo, plataforma };
  } catch {
    return vacia;
  }
}

/** «en línea · vía red local · 57 ms» o «no está abierta ahora». Pura. */
export function textoEstadoVivo(p: Pick<PresenciaViva, "enLinea" | "via" | "rttMs">): string {
  if (!p.enLinea || !p.via) return "no está abierta ahora";
  const rtt = p.rttMs !== null && Number.isFinite(p.rttMs) ? ` · ${Math.round(p.rttMs)} ms` : "";
  return `en línea · ${TEXTO_VIA[p.via]}${rtt}`;
}
