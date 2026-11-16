/**
 * tipos — definiciones de tipo del espectrómetro (MRA2/MAP1116).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 */

import { POSICION_VIVA_MS } from "../geo/modelo-geo";
export { POSICION_VIVA_MS };

/** Medio por el que viaja la señal. */
export type Medio =
  | "wifi"
  | "bluetooth"
  | "lora"
  | "celular"
  | "malla"
  | "internet"
  | "estacion"
  | "sdr";

/** Quién midió o declaró el valor. */
export type OrigenDato = "medida" | "declarada" | "estimada";

/** Capa de red a la que pertenece la señal. */
export type CapaRed = "propia" | "publica" | "comunidad" | "privada" | "externa";

/** Compatibilidad de esta señal con otro medio/nodo. */
export interface Compatibilidad {
  con: Medio | "neurona" | "estacion";
  que: string;
  posible: boolean;
  motivo: string;
}

/** Qué dice el mapa cuando una plataforma no da nada. */
export interface SinFuente {
  medio: Medio;
  motivo: string;
}

/** Tipo de elemento al que se vincula la señal. */
export type TipoVinculo = "antena" | "cerebro" | "nodo" | "neurona" | "servidor" | "estacion" | "router";

/** Vínculo opcional a un elemento concreto. */
export interface Vinculo {
  tipo: TipoVinculo;
  id: string;
}

/** Señal individual del espectro. */
export interface SenalEspectro {
  id: string;
  medio: Medio;
  banda: string;
  frecuenciaKhz: number | null;
  anchoKhz: number | null;
  fuerzaDbm: number | null;
  calidad: number | null;
  origen: OrigenDato;
  capa: CapaRed;
  /** Quién la ve: «escaneo de Wi-Fi del sistema», «enlace de la malla», «publicada por su dueño»… */
  fuente: string;
  /** Epoch ms de la medición; null si no hay hora. */
  medidoEn: number | null;
  /** Zona gruesa (≤5 caracteres, nunca coordenadas lat,lon). */
  zona: string | null;
  /** Vínculo opcional al elemento que la origina/recibe. */
  vinculo?: Vinculo;
  /** Compatibilidades conocidas con otros medios/nodos. */
  compatibles: Compatibilidad[];
}