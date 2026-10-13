// Malla cristalina SiO₂ amorfa: resonancias y confianza de nodos - Módulo puro: sin node:* ni Supabase ni window
export enum Nivel {
  PELIGROSO = 'peligroso',
  SOSPECHOSO = 'sospechoso',
  LIMPIO = 'limpio'
}

export interface VeredictoCompartido {
  hash: string;
  nivel: Nivel;
  nodo: string;
  cuenta: string;
  firmaOk: boolean;
  t: number; // timestamp
}

// Constantes
export const CONFIANZA_INICIAL = 0.5;

// Funciones puras
export function actualizarConfianza(
  c: number,
  ev: 'firma-ok' | 'firma-mala' | 'trama-corrupta' | 'veredicto-confirmado' | 'veredicto-desmentido'
): number {
  let incremento = 0;
  switch (ev) {
    case 'firma-ok':
      incremento = 0.02;
      break;
    case 'firma-mala':
      incremento = -0.3;
      break;
    case 'trama-corrupta':
      incremento = -0.15;
      break;
    case 'veredicto-confirmado':
      incremento = 0.05;
      break;
    case 'veredicto-desmentido':
      incremento = -0.2;
      break;
  }
  const nuevaConfianza = c + incremento;
  return Math.max(0, Math.min(1, nuevaConfianza));
}

export function decisionPorResonancia(
  hash: string,
  veredictos: VeredictoCompartido[],
  confianza: Record<string, number>,
  umbral = 0.4
): {decision: 'cuarentena' | 'aviso' | 'sin-datos' | 'limpio'; cuentas: number; motivo: string} {
  // Filtrar veredictos válidos: firmaOk y confianza del nodo >= umbral
  const veredictosValidos = veredictos
    .filter(v => v.firmaOk && (confianza[v.nodo] ?? 0) >= umbral);

  // Agrupar por cuenta, manteniendo solo el más reciente (mayor t)
  const veredictosPorCuenta = new Map<string, VeredictoCompartido>();
  for (const v of veredictosValidos) {
    const existente = veredictosPorCuenta.get(v.cuenta);
    if (!existente || v.t > existente.t) {
      veredictosPorCuenta.set(v.cuenta, v);
    }
  }

  // Contar veredictos por nivel
  let peligrosos = 0;
  let sospechosos = 0;
  let limpios = 0;

  for (const v of veredictosPorCuenta.values()) {
    switch (v.nivel) {
      case Nivel.PELIGROSO:
        peligrosos++;
        break;
      case Nivel.SOSPECHOSO:
        sospechosos++;
        break;
      case Nivel.LIMPIO:
        limpios++;
        break;
    }
  }

  const totalCuentas = veredictosPorCuenta.size;

  // Aplicar reglas de decisión
  if (peligrosos >= 2) {
    return {
      decision: 'cuarentena',
      cuentas: totalCuentas,
      motivo: `${peligrosos} cuentas distintas reportaron peligroso`
    };
  }

  if (peligrosos >= 1 || sospechosos >= 2) {
    return {
      decision: 'aviso',
      cuentas: totalCuentas,
      motivo: peligrosos >= 1 
        ? `${peligrosos} cuenta(s) reportaron peligroso`
        : `${sospechosos} cuentas reportaron sospechoso`
    };
  }

  if (limpios >= 2 && peligrosos === 0) {
    return {
      decision: 'limpio',
      cuentas: totalCuentas,
      motivo: `${limpios} cuentas reportaron limpio y ninguna reportó peligroso`
    };
  }

  return {
    decision: 'sin-datos',
    cuentas: totalCuentas,
    motivo: 'No hay suficientes veredictos confiables para tomar una decisión'
  };
}