/**
 * medidas-locales — convierte lo que YA miden otras capas (mesh LoRa, WebRTC,
 * faro nativo, enlaces locales) en `SenalMedida[]` para la retícula SiO₂ (§2).
 * Módulo PURO: sin node:*, sin Supabase, sin window. Nunca lanza.
 */
import type { SenalMedida } from './tipos';

/** Ventana de frescura: una medida más vieja que esto no entra en la retícula. */
export const FRESCURA_MS = 5 * 60 * 1000;

// Interfaces mínimas de entrada (mismos nombres de campo que las capas reales).

/** Espejo de los campos medidos de `MeshNodeInfo` (src/ai/astraura/mesh/types.ts). */
export interface NodoMeshMedido {
  id?: string;
  snr?: number;
  rssi?: number;
  lastHeard?: number;
}

/** Ruta WebRTC medida por par (espejo de `ClaseRuta`/estadísticas de enlace). */
export interface RutaWebRTCMedida {
  par?: string;
  clase: 'misma-lan' | 'internet-directo' | 'turn' | string;
  rttMs?: number;
  kbps?: number;
}

/** Vecino visto por el faro UDP (espejo de `VecinoFaro`, src/lib/nativa/tipos.ts). */
export interface VecinoFaroMedido {
  neurona?: string | null;
  visto_ms: number;
  rssi?: number;
}

/** Enlace local vivo (espejo fotográfico de `FotoEnlaceLocal`). */
export interface EnlaceLocalMedido {
  id?: string;
  tipo?: string;
  par?: string;
  rttMs?: number;
}

export function senalesDeNodosMesh(
  yo: string,
  nodos: NodoMeshMedido[],
  ahora: number,
): SenalMedida[] {
  const fin = nodos.length;
  const salida: SenalMedida[] = [];
  for (let i = 0; i < fin; i++) {
    const n = nodos[i];
    if (!n.id) continue;
    const vistaEn = typeof n.lastHeard === 'number' ? n.lastHeard : ahora;
    if (ahora - vistaEn > FRESCURA_MS) continue;
    salida.push({
      de: yo,
      a: n.id,
      medio: 'lora',
      ...(typeof n.snr === 'number' ? { snrDb: n.snr } : {}),
      ...(typeof n.rssi === 'number' ? { rssiDbm: n.rssi } : {}),
      vistaEn,
    });
  }
  return salida;
}

export function senalesDeRutasWebRTC(
  yo: string,
  rutas: RutaWebRTCMedida[],
  ahora: number,
): SenalMedida[] {
  const salida: SenalMedida[] = [];
  for (const r of rutas) {
    if (!r.par) continue;
    salida.push({
      de: yo,
      a: r.par,
      medio: r.clase === 'misma-lan' ? 'wifi-lan' : 'webrtc',
      ...(typeof r.rttMs === 'number' ? { rttMs: r.rttMs } : {}),
      ...(typeof r.kbps === 'number' ? { anchoBandaKbps: r.kbps } : {}),
      vistaEn: ahora,
    });
  }
  return salida;
}

// El faro UDP solo llega por la LAN: su medio siempre es 'wifi-lan'.
export function senalesDeVecinosFaro(
  yo: string,
  vecinos: VecinoFaroMedido[],
  ahora: number,
): SenalMedida[] {
  const salida: SenalMedida[] = [];
  for (const v of vecinos) {
    if (!v.neurona) continue;
    if (ahora - v.visto_ms > FRESCURA_MS) continue;
    salida.push({
      de: yo,
      a: v.neurona,
      medio: 'wifi-lan',
      ...(typeof v.rssi === 'number' ? { rssiDbm: v.rssi } : {}),
      vistaEn: v.visto_ms,
    });
  }
  return salida;
}

export function senalesDeEnlacesLocales(
  yo: string,
  enlaces: EnlaceLocalMedido[],
  ahora: number,
): SenalMedida[] {
  const salida: SenalMedida[] = [];
  for (const e of enlaces) {
    const par = typeof e.par === 'string' ? e.par : e.id;
    if (!par) continue;
    const medio: SenalMedida['medio'] = e.tipo === 'ble' ? 'ble' : 'webrtc';
    salida.push({
      de: yo,
      a: par,
      medio,
      ...(typeof e.rttMs === 'number' ? { rttMs: e.rttMs } : {}),
      vistaEn: ahora,
    });
  }
  return salida;
}
