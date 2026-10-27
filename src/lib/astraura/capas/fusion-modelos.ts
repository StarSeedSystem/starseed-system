/** Planificador de fusiones de modelos: PEFT, mergekit externo o ensamble de sistema. Puro. */

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

const PASOS_BANCO = "pasar el banco de capas antes de promover";
const PASOS_MERGEKIT = [
  "ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo",
  PASOS_BANCO,
];
const PASOS_BF16 = [
  "fusionar desde las variantes *-unpacked (bf16) de Hugging Face",
  "recuantizar a Q2_0, PQ2_0 o PTQ1_0",
  PASOS_BANCO,
];

/** Devuelve un plan sin fusión, con su motivo y sus bloqueos. */
function ninguna(motivo: string, bloqueos: string[], pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos };
}

/** Ensamble de sistema para cuando la fusión de pesos no existe. */
function ensamble(motivo: string, pasos: string[]): PlanFusion {
  return { estrategia: "ensamble-sistema", herramienta: "sistema", motivo, pasos, bloqueos: [] };
}

const PASOS_RUTEO = [
  "ensamblar por sistema: MoA en src/ai/moa/runtime.ts",
  "decidir con la decisión híbrida en src/lib/astraura/decision-hibrida.ts",
];

export function planFusion(candidatos: Candidato[]): PlanFusion {
  // Regla 1: con menos de dos candidatos no hay nada que fusionar.
  if (candidatos.length < 2) return ninguna("con menos de dos candidatos no hay fusión que planificar", []);
  // Regla 2: los ámbitos y los dueños deben coincidir para tocar los pesos.
  const ambitos = new Set(candidatos.map((c) => c.ambito));
  const duenos = new Set(candidatos.flatMap((c) => (c.dueno === undefined ? [] : [c.dueno])));
  if (ambitos.size > 1 || duenos.size > 1) {
    return ninguna("los ámbitos o los dueños no coinciden",
      ["lo privado no se mezcla con lo público ni con lo de otra persona"]);
  }
  // Regla 3: adaptadores del mismo modelo base se ponderan con PEFT.
  const bases = new Set(candidatos.map((c) => c.baseId));
  if (candidatos.every((c) => c.tipo === "adaptador") && bases.size === 1 && candidatos[0].baseId) {
    const metodo = candidatos.length === 2 ? "linear" : "ties (densidad 0,5)";
    return { estrategia: "adaptadores-ponderados", herramienta: "peft", metodo,
      motivo: "adaptadores del mismo modelo base con add_weighted_adapter",
      pasos: [`cargar la base ${candidatos[0].baseId}`, `add_weighted_adapter con ${metodo}`, PASOS_BANCO],
      bloqueos: [] };
  }
  const arquitecturas = new Set(candidatos.map((c) => c.arquitectura));
  // Regla 4: Needle solo se adapta con sus propios adaptadores de needle finetune.
  const hayNeedle = candidatos.some((c) => c.arquitectura.toLowerCase().startsWith("needle"));
  if (hayNeedle && arquitecturas.size > 1) {
    return ensamble("Needle solo se adapta con sus propios adaptadores de needle finetune",
      ["adaptar Needle con needle finetune", ...PASOS_RUTEO]);
  }
  // Regla 5: no hay fusión de pesos entre arquitecturas distintas.
  if (arquitecturas.size > 1) {
    return ensamble("no hay fusión de pesos entre arquitecturas distintas", PASOS_RUTEO);
  }
  return fusionMismaArquitectura(candidatos);
}

/** Reglas 6 y 7: misma arquitectura ⇒ mergekit (con o sin adaptadores previos). */
function fusionMismaArquitectura(candidatos: Candidato[]): PlanFusion {
  // Regla 6: los adaptadores se funden primero en su base con merge_and_unload.
  const previos = candidatos.some((c) => c.tipo === "adaptador")
    ? ["fusionar cada adaptador en su base con merge_and_unload"]
    : [];
  // Regla 7: los tamaños de tensor y los vocabularios deben coincidir.
  const parametros = candidatos.map((c) => c.parametrosB);
  const maximo = Math.max(...parametros);
  if (maximo - Math.min(...parametros) > maximo * 0.01) {
    return ninguna("mergekit exige la misma arquitectura y los mismos tamaños de tensor",
      ["tamaños de tensor distintos: los parámetros no caben en un ±1 %"]);
  }
  const vocabularios = new Set(candidatos.flatMap((c) => (c.vocab === undefined ? [] : [c.vocab])));
  if (vocabularios.size > 1) {
    return ninguna("mergekit exige el mismo vocabulario", ["vocabularios distintos"]);
  }
  // Los pesos ternarios empaquetados o en GGUF cuantizado no se fusionan: ruta bf16.
  if (candidatos.some((c) => c.empaquetado !== "bf16")) {
    return ninguna("los pesos ternarios empaquetados o en GGUF cuantizado no se fusionan: se va por la ruta bf16",
      ["fusión bloqueada: hay pesos que no llegan en bf16"], PASOS_BF16);
  }
  // Todo pesos, bf16, misma arquitectura, tamaño y vocab: mergekit externo.
  const metodo = metodoMergekit(candidatos);
  return {
    estrategia: "mergekit", herramienta: "mergekit", metodo,
    motivo: "mismos tamaños de tensor y vocabulario: fusión de peso a peso",
    pasos: [...previos, ...PASOS_MERGEKIT],
    bloqueos: [],
  };
}

/** slerp con 2; ties con 3 o más que comparten baseId; linear en cualquier otro caso. */
function metodoMergekit(candidatos: Candidato[]): string {
  if (candidatos.length === 2) return "slerp";
  const bases = new Set(candidatos.map((c) => c.baseId));
  return bases.size === 1 && candidatos[0].baseId !== undefined ? "ties" : "linear";
}


