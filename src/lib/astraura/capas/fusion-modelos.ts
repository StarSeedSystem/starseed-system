// Planificador de fusiones de modelos: PEFT, mergekit externo o ensamble de sistema.
// Módulo puro: sin red, sin disco y sin procesos; decide SOLO qué ruta aplica y por qué.

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

const MOTIVO_PRIVACIDAD = "lo privado no se mezcla con lo público ni con lo de otra persona";
const MOTIVO_ARQUITECTURAS = "no hay fusión de pesos entre arquitecturas distintas";
const PASO_MERGEKIT_EXTERNO =
  "ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo";
const PASO_BANCO = "pasar el banco de capas (`scripts/puente/capas_banco.py`) antes de promover";
const PASOS_RUTA_BF16 = [
  "descargar la variante `*-unpacked` (bf16) del modelo en Hugging Face",
  "fusionar los pesos en bf16 y recuantizar al formato de destino (Q2_0, PQ2_0 o PTQ1_0)",
  PASO_BANCO,
];
const PASOS_ENSAMBLE = [
  "ensamblar a nivel de sistema: MoA en `src/ai/moa/runtime.ts` (no hay fusión de pesos)",
  "elegir el sistema por tarea con la decisión híbrida (`src/lib/astraura/decision-hibrida.ts`)",
];

function ninguna(motivo: string, bloqueos: string[] = [], pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos };
}

function ambitosMezclados(candidatos: Candidato[]): boolean {
  const valores = new Set(candidatos.map((c) => c.ambito));
  const duenos = new Set(candidatos.map((c) => c.dueno ?? ""));
  return valores.size > 1 || duenos.size > 1;
}

function tamanosCompatibles(candidatos: Candidato[]): boolean {
  const referencia = candidatos[0].parametrosB;
  const dentroRango = candidatos.every(
    (c) =>
      Math.abs(c.parametrosB - referencia) <= 0.01 * Math.max(c.parametrosB, referencia),
  );
  const vocabularios = new Set(candidatos.flatMap((c) => (c.vocab === undefined ? [] : [c.vocab])));
  return dentroRango && vocabularios.size <= 1;
}

function ensambleDeSistema(motivo: string, bloqueos: string[] = []): PlanFusion {
  return { estrategia: "ensamble-sistema", herramienta: "sistema", motivo, pasos: PASOS_ENSAMBLE, bloqueos };
}

export function planFusion(candidatos: Candidato[]): PlanFusion {
  // Reglas 1 a 7 del contrato, aplicadas en este orden.
  if (candidatos.length < 2) return ninguna("la fusión necesita al menos dos candidatos");
  if (ambitosMezclados(candidatos)) return ninguna(MOTIVO_PRIVACIDAD, [MOTIVO_PRIVACIDAD]);
  const baseIdComun = candidatos[0].baseId;
  const compartenBase =
    candidatos.every(
      (c) => c.tipo === "adaptador" && c.baseId === baseIdComun,
    ) && typeof baseIdComun === "string";
  if (compartenBase) {
    const dos = candidatos.length === 2;
    const metodo = dos ? "linear" : "ties";
    return {
      estrategia: "adaptadores-ponderados",
      herramienta: "peft",
      metodo,
      motivo: "todos los candidatos son adaptadores del mismo modelo base",
      pasos: [
        `cargar el modelo base \`${baseIdComun as string}\``,
        `\`add_weighted_adapter\` con combination_type ${metodo}${dos ? "" : " (densidad 0,5)"}`,
        PASO_BANCO,
      ],
      bloqueos: [],
    };
  }
  // Adaptadores de bases distintas no son pesos fusionables: PEFT exige la misma base.
  if (candidatos.every((c) => c.tipo === "adaptador"))
    return ninguna(
      "los adaptadores no se fusionan entre sí: PEFT exige el mismo modelo base",
      ["adaptadores con modelos base distintos o sin baseId declarado"],
    );
  // Needle solo se adapta con sus propios adaptadores de `needle finetune`.
  const esNeedle = (c: Candidato) => c.arquitectura.startsWith("needle");
  if (candidatos.some(esNeedle) && candidatos.some((c) => !esNeedle(c))) {
    const nota = "Needle solo se adapta con sus propios adaptadores de `needle finetune`";
    return ensambleDeSistema(`${MOTIVO_ARQUITECTURAS}: ${nota}`, [nota]);
  }
  if (new Set(candidatos.map((c) => c.arquitectura)).size > 1) {
    return ensambleDeSistema(MOTIVO_ARQUITECTURAS);
  }
  const pasosPrevios =
    candidatos.some((c) => c.tipo === "adaptador") && candidatos.some((c) => c.tipo === "pesos")
      ? ["fusionar cada adaptador en su base con `merge_and_unload`"]
      : [];
  if (!tamanosCompatibles(candidatos))
    return ninguna(
      "tamaños o vocab distintos: mergekit exige la misma arquitectura y los mismos tamaños de tensor",
      ["parámetros o vocab del candidato fuera del ±1 % del resto"],
      [...pasosPrevios],
    );
  const noBf16 = candidatos.find((c) => c.empaquetado !== "bf16");
  if (noBf16)
    return ninguna(
      "los pesos ternarios empaquetados o GGUF cuantizados (Q2_0, PQ2_0, PTQ1_0) no se fusionan",
      [
        `el candidato ${noBf16.id} no está en bf16: cada uno desde su ruta \`*-unpacked\` + recuantizar`,
      ],
      [...pasosPrevios, ...PASOS_RUTA_BF16],
    );
  const n = candidatos.length;
  const mismoBase = typeof baseIdComun === "string" && n >= 3 && candidatos.every((c) => c.baseId === baseIdComun);
  return {
    estrategia: "mergekit",
    herramienta: "mergekit",
    metodo: n === 2 ? "slerp" : mismoBase ? "ties" : "linear",
    motivo: "pesos bf16 de la misma arquitectura, tamaño y vocabulario",
    pasos: [...pasosPrevios, PASO_MERGEKIT_EXTERNO, PASO_BANCO],
    bloqueos: [],
  };
}