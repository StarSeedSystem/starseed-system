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
