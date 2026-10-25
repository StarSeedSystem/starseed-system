/** Planificador de fusiones de modelos: PEFT, mergekit externo o ensamble de sistema.
 *  Puro: sin red, sin disco, sin node:*. Decide la ruta según compatibilidad real. */
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
const PASOS_MERGEKIT = [
  "ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo",
  "pasar el banco de capas antes de promover",
];
const PASOS_RUTA_BF16 = [
  "descargar las variantes *-unpacked de Hugging Face y fusionar en bf16",
  "recuantizar el modelo fusionado (ternario o GGUF) tras la fusión",
  "pasar el banco de capas antes de promover",
];
const ninguno = (motivo: string, bloqueos: string[] = [], pasos: string[] = []): PlanFusion => ({
  estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos,
});
const ensamble = (motivo: string, pasos: string[]): PlanFusion => ({
  estrategia: "ensamble-sistema", herramienta: "sistema", motivo, pasos, bloqueos: [],
});
/** Igualdad de ámbito y dueño: indefinido cuenta como indefinido. */
const mismoDueno = (a: Candidato, b: Candidato): boolean =>
  a.ambito === b.ambito && (a.dueno ?? "") === (b.dueno ?? "");
/** Todos comparten un baseId definido e igual. */
const mismaBaseDe = (cs: Candidato[]): boolean =>
  cs[0].baseId !== undefined && cs.every((c) => c.baseId === cs[0].baseId);
export function planFusion(candidatos: Candidato[]): PlanFusion {
  // Regla 1: con menos de dos candidatos no hay nada que fusionar.
  if (candidatos.length < 2) return ninguno("se necesitan al menos dos candidatos para pensar una fusión");
  const primero = candidatos[0];
  // Regla 2: lo privado no se mezcla con lo público ni con lo de otra persona.
  if (!candidatos.every((c) => mismoDueno(c, primero))) {
    return ninguno("los candidatos pertenecen a ámbitos o dueños distintos",
      ["lo privado no se mezcla con lo público ni con lo de otra persona"]);
  }
  const mismaArquitectura = candidatos.every((c) => c.arquitectura === primero.arquitectura);
  // Regla 3: adaptadores del mismo modelo base ⇒ PEFT.
  if (candidatos.every((c) => c.tipo === "adaptador") && mismaArquitectura) {
    return planAdaptadores(candidatos);
  }
  return fusionPesos(candidatos, mismaArquitectura);
}
function planAdaptadores(cs: Candidato[]): PlanFusion {
  const base = cs[0].baseId;
  if (base !== undefined && mismaBaseDe(cs)) {
    const metodo = cs.length === 2 ? "linear" : "ties";
    const densidad = cs.length >= 3 ? " (densidad 0,5)" : "";
    return {
      estrategia: "adaptadores-ponderados", herramienta: "peft", metodo,
      motivo: "adaptadores entrenados sobre el mismo modelo base: PEFT los pondera",
      pasos: [`cargar la base ${base} en bf16`,
        `add_weighted_adapter con combination_type ${metodo}${densidad}`,
        "pasar el banco de capas antes de promover"],
      bloqueos: [],
    };
  }
  return ensamble(
    "los adaptadores cuelgan de bases distintas: cada base con su adaptador ya es un sistema",
    ["desplegar cada base con su adaptador por separado",
      "combinar sus veredictos con MoA en src/ai/moa/runtime.ts"]);
}
function fusionPesos(cs: Candidato[], mismaArquitectura: boolean): PlanFusion {
  const arq = (c: Candidato) => c.arquitectura.toLowerCase();
  const hayNeedle = cs.some((c) => arq(c).startsWith("needle")),
    hayOtros = cs.some((c) => !arq(c).startsWith("needle"));
  // Regla 4: Needle solo se adapta con sus propios adaptadores de «needle finetune».
  if (hayNeedle && hayOtros) {
    return ensamble(
      "Needle solo se adapta con sus propios adaptadores de «needle finetune»: no se fusiona con otra arquitectura",
      ["desplegar Needle y el resto por separado",
        "combinar sus veredictos con MoA en src/ai/moa/runtime.ts y la decisión híbrida de src/lib/astraura/decision-hibrida.ts"]);
  }
  // Regla 5: no hay fusión de pesos entre arquitecturas distintas.
  if (!mismaArquitectura) {
    return ensamble("no hay fusión de pesos entre arquitecturas distintas",
      ["orquestar como ensamble de sistema: MoA en src/ai/moa/runtime.ts y la decisión híbrida de src/lib/astraura/decision-hibrida.ts"]);
  }
  // Regla 6: mezcla de adaptadores y pesos ⇒ fusionar primero cada adaptador en su base.
  const mezcla = cs.some((c) => c.tipo === "adaptador") && cs.some((c) => c.tipo === "pesos");
  return planMergekit(cs, mezcla ? ["fusionar cada adaptador en su base con merge_and_unload"] : []);
}
function planMergekit(cs: Candidato[], pasosPrevios: string[]): PlanFusion {
  const tamanos = cs.map((c) => c.parametrosB);
  const [minimo, maximo] = [Math.min(...tamanos), Math.max(...tamanos)];
  const vocab = cs.find((c) => c.vocab !== undefined);
  const vocabOk = vocab === undefined ||
    cs.every((c) => c.vocab === undefined || c.vocab === vocab.vocab);
  if (maximo > minimo * 1.01 || !vocabOk) {
    return ninguno("mismos pesos y arquitectura pero tamaños de tensor o vocabulario distintos",
      ["mergekit exige la misma arquitectura y los mismos tamaños de tensor"]);
  }
  const noBf16 = cs.find((c) => c.empaquetado !== "bf16");
  if (noBf16 !== undefined) {
    return ninguno(
      "los pesos ternarios empaquetados o GGUF cuantizado no se fusionan tal cual: se fusionan en bf16",
      [`pesos de ${noBf16.id} empaquetados: ${noBf16.empaquetado}`], PASOS_RUTA_BF16);
  }
  const metodo = cs.length === 2 ? "slerp" : cs.length >= 3 && mismaBaseDe(cs) ? "ties" : "linear";
  return {
    estrategia: "mergekit", herramienta: "mergekit", metodo,
    motivo: "misma arquitectura, tamaños compatibles y todo en bf16: fusión de pesos",
    pasos: [...pasosPrevios, ...PASOS_MERGEKIT], bloqueos: [],
  };
}
