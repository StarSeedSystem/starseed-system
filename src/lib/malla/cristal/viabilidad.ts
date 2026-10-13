// Malla cristalina SiO₂ amorfa: viabilidad de enlaces para datos
// Implementa §3.1 del contrato: architecture/malla-cristalina-sio2.md

import { Dato, SenalMedida, Medio, ClaseDato, Prioridad, TipoDato } from './tipos';
import { calidadSenal, CAPACIDAD_KBPS } from './coste';
import { puntuaLatencia, puntuaAnchoBanda } from '../../../ai/astraura/mesh/camr/metrica';

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

/**
 * Calcula la viabilidad de un enlace para un dato dado.
 * @param dato - El dato a transmitir.
 * @param senal - La señal medida del enlace (de -> a por medio).
 * @param ctx - Contexto con funciones para obtener cuenta de neurona, batería y cifrado E2E.
 * @returns Un objeto Viabilidad con valor (0-1), apto (boolean) y motivo (string).
 */
export function viabilidad(
  dato: Dato,
  senal: SenalMedida,
  ctx: {
    cuentaDe: (neuronaId: string) => string | null;
    bateriaPct?: number | null;
    cifradoE2E: boolean;
  }
): Viabilidad {
   // Veto 1: 'interno' si alguna punta no es de la misma cuenta que el origen.
   const cuentaOrigen = ctx.cuentaDe(dato.origen);
   if (cuentaOrigen === null) {
     return { valor: 0, apto: false, motivo: 'origen desconocido' };
   }
   const cuentaDe = ctx.cuentaDe(senal.de);
   const cuentaA = ctx.cuentaDe(senal.a);
   if (cuentaDe !== cuentaOrigen || cuentaA !== cuentaOrigen) {
     return { valor: 0, apto: false, motivo: 'interno' };
   }

   // Veto 2: 'privado' o 'interno' sin cifradoE2E
   if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
     return { valor: 0, apto: false, motivo: dato.clase === 'privado' ? 'privado' : 'interno' };
   }

   // Veto 3: 'lora' con bytes > 200 × 8 o tipo 'llamada'
   if (senal.medio === 'lora' && (dato.bytes > 1600 || dato.tipo === 'llamada')) {
     return { valor: 0, apto: false, motivo: 'lora' };
   }

   // Veto 4: 'nfc' con bytes > 32768
   if (senal.medio === 'nfc' && dato.bytes > 32768) {
     return { valor: 0, apto: false, motivo: 'nfc' };
   }

   // Calidad de la señal
   const calidad = calidadSenal(senal);

   // Puntuaciones de latencia y ancho de banda
   const latScore = puntuaLatencia(senal.rttMs);
   const bwScore = puntuaAnchoBanda(
     senal.anchoBandaKbps,
     CAPACIDAD_KBPS[senal.medio] ?? 0
   );

   // Factor de prioridad: P0 premia latencia, P3 premia ancho
   const wLat = 1 - dato.prioridad / 3;
   const wBw = dato.prioridad / 3;
   const factorDePrioridad = wLat * latScore + wBw * bwScore;

   // Otros factores
   let factorServidor = 1.0;
   if (senal.medio === 'servidor' && dato.clase !== 'publico') {
     factorServidor = 0.6;
   }

   let factorBateria = 1.0;
   const medioAltoConsumo = ['wifi-lan', 'webrtc'].includes(senal.medio);
   if (ctx.bateriaPct !== null && ctx.bateriaPct < 20 && medioAltoConsumo) {
     factorBateria = 0.8;
   }

   const valor = calidad * factorDePrioridad * factorServidor * factorBateria;
   const valorFinal = Math.max(0, Math.min(1, valor));

   return {
     valor: valorFinal,
     apto: valorFinal > 0,
     motivo: 'viable',
   };
}