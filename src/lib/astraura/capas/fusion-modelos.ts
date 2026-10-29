export interface Candidato {
  id: string
  arquitectura: string
  parametrosB: number
  tipo: "pesos" | "adaptador"
  empaquetado: "bf16" | "ternario-empaquetado" | "gguf-cuantizado"
  baseId?: string
  vocab?: number
  ambito: "privado" | "ambito" | "publico"
  dueno?: string
}

export interface PlanFusion {
  estrategia: "adaptadores-ponderados" | "mergekit" | "ensamble-sistema" | "ninguna"
  herramienta: "peft" | "mergekit" | "sistema" | null
  metodo?: string
  motivo: string
  pasos: string[]
  bloqueos: string[]
}

export function planFusion(candidatos: Candidato[]): PlanFusion {
  if (candidatos.length < 2) {
    return {
      estrategia: "ninguna",
      herramienta: null,
      motivo: "Se requieren al menos dos candidatos para evaluar una fusión.",
      pasos: [],
      bloqueos: ["Menos de 2 candidatos"]
    }
  }

  const primerAmbito = candidatos[0].ambito
  const primerDueno = candidatos[0].dueno
  for (const c of candidatos) {
    if (c.ambito !== primerAmbito || c.dueno !== primerDueno) {
      return {
        estrategia: "ninguna",
        herramienta: null,
        motivo: "Lo privado no se mezcla con lo público ni con lo de otra persona.",
        pasos: [],
        bloqueos: ["Ámbitos o dueños distintos"]
      }
    }
  }

  const hayNeedle = candidatos.some((c) => c.arquitectura.toLowerCase().startsWith("needle"))
  const mismaArquet = candidatos.every((c) => c.arquitectura === candidatos[0].arquitectura)

  if (hayNeedle && !mismaArquet) {
    return {
      estrategia: "ensamble-sistema",
      herramienta: "sistema",
      motivo: "Needle solo se adapta con sus propios adaptadores de needle finetune y no se fusiona directamente con otras arquitecturas.",
      pasos: ["Aplicar MoA en src/ai/moa/runtime.ts", "Usar decisión híbrida en src/lib/astraura/decision-hibrida.ts"],
      bloqueos: []
    }
  }

  if (!mismaArquet) {
    return {
      estrategia: "ensamble-sistema",
      herramienta: "sistema",
      motivo: "No hay fusión de pesos entre arquitecturas distintas.",
      pasos: ["Configurar enrutamiento por MoA", "Aplicar decisión híbrida"],
      bloqueos: []
    }
  }

  const todosAdaptadores = candidatos.every((c) => c.tipo === "adaptador")
  const mismoBase = candidatos.every((c) => c.baseId && c.baseId === candidatos[0].baseId)

  if (todosAdaptadores && mismoBase) {
    const metodo = candidatos.length === 2 ? "linear" : "ties"
    const pasos = [
      "Cargar el modelo base especificado",
      "Aplicar add_weighted_adapter con combination_type correspondiente",
      "Pasar el banco de capas"
    ]
    return {
      estrategia: "adaptadores-ponderados",
      herramienta: "peft",
      metodo,
      motivo: "Todos son adaptadores con el mismo baseId.",
      pasos,
      bloqueos: []
    }
  }

  const mezclaAdaptadoresPesos = candidatos.some((c) => c.tipo === "adaptador") && candidatos.some((c) => c.tipo === "pesos")

  let candidatosParaProceso = [...candidatos]
  let pasosPrevios: string[] = []

  if (mezclaAdaptadoresPesos) {
    pasosPrevios = ["Fusionar cada adaptador en su base con merge_and_unload"]
    candidatosParaProceso = candidatosParaProceso.map((c) => ({
      ...c,
      tipo: "pesos" as const
    }))
  }

  const baseParametros = candidatosParaProceso[0].parametrosB
  const parametrosValidos = candidatosParaProceso.every(
    (c) => Math.abs(c.parametrosB - baseParametros) / baseParametros <= 0.01
  )

  const primerVocab = candidatosParaProceso[0].vocab
  const vocabValidos = candidatosParaProceso.every(
    (c) => primerVocab === undefined || c.vocab === undefined || c.vocab === primerVocab
  )

  if (!parametrosValidos || !vocabValidos) {
    return {
      estrategia: "ninguna",
      herramienta: null,
      motivo: "Los tamaños de parámetros o el vocabulario difieren fuera del rango permitido.",
      pasos: [],
      bloqueos: ["Tamaño o vocab distintos"]
    }
  }

  const algunNoBf16 = candidatosParaProceso.some((c) => c.empaquetado !== "bf16")

  if (algunNoBf16) {
    return {
      estrategia: "ninguna",
      herramienta: null,
      motivo: "Los pesos empaquetados o cuantizados no se fusionan directamente; requieren descompresión a bf16.",
      pasos: ["Descargar variantes unpacked bf16 de Hugging Face", "Recuantizar tras la fusión", "Pasar el banco de capas"],
      bloqueos: ["Empaquetado no bf16 detectado"]
    }
  }

  const metodoMerge =
    candidatosParaProceso.length === 2
      ? "slerp"
      : mismoBase
      ? "ties"
      : "linear"

  const pasos = [
    ...pasosPrevios,
    "Ejecutar mergekit como programa externo (LGPL-3.0), en una máquina con la RAM del modelo; no importarlo",
    "Pasar el banco de capas antes de promover"
  ]

  return {
    estrategia: "mergekit",
    herramienta: "mergekit",
    metodo: metodoMerge,
    motivo: "Todos son pesos compatibles en bf16 con la misma arquitectura y parámetros.",
    pasos,
    bloqueos: []
  }
}
