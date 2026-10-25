/** Plan de fusión de modelos: adaptadores PEFT, mergekit externo o ensamble de sistema según la
 * compatibilidad real. Función pura: sin red, disco ni procesos; lo externo solo se describe. */
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
const BLOQUEO_AMBITO = "lo privado no se mezcla con lo público ni con lo de otra persona";
const BANCO = "Pasar el banco de capas (scripts/puente/capas_banco.py).";
const MERGEKIT_EXTERNO = "Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo.";
function ninguna(motivo: string, bloqueos: string[], pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, bloqueos, pasos };
}
/** Regla 2: un solo ámbito y, en lo privado y lo de ámbito, un solo dueño. */
function mismoAmbito(candidatos: readonly Candidato[]): boolean {
  return new Set(candidatos.map((c) => c.ambito)).size === 1 && !["privado", "ambito"].some((nivel) => {
    const grupo = candidatos.filter((c) => c.ambito === nivel);
    return grupo.length > 0 && new Set(grupo.map((c) => c.dueno)).size > 1;
  });
}
/** Reglas 4 y 5: sin fusión de pesos, cada modelo vive por su cuenta y el sistema combina. */
function ensamble(motivo: string): PlanFusion {
  return {
    estrategia: "ensamble-sistema",
    herramienta: "sistema",
    motivo,
    pasos: ["Servir cada modelo por su cuenta (local, nube ligera o backend de Astraura).",
      "Combinar las salidas por Mixture-of-Agents (src/ai/moa/runtime.ts).",
      "La decisión final la toma la decisión híbrida (src/lib/astraura/decision-hibrida.ts) y Trinidad."],
    bloqueos: [],
  };
}
/** Regla 7 sobre pesos homogéneos de la misma arquitectura (los adaptadores ya se bajaron). */
function planPesos(candidatos: readonly Candidato[]): PlanFusion {
  const arq = candidatos[0].arquitectura;
  const maxB = Math.max(...candidatos.map((c) => c.parametrosB));
  const minB = Math.min(...candidatos.map((c) => c.parametrosB));
  if ((maxB - minB) / (maxB || 1) > 0.01) {
    return ninguna(`Tamaños incompatibles en ${arq}: la fusión de pesos exige ±1 % de parámetros.`, [
      `parametrosB difiere más del 1 % (máximo ${maxB} B, mínimo ${minB} B).`]);
  }
  if (new Set(candidatos.flatMap((c) => (c.vocab === undefined ? [] : [c.vocab]))).size > 1) {
    return ninguna(`Vocabularios distintos en ${arq}: los tensores de cabecera no encajan.`,
      ["vocab difiere entre candidatos de la misma arquitectura."]);
  }
  if (candidatos.some((c) => c.empaquetado !== "bf16")) {
    return {
      estrategia: "ninguna",
      herramienta: null,
      motivo: `${arq} no se fusiona tal cual: los pesos ternarios empaquetados y el GGUF cuantizado no se fusionan;` +
        ` se fusiona en bf16, se vuelve a cuantizar y se pasa el banco.`,
      bloqueos: ["empaquetado distinto de bf16: hace falta la ruta bf16 *-unpacked antes de fusionar"],
      pasos: ["Descargar de Hugging Face la variante *-unpacked en bf16 del mismo modelo.", "Fusionar en bf16 y " +
        "volver a cuantizar al destino (Q2_0, PQ2_0 o PTQ1_0).", BANCO],
    };
  }
  const compartenBase = new Set(candidatos.map((c) => c.baseId)).size === 1 && candidatos[0].baseId !== undefined;
  const metodo = candidatos.length === 2 ? "slerp" : compartenBase ? "ties" : "linear";
  return {
    estrategia: "mergekit",
    herramienta: "mergekit", metodo,
    motivo: `Pesos bf16 de ${arq}${compartenBase ? " que comparten base" : ""}: fusión real de pesos con mergekit (${metodo}).`,
    pasos: [MERGEKIT_EXTERNO, "Pasar el banco de capas antes de promover."],
    bloqueos: [],
  };
}
/** Decide la estrategia de fusión de una tanda de candidatos, reglas 1 a 7 en orden. */
export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) { // Regla 1: sin pareja no hay fusión.
    return ninguna("Hace falta al menos un par de candidatos para pensar en fusionar modelos.", []);
  }
  if (!mismoAmbito(candidatos)) { // Regla 2: el ámbito y el dueño cortan antes de mirar arquitecturas.
    return ninguna(BLOQUEO_AMBITO, [BLOQUEO_AMBITO]);
  }
  const mismoTipo = new Set(candidatos.map((c) => c.tipo)).size === 1;
  const mismaArquitectura = new Set(candidatos.map((c) => c.arquitectura)).size === 1;
  const compartenBase = new Set(candidatos.map((c) => c.baseId)).size === 1 && candidatos[0].baseId !== undefined;
  if (mismoTipo && candidatos[0].tipo === "adaptador" && compartenBase) { // Regla 3: PEFT ponderado.
    const linear = candidatos.length === 2;
    return {
      estrategia: "adaptadores-ponderados",
      herramienta: "peft",
      metodo: linear ? "linear" : "ties",
      motivo: linear ? "Dos adaptadores de la misma base: combinación lineal ponderada en PEFT."
        : "Tres o más adaptadores de la misma base: combinación TIES con densidad 0,5 en PEFT.",
      pasos: ["Cargar la base con Transformers y montar encima el PEFT existente.",
        linear ? "add_weighted_adapter con combination_type linear y pesos equilibrados." : "add_weighted_adapter con " +
          `combination_type ties y densidad 0,5.`, BANCO],
      bloqueos: [],
    };
  }
  if (mismoTipo && candidatos[0].tipo === "adaptador") { // Adaptadores sin base común: no se tocan.
    return ninguna("Adaptadores de bases distintas no se combinan entre sí.",
      ["los adaptadores no comparten baseId, no hay base común que ponderar"]);
  }
  if (!mismaArquitectura) { // Reglas 4 y 5: arquitecturas distintas solo se combinan como sistema.
    return ensamble(candidatos.some((c) => c.arquitectura.toLowerCase().startsWith("needle"))
      ? "Needle solo se adapta con sus propios adaptadores de `needle finetune`; no se fusiona con pesos ajenos."
      : "No hay fusión de pesos entre arquitecturas distintas: se combate como sistema.");
  }
  if (!mismoTipo) { // Regla 6: regla 7 con el paso previo de bajar los adaptadores a pesos.
    const pesos = planPesos(candidatos);
    return { ...pesos, pasos: ["Fusionar cada adaptador en su base con `merge_and_unload` (PEFT).", ...pesos.pasos] };
  }
  return planPesos(candidatos); // Regla 7: todo pesos de la misma arquitectura.
}
