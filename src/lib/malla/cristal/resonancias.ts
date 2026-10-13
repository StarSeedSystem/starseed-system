// Resonancias: confianza de cada nodo y veredictos por consenso.
// Módulo puro, sin node:* ni Supabase ni window.

import type { Nivel } from "./centinela";

export const CONFIANZA_INICIAL = 0.5;

export interface VeredictoCompartido {
  hash: string;
  nivel: Nivel;
  nodo: string;
  cuenta: string;
  firmaOk: boolean;
  t: number;
}

export function actualizarConfianza(
  c: number,
  ev: 'firma-ok' | 'firma-mala' | 'trama-corrupta' | 'veredicto-confirmado' | 'veredicto-desmentido'
): number {
  let delta = 0;
  switch (ev) {
    case 'firma-ok':
      delta = 0.02;
      break;
    case 'firma-mala':
      delta = -0.3;
      break;
    case 'trama-corrupta':
      delta = -0.15;
      break;
    case 'veredicto-confirmado':
      delta = 0.05;
      break;
    case 'veredicto-desmentido':
      delta = -0.2;
      break;
  }
  const nuevo = c + delta;
  return Math.max(0, Math.min(1, nuevo));
}

export interface DecisionResonancia {
  decision: 'cuarentena' | 'aviso' | 'sin-datos' | 'limpio';
  cuentas: number;
  motivo: string;
}

export function decisionPorResonancia(
  hash: string,
  veredictos: VeredictoCompartido[],
  confianza: Record<string, number>,
  umbral = 0.4
): DecisionResonancia {
  // Filtra: firmaOk + confianza >= umbral + hash coincidente.
  const porNodo: Record<string, VeredictoCompartido> = {};
  for (const v of veredictos) {
    if (v.hash !== hash || !v.firmaOk) continue;
    const nodoConf = confianza[v.nodo] ?? 0;
    if (nodoConf < umbral) continue;
    const existente = porNodo[v.nodo];
    if (!existente || v.t > existente.t) porNodo[v.nodo] = v;
  }

  // Un voto por cuenta: el más reciente de cada cuenta.
  const porCuenta: Record<string, VeredictoCompartido> = {};
  for (const v of Object.values(porNodo)) {
    const existente = porCuenta[v.cuenta];
    if (!existente || v.t > existente.t) porCuenta[v.cuenta] = v;
  }

  const cuentas = Object.keys(porCuenta);
  const cuentasDistintas = cuentas.length;

  const cuentasPeligroso = cuentas.filter(
    c => porCuenta[c].nivel === 'peligroso'
  ).length;
  const cuentasSospechoso = cuentas.filter(
    c => porCuenta[c].nivel === 'sospechoso'
  ).length;
  const cuentasLimpio = cuentas.filter(
    c => porCuenta[c].nivel === 'limpio'
  ).length;

  if (cuentasDistintas === 0) return { decision: 'sin-datos', cuentas: 0, motivo: 'No hay veredictos válidos con confianza suficiente para este hash.' };

  if (cuentasPeligroso >= 2) {
    return { decision: 'cuarentena', cuentas: cuentasDistintas, motivo: `Cuarentena por consenso: ${cuentasPeligroso} cuentas distintas marcan peligroso.` };
  }

  if (cuentasPeligroso === 1 || cuentasSospechoso >= 2) {
    const motivo = cuentasPeligroso === 1 ? `Aviso: 1 cuenta marca peligroso.` : `Aviso: ${cuentasSospechoso} cuentas marcan sospechoso.`;
    return { decision: 'aviso', cuentas: cuentasDistintas, motivo };
  }

  if (cuentasLimpio >= 2 && cuentasPeligroso === 0) return { decision: 'limpio', cuentas: cuentasDistintas, motivo: `Limpio: ${cuentasLimpio} cuentas marcan limpio, ninguna peligroso.` };

  return { decision: 'sin-datos', cuentas: cuentasDistintas, motivo: 'No se alcanza consenso de cuarentena, aviso o limpio con los votos disponibles.' };
}
