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

const BLOQUEO_PRIVADO = "lo privado no se mezcla con lo público ni con lo de otra persona";
const BLOQUEO_CUANTIZADO = "los pesos ternarios empaquetados o en GGUF cuantizado no se fusionan: se fusiona en bf16";
function ninguna(motivo: string, bloqueos: string[], pasos: string[] = []): PlanFusion {
  return { estrategia: "ninguna", herramienta: null, motivo, pasos, bloqueos };
}
function ensamble(motivo: string, pasos: string[]): PlanFusion {
  return { estrategia: "ensamble-sistema", herramienta: "sistema", motivo, pasos, bloqueos: [] };
}
function mismoAmbitoYDueno(c: Candidato[]): boolean {
  if (new Set(c.map((x) => x.ambito)).size > 1) return false;
  return new Set(c.flatMap((x) => (x.dueno === undefined ? [] : [x.dueno]))).size <= 1;
}
function mismoBase(c: Candidato[]): boolean {
  return c[0].baseId !== undefined && c.every((x) => x.baseId === c[0].baseId);
}
function arquitecturasDistintas(c: Candidato[]): boolean {
  return new Set(c.map((x) => x.arquitectura)).size > 1;
}
function tamanosCompatibles(c: Candidato[]): boolean {
  const base = c[0].parametrosB;
  return c.every((x) => Math.abs(x.parametrosB - base) <= Math.abs(base) * 0.01 + 1e-9);
}
function vocabsCompatibles(c: Candidato[]): boolean {
  return new Set(c.flatMap((x) => (x.vocab === undefined ? [] : [x.vocab]))).size <= 1;
}

function pasosEnsamble(needle: boolean): string[] {
  return [
    ...(needle ? ["adaptar cada variante de Needle con sus propios adaptadores de `needle finetune`"] : []),
    "enrutar cada petición al modelo adecuado con MoA (`src/ai/moa/runtime.ts`)",
    "resolver el desempate con la decisión híbrida (`src/lib/astraura/decision-hibrida.ts`) y la Trinidad",
  ];
}

export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) {
    return ninguna("Hacen falta al menos dos modelos o adaptadores para planificar una fusión.",
      ["hacen falta al menos dos candidatos"]);
  }
  if (!mismoAmbitoYDueno(candidatos)) {
    return ninguna("No se fusionan pesos entre ámbitos o dueños distintos.", [BLOQUEO_PRIVADO]);
  }
  const adaptadores = candidatos.filter((c) => c.tipo === "adaptador");
  const pesos = candidatos.filter((c) => c.tipo === "pesos");

  if (pesos.length === 0 && mismoBase(candidatos)) {
    const n = candidatos.length;
    return {
      estrategia: "adaptadores-ponderados", herramienta: "peft", metodo: n === 2 ? "linear" : "ties",
      motivo: `Los ${n} adaptadores comparten el modelo base ${candidatos[0].baseId}: PEFT los combina sin fusionar pesos.`,
      pasos: [
        "cargar la base con Transformers",
        n === 2 ? "combinar con `add_weighted_adapter` (linear)"
          : "combinar con `add_weighted_adapter` (ties, densidad 0,5)",
        "pasar el banco de capas antes de promover",
      ],
      bloqueos: [],
    };
  }

  const hayNeedle = candidatos.some((c) => c.arquitectura.trim().toLowerCase().startsWith("needle"));
  if (hayNeedle && arquitecturasDistintas(candidatos)) {
    return ensamble("Needle solo se adapta con sus propios adaptadores de `needle finetune`; " +
      "no se fusionan sus pesos con otra arquitectura.", pasosEnsamble(true));
  }
  if (arquitecturasDistintas(candidatos)) {
    return ensamble("no hay fusión de pesos entre arquitecturas distintas", pasosEnsamble(false));
  }

  const mixto = adaptadores.length > 0 && pesos.length > 0;
  if (!mixto && pesos.length !== candidatos.length) {
    return ninguna("Solo se fusionan adaptadores que comparten su modelo base con PEFT.",
      ["adaptadores con modelos base distintos"]);
  }
  if (!tamanosCompatibles(candidatos) || !vocabsCompatibles(candidatos)) {
    return ninguna("Solo se fusionan pesos del mismo tamaño (±1 %) y el mismo vocabulario.",
      ["tamaño de parámetros o vocabulario incompatibles"]);
  }
  if (candidatos.some((c) => c.empaquetado !== "bf16")) {
    return ninguna("Los pesos cuantizados no se fusionan directamente: hay que pasar por bf16.", [BLOQUEO_CUANTIZADO], [
      "partir de las variantes `*-unpacked` en bf16 de Hugging Face",
      "recuantizar el modelo fusionado",
      "pasar el banco de capas antes de promover",
    ]);
  }

  const n = candidatos.length;
  const metodo = n === 2 ? "slerp" : mismoBase(candidatos) ? "ties" : "linear";
  const pasos: string[] = [];
  if (mixto) pasos.push("fusionar cada adaptador en su base con `merge_and_unload`");
  pasos.push("ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo");
  pasos.push("pasar el banco de capas antes de promover");
  return {
    estrategia: "mergekit", herramienta: "mergekit", metodo,
    motivo: `Los ${n} pesos comparten arquitectura ${candidatos[0].arquitectura}, tamaño y vocabulario: se fusionan en bf16 con mergekit.`,
    pasos, bloqueos: [],
  };
}
