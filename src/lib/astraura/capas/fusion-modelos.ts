/**
 * Planificador puro de fusiones de modelos (Ola 1025R · capas de conciencia).
 * Decide entre PEFT (adaptadores ponderados), mergekit externo o ensamble de sistema
 * según la compatibilidad real; sin red y sin node:*: seguro de cliente.
 */
export interface Candidato {
  id: string; arquitectura: string; parametrosB: number;
  tipo: "pesos" | "adaptador";
  empaquetado: "bf16" | "ternario-empaquetado" | "gguf-cuantizado";
  baseId?: string; vocab?: number;
  ambito: "privado" | "ambito" | "publico"; dueno?: string;
}

export interface PlanFusion {
  estrategia: "adaptadores-ponderados" | "mergekit" | "ensamble-sistema" | "ninguna";
  herramienta: "peft" | "mergekit" | "sistema" | null; metodo?: string;
  motivo: string; pasos: string[]; bloqueos: string[];
}

const PASO_BANCO = "Pasar el banco de capas antes de promover (scripts/puente/capas_banco.py).";
const BLOQUEO_SOBERANIA = "lo privado no se mezcla con lo público ni con lo de otra persona";
const BLOQUEO_TENSOR = "mergekit exige la misma arquitectura y los mismos tamaños de tensor";
const PASO_ENSAMBLE =
  "Servir cada modelo por separado y combinar sus salidas con MoA (src/ai/moa/runtime.ts) y la decisión híbrida (src/lib/astraura/decision-hibrida.ts).";

function bloqueo(motivo: string, bloqueos: string[] = [], pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos };
}

export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) {
    return bloqueo("Menos de dos candidatos: no hay nada que fusionar.");
  }
  const ambitos = new Set(candidatos.map((c) => c.ambito));
  const duenos = new Set(candidatos.map((c) => c.dueno ?? ""));
  if (ambitos.size > 1 || duenos.size > 1) {
    return bloqueo("Fusión cancelada: los candidatos no comparten ámbito ni dueño.", [BLOQUEO_SOBERANIA]);
  }
  const arquitecturas = new Set(candidatos.map((c) => c.arquitectura.toLowerCase()));
  const todosAdaptadores = candidatos.every((c) => c.tipo === "adaptador");
  const baseComun = candidatos[0].baseId;
  const mismosBases = baseComun !== undefined && candidatos.every((c) => c.baseId === baseComun);
  if (todosAdaptadores && mismosBases) return planAdaptadores(candidatos);
  if (arquitecturas.size > 1) return planEnsamble(candidatos);
  if (todosAdaptadores) {
    return bloqueo("Adaptadores de la misma arquitectura pero de bases distintas o sin base declarada.", ["los adaptadores de PEFT exigen el mismo modelo base"]);
  }
  if (candidatos.some((c) => c.tipo === "adaptador")) {
    const sub = planFusion(candidatos.map((c) => (c.tipo === "adaptador" ? { ...c, tipo: "pesos" as const } : c)));
    return { ...sub, pasos: ["Fusionar cada adaptador en su base con merge_and_unload.", ...sub.pasos] };
  }
  return planPesos(candidatos, baseComun);
}

/** Todos los candidatos son adaptadores del mismo base: PEFT los pondera. */
function planAdaptadores(candidatos: Candidato[]): PlanFusion {
  const metodo = candidatos.length === 2 ? "linear" : "ties";
  const density = metodo === "ties" ? " y densidad 0,5" : "";
  return {
    estrategia: "adaptadores-ponderados", herramienta: "peft", metodo,
    motivo: metodo === "linear" ? "Dos adaptadores del mismo base: combinación lineal en PEFT."
      : `${candidatos.length} adaptadores del mismo base: TIES con densidad 0,5 en PEFT.`,
    pasos: [
      "Cargar el modelo base compartido con PEFT.",
      `Llamar a add_weighted_adapter con combination_type "${metodo}"${density}.`,
      PASO_BANCO,
    ],
    bloqueos: [],
  };
}

/** Arquitecturas distintas o Needle mezclado: no hay fusión de pesos de verdad. */
function planEnsamble(candidatos: Candidato[]): PlanFusion {
  const conNeedle = candidatos.some((c) => c.arquitectura.toLowerCase().startsWith("needle"));
  return {
    estrategia: "ensamble-sistema", herramienta: "sistema",
    motivo: conNeedle ? "Needle solo se adapta con sus propios adaptadores de needle finetune."
      : "no hay fusión de pesos entre arquitecturas distintas",
    pasos: conNeedle
      ? ["No fusionar pesos: la SAN escalonada de Needle no comparte tensores con otros motores.",
        PASO_ENSAMBLE]
      : ["Servir cada modelo por separado en el ensamble del sistema.", PASO_ENSAMBLE],
    bloqueos: [],
  };
}

/** Todo pesos y misma arquitectura: tamaños, vocab y empaquetado antes de mergekit. */
function planPesos(candidatos: Candidato[], baseComun: string | undefined): PlanFusion {
  const tamanos = candidatos.map((c) => c.parametrosB);
  const vocabs = new Set(candidatos.flatMap((c) => (c.vocab === undefined ? [] : [c.vocab])));
  if (Math.max(...tamanos) > Math.min(...tamanos) * 1.01 || vocabs.size > 1) {
    return bloqueo("Misma arquitectura pero tamaños o vocabulario distintos.", [BLOQUEO_TENSOR]);
  }
  if (candidatos.some((c) => c.empaquetado !== "bf16")) {
    return bloqueo(
      "Pesos empacados (ternario o GGUF) en la mezcla: no se fusionan tal cual.",
      ["los pesos ternarios empaquetados o en GGUF cuantizado no se fusionan; hay que pasar por bf16"],
      ["Descargar las variantes *-unpacked en bf16 de Hugging Face.",
        "Fusionar en bf16 y volver a cuantizar (ternario o GGUF) el resultado.", PASO_BANCO],
    );
  }
  const compartenBase = baseComun !== undefined && candidatos.every((c) => c.baseId === baseComun);
  const metodo = candidatos.length === 2 ? "slerp" : compartenBase ? "ties" : "linear";
  return {
    estrategia: "mergekit", herramienta: "mergekit", metodo,
    motivo: metodo === "slerp" ? "Dos modelos bf16 de la misma arquitectura y tamaño: SLERP en mergekit."
      : metodo === "ties" ? "Tres o más modelos bf16 del mismo base: TIES en mergekit."
        : "Modelos bf16 compatibles sin base común: fusión lineal en mergekit.",
    pasos: [
      `Escribir el YAML de mergekit con los modelos (${candidatos.map((c) => c.id).join(", ")}) y el método ${metodo}.`,
      "Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo.",
      PASO_BANCO,
    ],
    bloqueos: [],
  };
}
