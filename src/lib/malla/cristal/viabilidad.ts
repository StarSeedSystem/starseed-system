// Malla cristalina SiO₂ amorfa: viabilidad de un dato por una señal medida
// Función pura, sin node:* ni Supabase

import { Dato, SenalMedida, Medio, ClaseDato, Prioridad } from './tipos';
import { calidadSenal, CAPACIDAD_KBPS } from './coste';
import { puntuaLatencia, puntuaAnchoBanda } from '../../../ai/astraura/mesh/camr/metrica';

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

export function viabilidad(
  dato: Dato,
  s: SenalMedida,
  ctx: {
    cuentaDe: (neuronaId: string) => string | null;
    bateriaPct?: number | null;
    cifradoE2E: boolean;
  }
): Viabilidad {
  // Veto 1: 'interno' si alguna punta no es de la misma cuenta que el origen
  if (dato.clase === 'interno') {
    const cuentaOrigen = ctx.cuentaDe(dato.origen);
    const cuentaDestino = dato.destino ? ctx.cuentaDe(dato.destino) : null;
    if (
      cuentaOrigen === null ||
      cuentaDestino === null ||
      cuentaOrigen !== cuentaDestino
    ) {
      return { valor: 0, apto: false, motivo: 'interno' };
    }
  }

  // Veto 3: 'lora' con bytes > 200 × 8 o tipo 'llamada'
  if (s.medio === 'lora' && (dato.bytes > 1600 || dato.tipo === 'llamada')) {
    return { valor: 0, apto: false, motivo: 'lora' };
  }

  // Veto 4: 'nfc' con bytes > 32768
  if (s.medio === 'nfc' && dato.bytes > 32768) {
    return { valor: 0, apto: false, motivo: 'nfc' };
  }

  // Veto 5: 'servidor' para 'privado'/'interno' solo si cifradoE2E (si no, veto)
  if (
    s.medio === 'servidor' &&
    (dato.clase === 'privado' || dato.clase === 'interno') &&
    !ctx.cifradoE2E
  ) {
    return { valor: 0, apto: false, motivo: 'servidor' };
  }

  // Veto 2: 'privado' o 'interno' sin cifradoE2E
  if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return {
      valor: 0,
      apto: false,
      motivo: dato.clase === 'privado' ? 'privado' : 'interno',
    };
  }

  // Ningún veto aplicó, calcular valor
  const calidad = calidadSenal(s);
  const latenciaScore = puntuaLatencia(s.rttMs ?? null);
  const anchoScore = puntuaAnchoBanda(s.anchoBandaKbps ?? null, CAPACIDAD_KBPS[s.medio]);
  
  // Factor de prioridad: P0 premia latencia, P3 premia ancho
  const factorPrioridad = 
    (1 - dato.prioridad / 3) * latenciaScore + 
    (dato.prioridad / 3) * anchoScore;
  
  let valor = calidad * factorPrioridad;
  
  // Factor 0.6 si medio es 'servidor' y clase no es 'publico'
  if (s.medio === 'servidor' && dato.clase !== 'publico') {
    valor *= 0.6;
  }
  
  // Factor 0.8 si batería < 20 y medio es de alto consumo (wifi-lan, webrtc)
  if (
    ctx.bateriaPct != null && 
    ctx.bateriaPct < 20 && 
    (s.medio === 'wifi-lan' || s.medio === 'webrtc')
  ) {
    valor *= 0.8;
  }
  
  // Valor debe estar entre 0 y 1
  valor = Math.max(0, Math.min(1, valor));
  
  return {
    valor,
    apto: true,
    motivo: 'viable',
  };
}
