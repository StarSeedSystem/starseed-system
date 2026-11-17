// Evaluación de una capa nueva frente a la vigente sobre una reserva de casos (JLA1116A §6).
// PURA: sin red, sin disco, sin reloj.
import type { Capa } from "@/lib/astraura/capas/catalogo";

/** Estrato de decisión (capa + ámbito + punto). */
export interface Estrato {
  readonly capa: Capa;
  readonly ambito: string;
  readonly punto: string;
}

/** Resultado de un caso en la reserva: desenlace real. */
export type Desenlace = "aceptada" | "corregida" | "escalada" | "integrada-revertida";

/** Caso de la reserva con su desenlace conocido. */
export interface CasoReserva {
  readonly id: string;
  readonly estrato: Estrato;
  readonly desenlace: Desenlace;
}

/** Decisión de una capa sobre un caso. */
export interface DecisionCapa {
  readonly casoId: string;
  readonly acepta: boolean; // true = deja pasar (integrar), false = bloquea/escalada
}

/** Capa evaluada: función que decide sobre casos. */
export type CapaEvaluada = (casos: readonly CasoReserva[]) => readonly DecisionCapa[];

/** Métricas por estrato. */
export interface MetricasEstrato {
  readonly estrato: Estrato;
  readonly total: number;
  /** Casos que la capa deja pasar y eran "integrada-revertida" (falsos positivos). */
  readonly falsosPositivos: number;
  /** Casos que la capa bloquea y eran "aceptada" (falsos negativos). */
  readonly falsosNegativos: number;
  /** Acuerdo con el desenlace (0-1). */
  readonly acuerdo: number;
}

/** Resultado de evaluar una capa sobre la reserva. */
export interface EvaluacionCapa {
  readonly porEstrato: readonly MetricasEstrato[];
  readonly totalCasos: number;
  readonly acuerdoGlobal: number;
  readonly falsosPositivosGlobal: number;
}

/** Parámetros de evaluación. */
export interface EvaluarCapaParams {
  readonly vigente: CapaEvaluada;
  readonly nueva: CapaEvaluada;
  readonly reserva: readonly CasoReserva[];
}

/** Resultado de la evaluación comparativa. */
export interface ResultadoEvaluarCapa {
  readonly reemplaza: boolean;
  readonly motivos: readonly string[];
}

/** Huella determinista de 32 bits (FNV-1a) para partición estable. */
function huella32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Particiona IDs en reserva (20 %) y entrenamiento (80 %) por huella determinista.
 * No usa aleatoriedad: el mismo ID siempre cae en la misma partición.
 */
export function particion(ids: readonly string[]): { readonly reserva: readonly string[]; readonly entrenamiento: readonly string[] } {
  const reserva: string[] = [];
  const entrenamiento: string[] = [];
  for (const id of ids) {
    const h = huella32(id);
    // 20 % = 1 de cada 5 valores de huella (0-4 de cada 20, aprox)
    if ((h % 5) === 0) {
      reserva.push(id);
    } else {
      entrenamiento.push(id);
    }
  }
  return { reserva, entrenamiento };
}

/**
 * Evalúa una capa sobre la reserva y devuelve métricas por estrato y globales.
 */
function evaluarCapaInterna(capa: CapaEvaluada, reserva: readonly CasoReserva[]): EvaluacionCapa {
  const decisiones = capa(reserva);
  const porEstratoMap = new Map<string, MetricasEstrato>();

  for (let i = 0; i < reserva.length; i++) {
    const caso = reserva[i];
    const decision = decisiones[i];
    const clave = `${caso.estrato.capa}|${caso.estrato.ambito}|${caso.estrato.punto}`;

    let m = porEstratoMap.get(clave);
    if (!m) {
      m = {
        estrato: caso.estrato,
        total: 0,
        falsosPositivos: 0,
        falsosNegativos: 0,
        acuerdo: 0,
      };
      porEstratoMap.set(clave, m);
    }

    m.total++;
    const esRevertida = caso.desenlace === "integrada-revertida";
    const esAceptada = caso.desenlace === "aceptada";

    if (decision.acepta && esRevertida) m.falsosPositivos++;
    if (!decision.acepta && esAceptada) m.falsosNegativos++;

    const acierta = (decision.acepta && !esRevertida) || (!decision.acepta && (esRevertida || caso.desenlace === "corregida" || caso.desenlace === "escalada"));
    if (acierta) m.acuerdo++;
  }

  const porEstrato: MetricasEstrato[] = [];
  for (const m of porEstratoMap.values()) {
    porEstrato.push({
      ...m,
      acuerdo: m.total > 0 ? m.acuerdo / m.total : 0,
    });
  }

  const totalCasos = reserva.length;
  const aciertosTotales = porEstrato.reduce((sum, m) => sum + Math.round(m.acuerdo * m.total), 0);
  const falsosPositivosGlobal = porEstrato.reduce((sum, m) => sum + m.falsosPositivos, 0);

  return {
    porEstrato,
    totalCasos,
    acuerdoGlobal: totalCasos > 0 ? aciertosTotales / totalCasos : 0,
    falsosPositivosGlobal,
  };
}

/**
 * Evalúa si una capa nueva reemplaza a la vigente según los criterios de JLA1116A §6.
 * 
 * Criterios de reemplazo:
 * 1. Hay ≥ 1.000 casos de reserva repartidos en estratos (si no, "faltan datos")
 * 2. La nueva NO es peor en NINGÚN estrato (acuerdo no baja) y MEJORA en al menos uno
 * 3. No deja pasar más "integrada-revertida" (falsos positivos) que la vigente
 */
export function evaluarCapa({ vigente, nueva, reserva }: EvaluarCapaParams): ResultadoEvaluarCapa {
  const motivos: string[] = [];

  // 1. Verificar datos mínimos: ≥ 1.000 casos en reserva
  if (reserva.length < 1000) {
    return { reemplaza: false, motivos: ["faltan datos"] };
  }

  // Verificar que hay casos en al menos 2 estratos (repartidos)
  const estratosUnicos = new Set(reserva.map((c) => `${c.estrato.capa}|${c.estrato.ambito}|${c.estrato.punto}`));
  if (estratosUnicos.size < 2) {
    motivos.push("estratos insuficientes");
  }

  // Evaluar ambas capas
  const evalVigente = evaluarCapaInterna(vigente, reserva);
  const evalNueva = evaluarCapaInterna(nueva, reserva);

  // 2. No peor en NINGÚN estrato y mejora en al menos uno
  let mejoraEnAlguno = false;
  let peorEnAlguno = false;

  for (const estrato of evalNueva.porEstrato) {
    const vig = evalVigente.porEstrato.find((v) =>
      v.estrato.capa === estrato.estrato.capa &&
      v.estrato.ambito === estrato.estrato.ambito &&
      v.estrato.punto === estrato.estrato.punto
    );

    if (!vig) continue; // estrato solo en nueva, no comparar

    if (estrato.acuerdo < vig.acuerdo - 1e-9) {
      peorEnAlguno = true;
      motivos.push(`peor en ${estrato.estrato.capa}.${estrato.estrato.ambito}.${estrato.estrato.punto}`);
    } else if (estrato.acuerdo > vig.acuerdo + 1e-9) {
      mejoraEnAlguno = true;
    }
  }

  if (peorEnAlguno) {
    return { reemplaza: false, motivos };
  }

  if (!mejoraEnAlguno) {
    motivos.push("empate: no mejora en ningún estrato");
    return { reemplaza: false, motivos };
  }

  // 3. No más falsos positivos (integrada-revertida que deja pasar) que la vigente
  if (evalNueva.falsosPositivosGlobal > evalVigente.falsosPositivosGlobal) {
    motivos.push("más integradas revertidas que la vigente");
    return { reemplaza: false, motivos };
  }

  // Todos los criterios cumplidos
  return { reemplaza: true, motivos: ["mejora sin regresión"] };
}