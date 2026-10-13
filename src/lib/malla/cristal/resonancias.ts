// Resonancias: confianza de cada nodo y cuarentena por consenso (§5 de la malla cristalina).
import type { Nivel } from './centinela';

/** Confianza de arranque de todo nodo. */
export const CONFIANZA_INICIAL = 0.5;

export type EventoConfianza =
  | 'firma-ok'
  | 'firma-mala'
  | 'trama-corrupta'
  | 'veredicto-confirmado'
  | 'veredicto-desmentido';

const PASOS: Record<EventoConfianza, number> = {
  'firma-ok': 0.02,
  'firma-mala': -0.3,
  'trama-corrupta': -0.15,
  'veredicto-confirmado': 0.05,
  'veredicto-desmentido': -0.2,
};

/** Media móvil: aplica el evento a la confianza y la recorta a [0, 1]. */
export function actualizarConfianza(c: number, ev: EventoConfianza): number {
  const siguiente = c + PASOS[ev];
  return Math.min(1, Math.max(0, siguiente));
}

/** Veredicto antivirus firmado que una neurona comparte con la red. */
export interface VeredictoCompartido {
  hash: string;
  nivel: Nivel;
  nodo: string;
  cuenta: string;
  firmaOk: boolean;
  t: number;
}

export type DecisionResonancia =
  | 'cuarentena'
  | 'aviso'
  | 'limpio'
  | 'sin-datos';

export interface ResultadoResonancia {
  decision: DecisionResonancia;
  cuentas: number;
  motivo: string;
}

/** Consenso sobre un hash: solo cuentan firmaOk y nodos con confianza ≥ umbral;
 * un voto por cuenta (el más reciente). Solo informa: nada se borra solo. */
export function decisionPorResonancia(
  hash: string,
  veredictos: VeredictoCompartido[],
  confianza: Record<string, number>,
  umbral = 0.4,
): ResultadoResonancia {
  const porCuenta = new Map<string, VeredictoCompartido>();
  for (const v of veredictos) {
    if (v.hash !== hash || !v.firmaOk) continue;
    if ((confianza[v.nodo] ?? CONFIANZA_INICIAL) < umbral) continue;
    const prev = porCuenta.get(v.cuenta);
    if (!prev || v.t > prev.t) porCuenta.set(v.cuenta, v);
  }
  const votos = [...porCuenta.values()];
  const peligroso = votos.filter((v) => v.nivel === 'peligroso').length;
  const sospechoso = votos.filter((v) => v.nivel === 'sospechoso').length;
  const limpio = votos.filter((v) => v.nivel === 'limpio').length;
  if (peligroso >= 2) {
    return { decision: 'cuarentena', cuentas: peligroso, motivo: `${peligroso} cuentas marcan peligroso` };
  }
  if (peligroso === 1 || sospechoso >= 2) {
    return { decision: 'aviso', cuentas: peligroso || sospechoso, motivo: peligroso === 1 ? 'una cuenta marca peligroso' : `${sospechoso} cuentas marcan sospechoso` };
  }
  if (limpio >= 2) {
    return { decision: 'limpio', cuentas: limpio, motivo: `${limpio} cuentas marcan limpio` };
  }
  return { decision: 'sin-datos', cuentas: votos.length, motivo: 'pocos veredictos fiables' };
}
