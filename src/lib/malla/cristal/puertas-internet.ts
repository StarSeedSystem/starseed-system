// Puertas a internet opcionales de la retícula (§8 y §8.1 de architecture/malla-cristalina-sio2.md).
import type { ClaseDato } from './tipos';

export const TIPOS_PUERTA = ['movil-4g','movil-5g','wifi-externa','usb-telefono','cable','satelite'] as const;
export type TipoPuerta = typeof TIPOS_PUERTA[number];

export const COMPARTIR = ['nadie','mi-cuenta','vinculos','grupo','publico'] as const;
export type Compartir = typeof COMPARTIR[number];

export interface PuertaInternet {
  id: string;
  neurona: string;
  cuenta: string;
  tipo: TipoPuerta;
  bajadaKbps: number;
  subidaKbps: number;
  latenciaMs: number;
  medida: boolean;
  topeMensualMb?: number;
  usadoMesMb?: number;
  reservaDuenoPct?: number;
  compartir: Compartir;
  grupos?: string[];
}

export interface Solicitante {
  cuenta: string;
  vinculado: boolean;
  grupos: string[];
}

// Restante para otros: tope − usado − reserva del dueño (20 % por defecto).
export function restanteParaOtrosMb(p: PuertaInternet): number | null {
  if (!p.medida || p.topeMensualMb === undefined) return null;
  const reserva = p.topeMensualMb * ((p.reservaDuenoPct ?? 20) / 100);
  return Math.max(0, p.topeMensualMb - (p.usadoMesMb ?? 0) - reserva);
}

// El dueño siempre hasta su tope; los demás según compartir y solo si queda restante para otros.
export function puedeUsar(p: PuertaInternet, s: Solicitante): {ok: boolean; motivo: string} {
  if (s.cuenta === p.cuenta) {
    if (!p.medida || p.topeMensualMb === undefined) return {ok: true, motivo: 'Dueño sin límite de datos'};
    if ((p.usadoMesMb ?? 0) >= p.topeMensualMb) return {ok: false, motivo: 'Dueño ha superado su tope mensual'};
    return {ok: true, motivo: 'Dueño dentro de su tope'};
  }
  switch (p.compartir) {
    case 'nadie': return {ok: false, motivo: 'Puerta configurada para no compartir'};
    case 'mi-cuenta': return {ok: false, motivo: 'Solo la cuenta propietaria puede usar esta puerta'};
    case 'vinculos':
      if (!s.vinculado) return {ok: false, motivo: 'Solicitante no está vinculado a la cuenta'};
      break;
    case 'grupo':
      if (!s.grupos.some(g => p.grupos?.includes(g))) return {ok: false, motivo: 'Solicitante no tiene grupos en común'};
      break;
    case 'publico': break;
  }
  const restante = restanteParaOtrosMb(p);
  if (restante === null) return {ok: false, motivo: 'Puerta no medida o sin tope definido'};
  if (restante <= 0) return {ok: false, motivo: 'No queda datos disponibles para compartir'};
  return {ok: true, motivo: 'Permitido según configuración de compartir'};
}

// Coste determinista por latencia y ancho de banda: medida ×2; uso > 80 % del tope ×3.
export function costePuerta(p: PuertaInternet): number {
  const latenciaNorm = Math.min(p.latenciaMs / 1000, 1);
  const anchoNorm = Math.min(((p.bajadaKbps + p.subidaKbps) / 2) / 10000, 1);
  let coste = latenciaNorm + (1 - anchoNorm);
  if (p.medida) coste *= 2;
  if (p.medida && p.topeMensualMb && p.usadoMesMb !== undefined && p.usadoMesMb / p.topeMensualMb > 0.8) coste *= 3;
  return coste;
}

// Elige la permitida de menor coste (desempate por id); conserva `actual` si su coste ≤ mejor × 1,2.
export function elegirPuerta(e: {
  clase: ClaseDato;
  necesitaInternet: boolean;
  puertas: PuertaInternet[];
  solicitante: Solicitante;
  actual?: string;
}): {puerta: PuertaInternet | null; motivo: string} {
  if (!e.necesitaInternet) return {puerta: null, motivo: 'va por la malla P2P: no necesita salir a internet'};
  if (e.puertas.length === 0) return {puerta: null, motivo: 'No hay puertas disponibles'};
  let mejor: PuertaInternet | null = null;
  for (const puerta of e.puertas) {
    if (!puedeUsar(puerta, e.solicitante).ok) continue;
    if (mejor === null) { mejor = puerta; continue; }
    const coste = costePuerta(puerta);
    const costeMejor = costePuerta(mejor);
    // Desempate por id ante coste igual, para que la elección sea determinista
    if (coste < costeMejor || (coste === costeMejor && puerta.id < mejor.id)) mejor = puerta;
  }
  if (mejor === null) return {puerta: null, motivo: 'No hay puertas permitidas para el solicitante'};
  if (e.actual) {
    const actual = e.puertas.find(p => p.id === e.actual && puedeUsar(p, e.solicitante).ok);
    if (actual && costePuerta(actual) <= costePuerta(mejor) * 1.2) {
      return {puerta: actual, motivo: 'Manteniendo puerta actual por histéresis'};
    }
  }
  return {puerta: mejor, motivo: 'Puerta de menor coste seleccionada'};
}

// Lista blanca: la tesela jamás lleva números de la SIM (ICCID, IMSI, teléfono) ni su PIN.
export function puertaParaTesela(p: PuertaInternet): PuertaInternet {
  const tesela: PuertaInternet = {
    id: p.id,
    neurona: p.neurona,
    cuenta: p.cuenta,
    tipo: p.tipo,
    bajadaKbps: p.bajadaKbps,
    subidaKbps: p.subidaKbps,
    latenciaMs: p.latenciaMs,
    medida: p.medida,
    compartir: p.compartir,
  };
  if (p.topeMensualMb !== undefined) tesela.topeMensualMb = p.topeMensualMb;
  if (p.usadoMesMb !== undefined) tesela.usadoMesMb = p.usadoMesMb;
  if (p.reservaDuenoPct !== undefined) tesela.reservaDuenoPct = p.reservaDuenoPct;
  if (p.grupos) tesela.grupos = [...p.grupos];
  return tesela;
}
