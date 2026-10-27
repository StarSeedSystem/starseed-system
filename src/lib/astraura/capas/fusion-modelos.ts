/**
 * Planificador de fusiones de modelos (Capas).
 * Puro: sin red, sin procesos, sin node:*.
 * Hecho verificado (2026-10-25): transformers no fusiona; PEFT fusiona
 * adaptadores del MISMO modelo base y mergekit (programa externo, LGPL-3.0)
 * fusiona pesos de la misma arquitectura. Lo demás es ensamble de sistema.
 */

export type Empaquetado = "bf16" | "ternario-empaquetado" | "gguf-cuantizado";

export interface Candidato {
  id: string;
  arquitectura: string;
  parametrosB: number;
  tipo: "pesos" | "adaptador";
  empaquetado: Empaquetado;
  baseId?: string;
  vocab?: number;
  ambito: "privado" | "ambito" | "publico";
  dueno?: string;
}

export interface PlanFusion {
  estrategia:
    | "adaptadores-ponderados"
    | "mergekit"
    | "ensamble-sistema"
    | "ninguna";
  herramienta: "peft" | "mergekit" | "sistema" | null;
  metodo?: string;
  motivo: string;
  pasos: string[];
  bloqueos: string[];
}

export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) {
    return nula("Hace falta al menos un par para pensar una fusión.");
  }
  if (!mismoAmbito(candidatos)) {
    return nula("Hace falta al menos un par para pensar una fusión.", [
      "lo privado no se mezcla con lo público ni con lo de otra persona",
    ]);
  }
  if (candidatos.every((c) => c.tipo === "adaptador")) {
    return planAdaptadores(candidatos);
  }
  if (
    candidatos.some((c) => canonica(c.arquitectura).startsWith("needle")) &&
    candidatos.some((c) => !canonica(c.arquitectura).startsWith("needle"))
  ) {
    return {
      estrategia: "ensamble-sistema",
      herramienta: "sistema",
      motivo:
        "Needle solo se adapta con sus propios adaptadores de «needle finetune»; con otras arquitecturas no hay fusión de pesos.",
      pasos: [
        "cada Needle sigue su camino con adaptadores propios de «needle finetune»",
        "combinar por ensamble de sistema: MoA en src/ai/moa/runtime.ts",
        "la elección por turno vive en src/lib/astraura/decision-hibrida.ts",
      ],
      bloqueos: [],
    };
  }
  const arquitecturas = new Set(candidatos.map((c) => canonica(c.arquitectura)));
  if (arquitecturas.size > 1) {
    return {
      estrategia: "ensamble-sistema",
      herramienta: "sistema",
      motivo: "no hay fusión de pesos entre arquitecturas distintas",
      pasos: [
        "resolver entre arquitecturas por ensamble de sistema: MoA en src/ai/moa/runtime.ts",
        "la decisión híbrida de cada turno vive en src/lib/astraura/decision-hibrida.ts",
      ],
      bloqueos: [],
    };
  }
  const pasoPrevio =
    candidatos.some((c) => c.tipo === "adaptador") &&
    candidatos.some((c) => c.tipo === "pesos")
      ? "fusionar cada adaptador en su base con «merge_and_unload»"
      : null;
  return planPesos(candidatos, pasoPrevio);
}

function planAdaptadores(candidatos: Candidato[]): PlanFusion {
  const bases = new Set(candidatos.map((c) => c.baseId));
  if (bases.size !== 1) {
    return nula(
      "Los adaptadores se suman sobre el MISMO modelo base.",
      bases.has(undefined)
        ? ["todo adaptador debe declarar baseId"]
        : ["todos los adaptadores deben compartir baseId"],
    );
  }
  const base = candidatos[0].baseId ?? "";
  const metodo = metodoPeft(candidatos.length);
  const pasos = [
    `cargar la base ${base}`,
    `add_weighted_adapter con combination_type «${metodo}»${
      metodo === "ties" ? " y densidad 0,5" : ""
    } para fusionar los adaptadores`,
    "pasar el banco de capas (scripts/puente/capas_banco.py) antes de promover",
  ];
  return {
    estrategia: "adaptadores-ponderados",
    herramienta: "peft",
    metodo,
    motivo:
      candidatos.length === 2
        ? "dos adaptadores del mismo base se combinan linealmente con PEFT"
        : "tres o más adaptadores del mismo base se combinan con TIES en PEFT",
    pasos,
    bloqueos: [],
  };
}

function planPesos(candidatos: Candidato[], pasoPrevio: string | null): PlanFusion {
  const previos = pasoPrevio ? [pasoPrevio] : [];
  if (candidatos.some((c) => c.empaquetado !== "bf16")) {
    return {
      estrategia: "ninguna",
      herramienta: null,
      motivo:
        "los pesos ternarios empaquetados o cuantizados en GGUF no se fusionan tal cual",
      pasos: [
        ...previos,
        "descargar las variantes «-unpacked» en bf16 de Hugging Face",
        "fusionar en bf16 y volver a cuantizar después",
        "pasar el banco de capas antes de promover",
      ],
      bloqueos: [
        "los ternarios empaquetados o el GGUF cuantizado (Q2_0, PQ2_0, PTQ1_0) no se fusionan: primero bf16 «unpacked», se fusiona y se recuantiza",
      ],
    };
  }
  if (!mismosParametros(candidatos) || !mismoVocab(candidatos)) {
    return nula(
      "Arquitecturas iguales pero tamaños o vocabularios distintos no se fusionan.",
      ["mergekit exige la misma arquitectura y los mismos tamaños de tensor"],
    );
  }
  return {
    estrategia: "mergekit",
    herramienta: "mergekit",
    metodo: metodoMergekit(candidatos),
    motivo:
      "todos son pesos bf16 de la misma arquitectura y tamaño: sí se fusionan",
    pasos: [
      ...previos,
      "ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo",
      "pasar el banco de capas antes de promover",
    ],
    bloqueos: [],
  };
}

function canonica(arquitectura: string): string {
  return arquitectura.toLowerCase();
}

function nula(motivo: string, bloqueos: string[] = []): PlanFusion {
  return {
    estrategia: "ninguna",
    herramienta: null,
    motivo,
    pasos: [],
    bloqueos,
  };
}

function mismoAmbito(candidatos: Candidato[]): boolean {
  const primer = candidatos[0];
  return candidatos.every(
    (c) =>
      c.ambito === primer.ambito && (c.dueno ?? undefined) === (primer.dueno ?? undefined),
  );
}

function metodoPeft(n: number): "linear" | "ties" {
  return n === 2 ? "linear" : "ties";
}

function metodoMergekit(candidatos: Candidato[]): "slerp" | "ties" | "linear" {
  if (candidatos.length === 2) return "slerp";
  if (candidatos.length >= 3 && candidatos.every((c) => c.baseId)) {
    return "ties";
  }
  return "linear";
}

function mismosParametros(candidatos: Candidato[]): boolean {
  const base = candidatos[0].parametrosB;
  return candidatos.every(
    (c) => Math.abs(c.parametrosB - base) / Math.max(base, c.parametrosB) <= 0.01,
  );
}

function mismoVocab(candidatos: Candidato[]): boolean {
  const vocs = candidatos.map((c) => c.vocab).filter((v) => v !== undefined);
  return new Set(vocs).size <= 1;
}
