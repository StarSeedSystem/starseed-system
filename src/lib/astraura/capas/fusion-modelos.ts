/**
 * Planificador de fusiones de modelos de la capa de conciencia.
 * Hecho verificado (2026-10-25): transformers v5.20.2 (Apache-2.0) NO fusiona
 * modelos. Las herramientas reales son PEFT (v0.21.2, Apache-2.0), que fusiona
 * adaptadores ponderados sobre el MISMO modelo base, y mergekit (0.1.5,
 * LGPL-3.0) solo como programa externo de línea de órdenes, nunca importado.
 * Entre arquitecturas distintas no hay fusión de pesos (MoA + decisión híbrida).
 */

export interface Candidato {
  id: string;
  arquitectura: string;
  parametrosB: number;
  tipo: "pesos" | "adaptador";
  empaquetado: "bf16" | "ternario-empaquetado" | "gguf-cuantizado";
  baseId?: string;
  vocab?: number;
  ambito: "privado" | "ambito" | "publico";
  dueno?: string;
}

export interface PlanFusion {
  estrategia: "adaptadores-ponderados" | "mergekit" | "ensamble-sistema" | "ninguna";
  herramienta: "peft" | "mergekit" | "sistema" | null;
  metodo?: string;
  motivo: string;
  pasos: string[];
  bloqueos: string[];
}

/** Freno de tamaño: mergekit exige la misma arquitectura y los mismos tamaños
 * de tensor (parámetros dentro de ±1 %). */
const TOLERANCIA = 0.01;
const BLOQUEO_AMBITO = "lo privado no se mezcla con lo público ni con lo de otra persona";

const RUTA_BF16 = [
  "Traer las variantes *-unpacked de Hugging Face (bf16) y fusionar en bf16",
  "Recuantizar el modelo fusionado (Q2_0, PQ2_0, PTQ1_0 o el formato de la capa)",
  "Pasar el banco de capas con scripts/puente/capas_banco.py",
];
const PASOS_MERGEKIT = [
  "Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo",
  "Pasar el banco de capas antes de promover (scripts/puente/capas_banco.py)",
];
const PASOS_ENSAMBLE = [
  "Ensamble de sistema: enrutar entre los candidatos con MoA (src/ai/moa/runtime.ts) y la decisión híbrida (src/lib/astraura/decision-hibrida.ts)",
];

function plan(estrategia: PlanFusion["estrategia"], herramienta: PlanFusion["herramienta"],
  metodo: string | undefined, motivo: string, pasos: string[], bloqueos: string[] = []): PlanFusion {
  return { estrategia, herramienta, motivo, pasos, bloqueos, ...(metodo ? { metodo } : {}) };
}
const planNada = (motivo: string, bloqueos: string[] = [], pasos: string[] = []): PlanFusion =>
  plan("ninguna", null, undefined, motivo, pasos, bloqueos);

function planPesos(c: Candidato[], pasosPrevios: string[]): PlanFusion {
  const maxB = Math.max(...c.map((x) => x.parametrosB));
  const minB = Math.min(...c.map((x) => x.parametrosB));
  const mismoTam = maxB === minB || (maxB - minB) / maxB <= TOLERANCIA;
  const mismoVocab = new Set(c.map((x) => x.vocab)).size <= 1;
  if (!mismoTam || !mismoVocab) {
    return planNada("Tamaños de tensor o vocabulario distintos: mergekit exige coincidencia exacta.",
      ["tamaños de tensor o vocabulario distintos"]);
  }
  if (!c.every((x) => x.empaquetado === "bf16")) {
    return planNada("Los pesos ternarios empaquetados o GGUF cuantizados no se fusionan: se fusiona en bf16 y se vuelve a cuantizar.",
      ["empaquetado distinto de bf16"], [...pasosPrevios, ...RUTA_BF16]);
  }
  const dos = c.length === 2;
  const conTies = !dos && c.every((x) => x.baseId !== undefined) && new Set(c.map((x) => x.baseId)).size === 1;
  const metodo = dos ? "slerp" : conTies ? "ties" : "linear";
  return plan("mergekit", "mergekit", metodo,
    `Mismo base, tamaños y vocab: fusión de pesos con mergekit método ${metodo}${dos ? " (slerp de 2)" : conTies ? " (comparten baseId)" : ""}.`,
    [...pasosPrevios, `Configurar el yaml de mergekit con el método ${metodo}`, ...PASOS_MERGEKIT]);
}

/** Adaptadores ponderados con PEFT: `ties` (≥ 3) usa densidad 0,5. */
const pasosPeft = (metodo: string) => [
  "Cargar el modelo base que comparten los adaptadores con transformers",
  `add_weighted_adapter con combination_type ${metodo}${metodo === "ties" ? " y densidad 0,5" : ""}`,
  "Pasar el resultado al banco de capas con scripts/puente/capas_banco.py",
];

export function planFusion(candidatos: Candidato[]): PlanFusion {
  const c = candidatos;
  // Regla 1: menos de 2 candidatos no hay nada que fusionar.
  if (c.length < 2) return planNada("Hacen falta al menos dos candidatos para planear una fusión.");
  // Regla 2: ámbitos o dueños distintos, nada se mezcla.
  if (new Set(c.map((x) => x.ambito)).size > 1 || new Set(c.map((x) => x.dueno)).size > 1) {
    return planNada("Ámbitos o dueños distintos.", [BLOQUEO_AMBITO]);
  }
  const mismoBaseId = c.every((x) => x.baseId !== undefined) && new Set(c.map((x) => x.baseId)).size === 1;
  // Regla 3: todos adaptadores del mismo base ⇒ fusión ponderada con PEFT.
  if (c.every((x) => x.tipo === "adaptador") && mismoBaseId) {
    const metodo = c.length === 2 ? "linear" : "ties";
    return plan("adaptadores-ponderados", "peft", metodo,
      `${c.length} adaptadores sobre el mismo base: fusión ponderada con PEFT.`, pasosPeft(metodo));
  }
  // Reglas 4 y 5: arquitecturas distintas ⇒ ensamble de sistema.
  if (new Set(c.map((x) => x.arquitectura)).size > 1) {
    if (c.some((x) => x.arquitectura.toLowerCase().startsWith("needle"))) {
      return plan("ensamble-sistema", "sistema", undefined,
        "Needle no fusiona pesos con otras arquitecturas: solo se adapta con sus propios adaptadores de needle finetune.",
        [...PASOS_ENSAMBLE, "Needle participa con sus propios adaptadores de needle finetune"]);
    }
    return plan("ensamble-sistema", "sistema", undefined,
      "no hay fusión de pesos entre arquitecturas distintas", PASOS_ENSAMBLE);
  }
  // Regla 6: adaptadores de bases distintas van cada uno con su base (ensamble).
  if (c.every((x) => x.tipo === "adaptador")) {
    return plan("ensamble-sistema", "sistema", undefined,
      "adaptadores de bases distintas: cada base lleva su propio adaptador.", PASOS_ENSAMBLE);
  }
  // Regla 7: adaptadores + pesos ⇒ fusionar cada adaptador en su base con
  // merge_and_unload y seguir como si todo fueran pesos.
  const pasos = c.every((x) => x.tipo === "pesos") ? [] :
    ["Fusionar cada adaptador en su base con merge_and_unload"];
  return planPesos(c, pasos);
}
