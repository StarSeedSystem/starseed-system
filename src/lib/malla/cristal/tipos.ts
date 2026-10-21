// Malla cristalina SiO₂ amorfa: tipos puros, sin node:* ni Supabase

import { Punto } from "./triangulacion";
import { esTitanio, COORDINACION_TITANIO, teselaDeRouter } from "./titanio";

export type { Punto };
export { delaunay } from "./triangulacion";

export const MEDIOS = [
  'lora', 'ble', 'wifi-lan', 'webrtc', 'wifi-mesh',
  'reticulum', 'serie', 'servidor', 'nfc',
] as const;

export type Medio = typeof MEDIOS[number];

export const CLASES_DATO = ['interno', 'privado', 'publico'] as const;
export type ClaseDato = typeof CLASES_DATO[number];

export const TIPOS_DATO = [
  'mensaje', 'llamada', 'archivo', 'publicacion', 'sincronia', 'conciencia',
] as const;
export type TipoDato = typeof TIPOS_DATO[number];

export type Prioridad = 0 | 1 | 2 | 3;

export interface NeuronaReticula {
  id: string;
  cuenta: string;
  esRouter?: boolean;
  posicion?: { x: number; y: number; precisionM: number };
  capacidad: {
    ramGb: number;
    bateriaPct: number | null;
    cargando: boolean;
  };
  medios: Medio[];
}

export interface SenalMedida {
  de: string;
  a: string;
  medio: Medio;
  rssiDbm?: number;
  snrDb?: number;
  rttMs?: number;
  anchoBandaKbps?: number;
  perdidaPct?: number;
  frecuenciaMhz?: number;
  anchoCanalMhz?: number;
  vistaEn: number;
}

export interface Tesela {
  origen: string;
  reloj: number;
  neurona: NeuronaReticula;
  senales: SenalMedida[];
  huella?: string;
  firma?: string;
}

export interface Reticula {
  teselas: Record<string, Tesela>;
}

export type EstadoVitreo = 'fundido' | 'subenfriado' | 'vitreo';

export interface Puente {
  a: string;
  b: string;
  medio: Medio;
  coste: number;
}

export interface Cristal {
  puentes: Puente[];
  estado: EstadoVitreo;
  temperatura: Record<string, number>;
  huella: string;
  coordinacion: Record<string, number>;
}

export interface Dato {
  id: string;
  clase: ClaseDato;
  tipo: TipoDato;
  bytes: number;
  prioridad: Prioridad;
  origen: string;
  destino: string | null;
}

// --- Funciones puras ---

export const COORDINACION_BASE = 4;

export function esMedio(x: unknown): x is Medio {
  return typeof x === 'string' && MEDIOS.includes(x as Medio);
}

export function esClaseDato(x: unknown): x is ClaseDato {
  return typeof x === 'string' && CLASES_DATO.includes(x as ClaseDato);
}

export function coordinacionDe(n: NeuronaReticula): number {
  if (esTitanio(n)) return COORDINACION_TITANIO;
  const bat = n.capacidad.bateriaPct;
  if (bat !== null && bat < 20 && !n.capacidad.cargando) return 2;
  if (n.capacidad.ramGb < 2) return 3;
  return COORDINACION_BASE;
}

export { esTitanio, COORDINACION_TITANIO, teselaDeRouter } from "./titanio";
export function claveSenal(s: SenalMedida): string {
  const a = s.de < s.a ? s.de : s.a;
  const b = s.de < s.a ? s.a : s.de;
  return `${a}|${b}|${s.medio}`;
}
