// Malla cristalina §3.1: viabilidad de cada dato por cada señal medida.
// Módulo puro: sin node:*, sin Supabase, sin window.

import type { Dato, Medio, SenalMedida } from './tipos';
import { calidadSenal, CAPACIDAD_KBPS } from './coste';
import { puntuaLatencia, puntuaAnchoBanda } from '../../../ai/astraura/mesh/camr/metrica';

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

/** Contexto que aporta el llamador (cuenta de cada neurona, batería y cifrado). */
export interface ContextoViabilidad {
  cuentaDe: (neuronaId: string) => string | null;
  bateriaPct?: number | null;
  cifradoE2E: boolean;
}

// Medios de alto consumo: con batería baja se penalizan (§3.1).
const MEDIOS_ALTO_CONSUMO: readonly Medio[] = ['wifi-lan', 'webrtc'];

// Pesos (latencia, ancho) por prioridad: P0 premia latencia, P3 premia ancho.
const PESOS_PRIORIDAD: Record<number, { lat: number; ancho: number }> = {
  0: { lat: 0.7, ancho: 0.3 },
  1: { lat: 0.6, ancho: 0.4 },
  2: { lat: 0.4, ancho: 0.6 },
  3: { lat: 0.3, ancho: 0.7 },
};

function veto(motivo: string): Viabilidad {
  return { valor: 0, apto: false, motivo };
}

function factorPrioridad(dato: Dato, s: SenalMedida): number {
  const pesos = PESOS_PRIORIDAD[dato.prioridad] ?? PESOS_PRIORIDAD[2];
  const lat = typeof s.rttMs === 'number' ? puntuaLatencia(s.rttMs) : 0.5;
  const ancho =
    typeof s.anchoBandaKbps === 'number'
      ? puntuaAnchoBanda(s.anchoBandaKbps, CAPACIDAD_KBPS[s.medio])
      : 0.5;
  // El factor queda en (0, 1]: matiza la calidad sin anularla.
  return 0.5 + 0.5 * (pesos.lat * lat + pesos.ancho * ancho);
}

export function viabilidad(dato: Dato, s: SenalMedida, ctx: ContextoViabilidad): Viabilidad {
  // Veto 1: lo interno solo viaja entre neuronas de la misma cuenta que el origen.
  if (dato.clase === 'interno') {
    const cuentaOrigen = ctx.cuentaDe(dato.origen);
    const mismaCuenta =
      cuentaOrigen !== null &&
      ctx.cuentaDe(s.de) === cuentaOrigen &&
      ctx.cuentaDe(s.a) === cuentaOrigen;
    if (!mismaCuenta) {
      return veto('interno: una punta del enlace no es de la misma cuenta que el origen');
    }
  }

  // Veto 2: lo privado o interno nunca va en claro (incluye el servidor sin cifrar).
  if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return veto('sin cifrado de extremo a extremo para un dato privado o interno');
  }

  // Veto 3: LoRa solo lleva lo que cabe en sus tramas y jamás una llamada.
  if (s.medio === 'lora') {
    if (dato.tipo === 'llamada') return veto('lora no puede llevar una llamada en directo');
    if (dato.bytes > 200 * 8) return veto('lora: el dato no cabe en sus tramas (~200 B)');
  }

  // Veto 4: NFC tiene un tope físico de 32 KiB.
  if (s.medio === 'nfc' && dato.bytes > 32768) {
    return veto('nfc: el dato supera el tope de 32 KiB');
  }

  // Valor: calidad medida × prioridad × penalizaciones.
  let valor = calidadSenal(s) * factorPrioridad(dato, s);

  // Un servidor es externo: último recurso para lo que no es público.
  if (s.medio === 'servidor' && dato.clase !== 'publico') valor *= 0.6;

  // Batería baja: se penalizan los medios de alto consumo.
  const bat = ctx.bateriaPct;
  if (typeof bat === 'number' && bat < 20 && MEDIOS_ALTO_CONSUMO.includes(s.medio)) {
    valor *= 0.8;
  }

  return { valor, apto: true, motivo: 'viable' };
}
