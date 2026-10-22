/**
 * Titanio portátil (contrato §8.1): routers de viaje y MiFi como titanio móvil
 * de la malla. Tipos, coordinación según batería, amortiguación en movimiento y
 * compatibilidad honesta (sin flashear / bloqueado por operador / tabla OpenWrt).
 * Módulo puro: sin red, sin disco, sin `node:*`.
 */

import {
  compatibilidad,
  type EntradaTabla,
  type ModeloRouter,
  type ResultadoCompatibilidad,
} from "./compatibilidad-openwrt";
import { teselaDeRouter } from "../../malla/cristal/titanio";
import {
  TIPOS_PUERTA,
  elegirPuerta,
  puedeUsar,
  puertaParaTesela,
  restanteParaOtrosMb,
  type Compartir,
  type PuertaInternet,
  type Solicitante,
  type TipoPuerta,
} from "../../malla/cristal/puertas-internet";
import type { ClaseDato } from "../../malla/cristal/tipos";

export const TIPOS_PORTATIL = [
  "viaje-openwrt",
  "viaje-otro",
  "mifi-operador",
] as const;

export type TipoPortatil = (typeof TIPOS_PORTATIL)[number];

export interface RouterPortatil {
  id: string;
  tipo: TipoPortatil;
  /** Porcentaje de batería (0–100); null si no se conoce. */
  bateriaPct: number | null;
  cargando: boolean;
  moviendose?: boolean;
  modem?: { generacion: "4g" | "5g"; conSim: boolean } | null;
}

/**
 * Coordinación del titanio portátil (§8.1): 6 con corriente, batería
 * desconocida o ≥ 50 %; 4 entre 20 y 50 %; 3 por debajo del 20 %.
 */
export function coordinacionPortatil(r: RouterPortatil): number {
  if (r.cargando || r.bateriaPct === null) return 6;
  if (r.bateriaPct >= 50) return 6;
  if (r.bateriaPct >= 20) return 4;
  return 3;
}

/**
 * Factor de amortiguación (§8.1): un titanio fija la red quieto y no la arrastra
 * en movimiento. 0.6 × (1 − volatilidad propia acotada a 0–1) × (0.5 si se mueve),
 * acotado a 0–0.6.
 */
export function factorAmortiguacion(
  r: RouterPortatil,
  volatilidadPropia: number,
): number {
  const v = Math.min(1, Math.max(0, volatilidadPropia));
  let factor = 0.6 * (1 - v);
  if (r.moviendose === true) factor *= 0.5;
  return Math.min(0.6, Math.max(0, factor));
}

/** Estado especial de los de viaje con OpenWrt de fábrica, fuera de ResultadoCompatibilidad. */
export type ResultadoPortatil = Omit<ResultadoCompatibilidad, "estado"> & {
  estado: ResultadoCompatibilidad["estado"] | "soportado-sin-flashear";
};

/**
 * Compatibilidad honesta de un router portátil (§8.1):
 * - viaje-openwrt: ya trae base OpenWrt; se adopta sin flashear.
 * - mifi-operador sin entrada soportada: bloqueado-operador con la alternativa
 *   de hacer entrar su internet por un titanio compatible (Wi‑Fi cliente o USB).
 * - lo demás delega en la tabla de OpenWrt (`compatibilidad` de §8).
 */
export function compatibilidadPortatil(
  m: ModeloRouter & { tipo: TipoPortatil },
  tabla: EntradaTabla[],
): ResultadoPortatil {
  if (m.tipo === "viaje-openwrt") {
    return {
      estado: "soportado-sin-flashear",
      enlace: null,
      pasos: [
        "Activa SSH o el acceso avanzado en el panel del router",
        "Copia el guion de la malla que genera StarSeed",
        "Pulsa «Adoptar» desde StarSeed para incorporarlo como titanio",
      ],
      aviso: "No hace falta flashear: ya trae un sistema basado en OpenWrt.",
    };
  }

  if (m.tipo === "mifi-operador") {
    const resultado = compatibilidad(m, tabla);
    if (resultado.estado !== "soportado") {
      return {
        estado: "bloqueado-operador",
        enlace: null,
        pasos: [
          "Este MiFi no se formatea, pero su internet entra en la malla a través " +
            "de un titanio compatible, por Wi‑Fi (modo cliente) o por USB",
          "Declara su internet como «PuertaInternet» en la tesela de ese titanio",
        ],
        aviso: resultado.aviso,
      };
    }
    return resultado;
  }

  return compatibilidad(m, tabla);
}

/** Explica honestamente que sin SIM el portátil es un titanio como otro cualquiera. */
export function resumenSinSim(r: RouterPortatil): string {
  const base =
    "Sin SIM este portátil es un titanio igual: la malla (802.11s + batman-adv) " +
    "va por las radios Wi‑Fi y el módem puede quedarse apagado.";
  return r.modem?.conSim === true
    ? `${base} Su SIM queda disponible solo como puerta a internet opcional.`
    : base;
}

/** Tipo de puerta que aporta el módem del portátil (§8.1): 5g → móvil-5g, 4g → móvil-4g, siempre
 * contra la única lista del contrato (`TIPOS_PUERTA`); sin SIM no hay puerta. */
export function tipoPuertaDeModem(r: RouterPortatil): TipoPuerta | null {
  if (!r.modem?.conSim) return null;
  const tipo: TipoPuerta = r.modem.generacion === "5g" ? "movil-5g" : "movil-4g";
  return (TIPOS_PUERTA as readonly string[]).includes(tipo) ? tipo : null;
}

/** Declaración de la puerta de internet de este titanio (§8.1), lista para viajar EN SU TESELA:
 * nace de lo medido del módem y de cómo se comparte; los números de la SIM (ICCID, IMSI, PIN y
 * teléfono) llegan por `sim` y SIEMPRE pasan por la lista blanca — jamás salen de la declaracion. */
export function puertaDesdeSim(e: {
  id: string;
  neurona: string;
  cuenta: string;
  generacion: "4g" | "5g";
  bajadaKbps: number;
  subidaKbps: number;
  latenciaMs: number;
  topeMensualMb?: number;
  usadoMesMb?: number;
  reservaDuenoPct?: number;
  compartir: Compartir;
  grupos?: string[];
  /** Lo de la SIM: queda aquí dentro y no sale a la tesela (§8.1 «Privacidad y responsabilidad»). */
  sim?: { iccid?: string; imsi?: string; pin?: string; telefono?: string };
}): PuertaInternet {
  const titanio: RouterPortatil = {
    id: e.id, tipo: "viaje-openwrt", bateriaPct: null, cargando: false,
    modem: { generacion: e.generacion, conSim: true },
  };
  const tipo = tipoPuertaDeModem(titanio) ?? "movil-4g";
  const cruda: PuertaInternet & { iccid?: string; imsi?: string; pin?: string; telefono?: string } = {
    id: e.id,
    neurona: e.neurona,
    cuenta: e.cuenta,
    tipo,
    bajadaKbps: e.bajadaKbps,
    subidaKbps: e.subidaKbps,
    latenciaMs: e.latenciaMs,
    medida: e.topeMensualMb !== undefined,
    topeMensualMb: e.topeMensualMb,
    usadoMesMb: e.usadoMesMb,
    reservaDuenoPct: e.reservaDuenoPct,
    compartir: e.compartir,
    grupos: e.grupos,
    iccid: e.sim?.iccid,
    imsi: e.sim?.imsi,
    pin: e.sim?.pin,
    telefono: e.sim?.telefono,
  };
  // La lista blanca es el único camino de la puerta a la tesela
  return puertaParaTesela(cruda);
}

/** Quién puede usar la puerta y qué queda para los demás (§8.1): el dueño siempre hasta su tope;
 * los demás según con quién se comparte y solo si la reserva del dueño (20 % editable) deja
 * restante para otros. El restante lo calcula la misma regla que el guardián del router. */
export function cupoDePuerta(
  p: PuertaInternet,
  s: Solicitante,
): { ok: boolean; motivo: string; restanteParaOtrosMb: number | null } {
  return { ...puedeUsar(p, s), restanteParaOtrosMb: restanteParaOtrosMb(p) };
}

/** ¿Cómo sale este titanio (§8.1)? Lo interno y lo privado entre neuronas NUNCA usa una puerta — va
 * por la malla P2P. Lo demás elige la puerta permitida de menor coste (desempate por id) y conserva
 * la actual si no cuesta mucho más que la mejor × 1,2: histéresis del 20 % para no oscilar. */
export function salidaAInternet(e: {
  clase: ClaseDato;
  necesitaInternet: boolean;
  puertas: PuertaInternet[];
  solicitante: Solicitante;
  actual?: string;
}): { puerta: PuertaInternet | null; motivo: string } {
  if (e.clase === "interno" || e.clase === "privado") {
    return { puerta: null, motivo: "va por la malla P2P: no necesita salir a internet" };
  }
  return elegirPuerta(e);
}
