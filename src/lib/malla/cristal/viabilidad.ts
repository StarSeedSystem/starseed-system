import type { Dato, SenalMedida, Medio, ClaseDato, Prioridad } from './tipos';
import { calidadSenal } from './coste';

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

export function viabilidad(dato: Dato, s: SenalMedida, ctx: {
  cuentaDe: (neuronaId: string) => string | null;
  bateriaPct?: number | null;
  cifradoE2E: boolean;
}): Viabilidad {
  // Veto 1: 'interno' si alguna punta no es de la misma cuenta que el origen
  const cuentaOrigen = ctx.cuentaDe(dato.origen);
  if (dato.clase === 'interno') {
    if (cuentaOrigen === null) {
      return { valor: 0, apto: false, motivo: 'interno' };
    }
    const cuentaDe = ctx.cuentaDe(s.de);
    const cuentaA = ctx.cuentaDe(s.a);
    if (cuentaDe !== cuentaOrigen || cuentaA !== cuentaOrigen) {
      return { valor: 0, apto: false, motivo: 'interno' };
    }
  }

  // Veto 2: 'servidor' para 'privado'/'interno' solo si cifradoE2E (si no, veto)
  if (s.medio === 'servidor' && (dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: 'servidor' };
  }

  // Veto 3: 'privado' o 'interno' sin cifradoE2E (general)
  if ((dato.clase === 'privado' || dato.clase === 'interno') && !ctx.cifradoE2E) {
    return { valor: 0, apto: false, motivo: dato.clase };
  }

  // Veto 4: 'lora' con bytes > 200 × 8 o tipo 'llamada'
  if (s.medio === 'lora' && (dato.bytes > 200 * 8 || dato.tipo === 'llamada')) {
    return { valor: 0, apto: false, motivo: 'lora' };
  }

  // Veto 5: 'nfc' con bytes > 32768
  if (s.medio === 'nfc' && dato.bytes > 32768) {
    return { valor: 0, apto: false, motivo: 'nfc' };
  }

  // If we passed all vetoes, calculate the valor
  const calidad = calidadSenal(s);
  
  // Factor de prioridad: P0 premia latencia, P3 premia ancho
  // We assume a simple decreasing factor: P0=1.0, P1=0.9, P2=0.8, P3=0.7
  let factorPrioridad = 1.0;
  switch (dato.prioridad) {
    case 0: factorPrioridad = 1.0; break;
    case 1: factorPrioridad = 0.9; break;
    case 2: factorPrioridad = 0.8; break;
    case 3: factorPrioridad = 0.7; break;
  }

  // Multiplier for servidor and non-public class
  let factorServidor = 1.0;
  if (s.medio === 'servidor' && dato.clase !== 'publico') {
    factorServidor = 0.6;
  }

  // Multiplier for low battery and high consumption medios
  let factorBateria = 1.0;
  const altoConsumo = s.medio === 'wifi-lan' || s.medio === 'webrtc';
  if (ctx.bateriaPct !== null && ctx.bateriaPct < 20 && altoConsumo) {
    factorBateria = 0.8;
  }

  const valor = calidad * factorPrioridad * factorServidor * factorBateria;

  return { valor: valor, apto: true, motivo: '' };
}