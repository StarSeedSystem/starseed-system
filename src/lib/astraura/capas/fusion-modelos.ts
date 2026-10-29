/**
 * Planificador de fusiones de modelos de Astraura (Ola 1025R).
 *
 * Decide según compatibilidad real: PEFT (`add_weighted_adapter`), mergekit como programa
 * externo (nunca importado) o ensamble de sistema cuando no hay fusión de pesos posible.
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

/** Atajo para un plan que no fusiona, con su motivo, bloqueos y pasos de ruta alternativa. */
function ninguna(bloqueos: string[], motivo: string, pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos };
}

const BLOQUEO_PRIVACIDAD = "lo privado no se mezcla con lo público ni con lo de otra persona";
const PASO_BANCO = "Pasar el banco de capas (`scripts/puente/capas_banco.py`).";

/* Regla 2: ámbitos o dueños distintos ⇒ nada. Regla 3: adaptadores de la misma base ⇒ PEFT. */
function adaptadoresDeUnaBase(c: Candidato[]): PlanFusion | null {
  const ambitos = new Set(c.map((x) => x.ambito));
  const duenos = new Set(c.filter((x) => x.dueno !== undefined).map((x) => x.dueno));
  if (ambitos.size > 1 || duenos.size > 1) {
    return ninguna([BLOQUEO_PRIVACIDAD], "Hay ámbitos o dueños distintos entre los candidatos.");
  }
  if (!c.every((x) => x.tipo === "adaptador")) return null;
  if (c[0].baseId === undefined || !c.every((x) => x.baseId === c[0].baseId)) return null;
  const dos = c.length === 2;
  return {
    estrategia: "adaptadores-ponderados", herramienta: "peft", metodo: dos ? "linear" : "ties",
    motivo: "Adaptadores de la misma base: los pondera `add_weighted_adapter` de PEFT (Apache-2.0).",
    pasos: ["Cargar la base común con sus adaptadores aplicados.",
      dos ? "Llamar a `add_weighted_adapter` con combination_type `linear` y pesos por candidato."
        : "Llamar a `add_weighted_adapter` con combination_type `ties` y densidad 0,5.", PASO_BANCO],
    bloqueos: [],
  };
}

const MOTIVO_ARQ = "no hay fusión de pesos entre arquitecturas distintas";

/* Reglas 4 y 5: Needle junto a otra arquitectura, o arquitecturas distintas ⇒ ensamble de sistema. */
function ensamblePorArquitectura(c: Candidato[]): PlanFusion | null {
  if (new Set(c.map((x) => x.arquitectura)).size <= 1) return null;
  const hayNeedle = c.some((x) => x.arquitectura.toLowerCase().startsWith("needle"));
  return {
    estrategia: "ensamble-sistema", herramienta: "sistema",
    motivo: hayNeedle
      ? "Needle solo se adapta con sus propios adaptadores de `needle finetune`."
      : MOTIVO_ARQ.charAt(0).toUpperCase() + MOTIVO_ARQ.slice(1) + ".",
    pasos: [
      "Ejecutar cada candidato como capa del ensamble de sistema (MoA en `src/ai/moa/runtime.ts`).",
      "Enrutar con la decisión híbrida (`src/lib/astraura/decision-hibrida.ts`) y la Trinidad.",
    ],
    bloqueos: hayNeedle ? [] : [MOTIVO_ARQ],
  };
}

/* Reglas 6 y 7: pesos de la misma arquitectura (adaptadores descargados antes con `merge_and_unload`). */
function fusionDePesos(c: Candidato[], mezclaAdaptadores: boolean): PlanFusion | null {
  const pesos = c.filter((x) => x.tipo === "pesos");
  if (pesos.length === 0) return null;
  const conVocab = pesos.filter((x) => x.vocab !== undefined);
  const base = pesos[0].parametrosB;
  const tamanoOk = pesos.every((x) => Math.abs(x.parametrosB - base) <= base * 0.01);
  const vocabOk = conVocab.length === 0 || conVocab.every((x) => x.vocab === conVocab[0].vocab);
  if (!tamanoOk || !vocabOk) {
    return ninguna(
      ["Tamaño o vocabulario distintos: mergekit exige la misma arquitectura y los mismos tamaños de tensor."],
      "Hay diferencia de tamaño de modelo o de vocabulario entre los candidatos.",
    );
  }
  if (pesos.some((x) => x.empaquetado !== "bf16")) {
    return ninguna(
      ["Los pesos ternarios empaquetados o en GGUF cuantizado no se fusionan: se fusiona en bf16 y se vuelve a cuantizar."],
      "Hay candidatos empaquetados o cuantizados; la ruta pasa por `*-unpacked` en bf16.",
      ["Descargar la variante `*-unpacked` en bf16 de los modelos no bf16.",
        "Fusionar en bf16 con mergekit y volver a cuantizar (Q2_0, PQ2_0, PTQ1_0).", PASO_BANCO],
    );
  }
  const metodo = pesos.length === 2 ? "slerp"
    : pesos[0].baseId !== undefined && pesos.every((x) => x.baseId === pesos[0].baseId)
      ? "ties" : "linear";
  const previos = mezclaAdaptadores
    ? ["Fusionar cada adaptador en su base con `merge_and_unload`."] : [];
  return {
    estrategia: "mergekit", herramienta: "mergekit", metodo,
    motivo: "Pesos bf16 de la misma arquitectura: mergekit los fusiona con " + metodo + ".",
    pasos: [...previos,
      "Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo.",
      "Pasar el banco de capas antes de promover."],
    bloqueos: [],
  };
}
export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) {
    return ninguna([], "Se necesitan al menos dos candidatos para fusionar.");
  }
  // Regla 6: con mezcla de adaptadores y pesos, se fusionan los adaptadores en sus bases antes.
  const mezcla = candidatos.some((c) => c.tipo === "adaptador");
  return adaptadoresDeUnaBase(candidatos) ?? ensamblePorArquitectura(candidatos) ??
    fusionDePesos(candidatos, mezcla) ?? ninguna([], "Sin estrategia de fusión para estos candidatos.");
}
