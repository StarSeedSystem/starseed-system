// Puertas a internet opcionales
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

// Funciones puras
export function restanteParaOtrosMb(p: PuertaInternet): number | null {
  return !p.medida || !p.topeMensualMb ? null : Math.max(0, p.topeMensualMb - (p.usadoMesMb ?? 0) - (p.topeMensualMb * (p.reservaDuenoPct ?? 20)) / 100);
}

export function puedeUsar(p: PuertaInternet, s: Solicitante): {ok: boolean; motivo: string} {
  switch (p.compartir) {
    case 'nadie':
      // El dueño siempre tiene acceso a su propia puerta; «nadie» solo la cierra al resto.
      if (s.cuenta !== p.cuenta) return {ok: false, motivo: 'Puerta configurada para no compartir'};
      break;
    case 'mi-cuenta':
      if (s.cuenta !== p.cuenta) return {ok: false, motivo: 'Solo la cuenta propietaria puede usar esta puerta'};
      break;
    case 'vinculos':
      if (!s.vinculado) return {ok: false, motivo: 'Solicitante no está vinculado a la cuenta'};
      break;
    case 'grupo':
      if (!s.grupos.some(g => p.grupos?.includes(g))) return {ok: false, motivo: 'Solicitante no tiene grupos en común'};
      break;
    case 'publico': break;
  }

  // El dueño siempre hasta su tope
  if (s.cuenta === p.cuenta) {
    if (!p.medida || !p.topeMensualMb) return {ok: true, motivo: 'Dueño sin límite de datos'};
    const usado = p.usadoMesMb ?? 0;
    if (usado >= p.topeMensualMb) return {ok: false, motivo: 'Dueño ha superado su tope mensual'};
    return {ok: true, motivo: 'Dueño dentro de su tope'};
  }

  // Para otros, verificar según restante para otros
  const restante = restanteParaOtrosMb(p);
  if (restante === null) return {ok: false, motivo: 'Puerta no medida o sin tope definido'};
  if (restante <= 0) return {ok: false, motivo: 'No queda datos disponibles para compartir'};

  return {ok: true, motivo: 'Permitido según configuración de compartir'};
}

export function costePuerta(p: PuertaInternet): number {
  const latenciaNorm = Math.min(p.latenciaMs / 1000, 1);
  const anchoBanda = (p.bajadaKbps + p.subidaKbps) / 2;
  const anchoNorm = Math.min(anchoBanda / 10000, 1);
  let coste = latenciaNorm + (1 - anchoNorm);
  if (p.medida) coste *= 2;
  if (p.medida && p.topeMensualMb && p.usadoMesMb !== undefined) {
    const usoPct = (p.usadoMesMb / p.topeMensualMb) * 100;
    if (usoPct > 80) coste *= 3;
  }
  return coste;
}

export function elegirPuerta(e: {
  clase: ClaseDato;
  necesitaInternet: boolean;
  puertas: PuertaInternet[];
  solicitante: Solicitante;
  actual?: string;
}): {puerta: PuertaInternet | null; motivo: string} {
  if (!e.necesitaInternet) return {puerta: null, motivo: 'va por la malla P2P: no necesita salir a internet'};
  if (!e.puertas.length) return {puerta: null, motivo: 'No hay puertas disponibles'};

  const puertasPermitidas = e.puertas.filter(p => puedeUsar(p, e.solicitante).ok);
  if (!puertasPermitidas.length) return {puerta: null, motivo: 'No hay puertas permitidas para el solicitante'};

  let mejorPuerta = puertasPermitidas[0];
  let mejorCoste = costePuerta(mejorPuerta);

  for (const puerta of puertasPermitidas.slice(1)) {
    const coste = costePuerta(puerta);
    // Empate deshecho por id: determinista e independiente del orden de entrada.
    if (coste < mejorCoste || (coste === mejorCoste && puerta.id < mejorPuerta.id)) {
      mejorCoste = coste;
      mejorPuerta = puerta;
    }
  }

  if (e.actual) {
    const puertaActual = e.puertas.find(p => p.id === e.actual);
    if (puertaActual && puedeUsar(puertaActual, e.solicitante).ok) {
      const costeActual = costePuerta(puertaActual);
      if (costeActual <= mejorCoste * 1.2) {
        return {puerta: puertaActual, motivo: 'Manteniendo puerta actual por histéresis'};
      }
    }
  }

  return {puerta: mejorPuerta, motivo: 'Puerta de menor coste seleccionada'};
}

export function puertaParaTesela(p: PuertaInternet): Omit<PuertaInternet, 'iccid' | 'imsi' | 'pin' | 'telefono'> {
  const { iccid, imsi, pin, telefono, ...r } = p as any;
  return r;
}