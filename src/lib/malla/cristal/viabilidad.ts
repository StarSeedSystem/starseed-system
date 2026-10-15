// Malla cristalina SiO₂ amorfa: viabilidad de enlaces
// Función pura: sin node:* ni Supabase ni window

import { Medio, ClaseDato, TipoDato, Prioridad, SenalMedida, Dato } from "./tipos";

export interface Viabilidad {
  valor: number;
  apto: boolean;
  motivo: string;
}

/**
 * Evalúa la viabilidad de un enlace para transmitir un dato.
 * @param dato - El dato a transmitir
 * @param s - La señal medida entre dos neuronas
 * @param ctx - Contexto: función para obtener la cuenta de una neurona, porcentaje de batería y si hay cifrado E2E
 * @returns Objeto Viabilidad con valor (0-1), apto (boolean) y motivo (string)
 */
export function viabilidad(
  dato: Dato,
  s: SenalMedida,
  ctx: {
    cuentaDe: (neuronaId: string) => string | null;
    bateriaPct?: number | null;
    cifradoE2E: boolean;
  }
): Viabilidad {
  // Vetos (apto false, valor 0, motivo claro en español)

  // 1. 'interno' si alguna punta no es de la misma cuenta que el origen
  if (dato.clase === 'interno') {
    const cuentaOrigen = ctx.cuentaDe(dato.origen);
    if (cuentaOrigen === null) {
      return { valor: 0, apto: false, motivo: 'interno: cuenta de origen desconocida' };
    }
    const cuentaDe = ctx.cuentaDe(s.de);
    const cuentaA = ctx.cuentaDe(s.a);
    if (cuentaDe === null || cuentaA === null) {
      return { valor: 0, apto: false, motivo: 'interno: cuenta de punta desconocida' };
    }
    if (cuentaDe !== cuentaOrigen || cuentaA !== cuentaOrigen) {
      return { valor: 0, apto: false, motivo: 'interno: punta no pertenece a la misma cuenta' };
    }
  }

  // 2. 'lora' con bytes > 200 × 8 o tipo 'llamada'
  if (s.medio === 'lora') {
    if (dato.bytes > 1600) { // 200 * 8 = 1600
      return { valor: 0, apto: false, motivo: 'lora: bytes > 1600' };
    }
    if (dato.tipo === 'llamada') {
      return { valor: 0, apto: false, motivo: 'lora: tipo llamada' };
    }
  }

  // 3. 'nfc' con bytes > 32768
  if (s.medio === 'nfc' && dato.bytes > 32768) {
    return { valor: 0, apto: false, motivo: 'nfc: bytes > 32768' };
  }

  // 4. 'servidor' para 'privado'/'interno' solo si cifradoE2E (si no, veto)
  if (s.medio === 'servidor') {
    if (dato.clase === 'privado' || dato.clase === 'interno') {
      if (!ctx.cifradoE2E) {
        return { valor: 0, apto: false, motivo: 'servidor para privado/interno sin cifradoE2E' };
      }
    }
  }

  // 5. 'privado' o 'interno' sin cifradoE2E
  if (dato.clase === 'privado' || dato.clase === 'interno') {
    if (!ctx.cifradoE2E) {
      return { valor: 0, apto: false, motivo: dato.clase === 'privado' ? 'privado sin cifradoE2E' : 'interno sin cifradoE2E' };
    }
  }

  // Si passed all vetoes, compute calidadSenal
  // Normalize metrics (handle undefined with worst-case values)
  const rssi = s.rssiDbm ?? -100; // dBm, worse case -100
  const snr = s.snrDb ?? 0; // dB, worse case 0
  const rtt = s.rttMs ?? 1000; // ms, worse case 1000
  const bw = s.anchoBandaKbps ?? 0; // kbps, worse case 0
  const loss = s.perdidaPct ?? 100; // percent, worse case 100

  // Normalize to [0,1] where 1 is best
  const rssiNorm = Math.max(0, Math.min(1, (rssi + 100) / 50)); // -100 -> 0, -50 -> 1
  const snrNorm = Math.max(0, Math.min(1, snr / 40)); // 0 -> 0, 40 -> 1
  const rttNorm = Math.max(0, Math.min(1, rtt / 1000)); // 0 -> 0, 1000 -> 1 (worse)
  const bwNorm = Math.max(0, Math.min(1, bw / 100000)); // 0 -> 0, 100000 -> 1 (better)
  const lossNorm = loss / 100; // 0 -> 0, 100 -> 1 (worse)

  // Calidad de la señal: weighted sum
  // Weights: rssi 30%, snr 30%, rtt inverse 20%, bw 10%, loss inverse 10%
  const calidadSenal =
    rssiNorm * 0.3 +
    snrNorm * 0.3 +
    (1 - rttNorm) * 0.2 +
    bwNorm * 0.1 +
    (1 - lossNorm) * 0.1;

  // Factor de prioridad: P0 premia latencia, P3 premia ancho
  let pesoLatencia = 0.2;
  let pesoAncho = 0.2;
  switch (dato.prioridad) {
    case 0: pesoLatencia = 0.8; pesoAncho = 0.2; break;
    case 1: pesoLatencia = 0.6; pesoAncho = 0.4; break;
    case 2: pesoLatencia = 0.4; pesoAncho = 0.6; break;
    case 3: pesoLatencia = 0.2; pesoAncho = 0.8; break;
  }
  const factorPrioridad =
    pesoLatencia * (1 - rttNorm) + // latencia inversa (mejor cuando rtt es bajo)
    pesoAncho * bwNorm;           // ancho de banda (mejor cuando bw es alto)

  // Aplicar multiplicadores
  let valor = calidadSenal * factorPrioridad;

  // × 0.6 si el medio es 'servidor' y la clase no es 'publico'
  if (s.medio === 'servidor' && dato.clase !== 'publico') {
    valor *= 0.6;
  }

  // × 0.8 si batería < 20 y el medio es de alto consumo (wifi-lan, webrtc)
  const altoConsumo = s.medio === 'wifi-lan' || s.medio === 'webrtc';
  if (
    typeof ctx.bateriaPct === 'number' &&
    ctx.bateriaPct < 20 &&
    altoConsumo
  ) {
    valor *= 0.8;
  }

  // Ensure valor is between 0 and 1
  valor = Math.max(0, Math.min(1, valor));

  // Determine apto: if valor > 0 and no veto (we already passed vetoes, so apto true if valor > 0?)
  // According to contract, vetoes set apto false and valor 0. Otherwise, apto should be true?
  // But note: valor could be 0 due to bad signal even if not vetoed. The contract says vetoes give valor 0 and apto false.
  // For non-vetoed, we set apto true if valor > 0? However, the contract doesn't specify. We'll assume apto true if valor > 0.
  const apto = valor > 0;

  // Motivo: if apto, we can give a positive reason, else we already returned in vetoes.
  // But we need to return a motivo in all cases. For apto true, we can give a generic reason.
  let motivo = '';
  if (apto) {
    motivo = `viable (valor=${valor.toFixed(3)})`;
  } else {
    // This should not happen because we returned earlier for vetoes, but just in case.
    motivo = 'no viable';
  }

  return { valor, apto, motivo };
}