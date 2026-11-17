// Evaluación de capa nueva contra la vigente (JLA1116A · architecture/jev-entrena-laya.md §6).
// Puro: sin red, sin disco, sin reloj. Determinista.

import type { CasoLaya } from "./aprendizaje-laya";

/** Estrato de decisión (capas de conciencia 1.58). */
export type Estrato =
  | "reflejo"
  | "juicio"
  | "memoria"
  | "palabra"
  | "razon"
  | "profunda"
  | "voz"
  | "adaptador";

/** Resultado por estrato de una capa evaluada. */
export interface ResultadoEstrato {
  /** Casos totales en el estrato. */
  readonly total: number;
  /** Acuerdos con el desenlace (0-1). */
  readonly acuerdo: number;
  /** "integrar" revertidos en este estrato. */
  readonly integrarRevertidos: number;
}

/** Capa evaluada con sus resultados por estrato. */
export interface CapaEvaluada {
  readonly nombre: string;
  readonly porEstrato: Readonly<Record<Estrato, ResultadoEstrato>>;
}

/** Entrada para evaluarCapa. */
export interface EntradaEvaluacion {
  /** Capa vigente (actual). */
  readonly vigente: CapaEvaluada;
  /** Capa candidata nueva. */
  readonly nueva: CapaEvaluada;
  /** Casos de reserva (20 % por huella, sin usar al construir). */
  readonly reserva: readonly CasoLaya[];
}

/** Salida de evaluarCapa. */
export interface SalidaEvaluacion {
  /** true si la nueva reemplaza a la vigente. */
  readonly reemplaza: boolean;
  /** Motivos (vacío si reemplaza; si no, por qué no). */
  readonly motivos: readonly string[];
}

/** Partición determinista 20 % reserva por huella del id. */
export function particion(ids: readonly string[]): readonly string[] {
  const reserva: string[] = [];
  for (const id of ids) {
    // FNV-1a 32-bit del id para decidir si cae en reserva (20 %)
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // 20 % = 0.2 → h / 2^32 < 0.2
    if (h < 0x33333333) {
      reserva.push(id);
    }
  }
  return Object.freeze(reserva);
}

/** Evalúa si una capa nueva reemplaza a la vigente según la reserva. */
export function evaluarCapa(entrada: EntradaEvaluacion): SalidaEvaluacion {
  const { vigente, nueva, reserva } = entrada;

  // 1. Verificar ≥ 1.000 casos en reserva
  if (reserva.length < 1000) {
    return { reemplaza: false, motivos: ["faltan datos"] };
  }

  // 2. Verificar distribución en estratos (todos los estratos deben tener casos)
  const estratos: Estrato[] = [
    "reflejo",
    "juicio",
    "memoria",
    "palabra",
    "razon",
    "profunda",
    "voz",
    "adaptador",
  ];

  for (const estrato of estratos) {
    if (nueva.porEstrato[estrato].total === 0 || vigente.porEstrato[estrato].total === 0) {
      return { reemplaza: false, motivos: [`faltan datos en estrato ${estrato}`] };
    }
  }

  // 3. La nueva no es peor en NINGÚN estrato y mejora en ALGUNO
  let mejoraEnAlguno = false;
  for (const estrato of estratos) {
    const acuerdoNueva = nueva.porEstrato[estrato].acuerdo;
    const acuerdoVigente = vigente.porEstrato[estrato].acuerdo;

    if (acuerdoNueva < acuerdoVigente) {
      return {
        reemplaza: false,
        motivos: [`peor en estrato ${estrato}: ${acuerdoNueva.toFixed(3)} < ${acuerdoVigente.toFixed(3)}`],
      };
    }
    if (acuerdoNueva > acuerdoVigente) {
      mejoraEnAlguno = true;
    }
  }

  if (!mejoraEnAlguno) {
    return { reemplaza: false, motivos: ["empate: no mejora en ningún estrato"] };
  }

  // 4. No deja pasar más "integrar" revertidos que la vigente
  let totalIntegrarRevertidosNueva = 0;
  let totalIntegrarRevertidosVigente = 0;
  for (const estrato of estratos) {
    totalIntegrarRevertidosNueva += nueva.porEstrato[estrato].integrarRevertidos;
    totalIntegrarRevertidosVigente += vigente.porEstrato[estrato].integrarRevertidos;
  }

  if (totalIntegrarRevertidosNueva > totalIntegrarRevertidosVigente) {
    return {
      reemplaza: false,
      motivos: [
        `más integrar revertidos: ${totalIntegrarRevertidosNueva} > ${totalIntegrarRevertidosVigente}`,
      ],
    };
  }

  // Todo pasa: la nueva reemplaza
  return { reemplaza: true, motivos: [] };
}