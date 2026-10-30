// Recetas YAML de LlamaFactory (hiyouga/LlamaFactory, Apache-2.0) para entrenar
// (SFT/KTO) y fusionar adaptadores LoRA/QLoRA. Módulo puro: sin red, sin disco.
import type { DestinoModelo } from "./dataset-llamafactory";

export type ModoAfinado = "lora16" | "qlora4" | "no-cabe";
export type Etapa = "sft" | "kto";
export type DondeEjecutar = "dispositivo-propio" | "gpu-gratuita-permitida";

export interface EleccionAfinado { modo: ModoAfinado; vramNecesariaGb: number; fuente: string }

export interface OpcionesEntrenamiento {
  ambito: string; destino: DestinoModelo; baseHf: string; parametrosB: number;
  vramGb: number; etapa: Etapa; dataset: string; plantilla: string;
}

export interface RecetaGenerada { ok: true; yaml: string; dondeEjecutar: DondeEjecutar; avisos: string[] }

export interface Fallo { ok: false; motivo: string }

export interface OpcionesFusion { ambito: string; baseHf: string; adaptadorDir: string; plantilla: string }

export interface RecetaFusionOk { ok: true; yaml: string }

const FUENTE = "README de LlamaFactory (estimación del autor)";
// Modelos ternarios, 1.58-bit y Needle no están registrados en LlamaFactory.
const TERNARIO = /bitnet|bonsai|needle|1\.58|ternary/i;
// Un base cuantizado no sirve para fusionar un adaptador.
const CUANTIZADO = /-(4bit|gguf|awq|gptq)$/i;

// Tabla de hardware del README: parámetros, VRAM de LoRA 16 y de QLoRA 4.
const TABLA: { b: number; lora16: number | null; qlora4: number }[] = [
  { b: 7, lora16: 16, qlora4: 6 },
  { b: 14, lora16: 32, qlora4: 12 },
  { b: 30, lora16: null, qlora4: 24 },
];

/** Ámbito → carpeta segura con solo `[a-z0-9-]`. */
export function sanearAmbito(ambito: string): string {
  const limpio = ambito.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return limpio || "general";
}

/** LoRA 16 o QLoRA 4 con la primera fila cuyos parámetros alcanzan al modelo. */
export function elegirAfinado(parametrosB: number, vramGb: number): EleccionAfinado {
  const fila = TABLA.find((f) => f.b >= parametrosB);
  if (!fila) return { modo: "no-cabe", vramNecesariaGb: Number.POSITIVE_INFINITY, fuente: FUENTE };
  if (fila.lora16 !== null && vramGb >= fila.lora16) return { modo: "lora16", vramNecesariaGb: fila.lora16, fuente: FUENTE };
  if (vramGb >= fila.qlora4) return { modo: "qlora4", vramNecesariaGb: fila.qlora4, fuente: FUENTE };
  return { modo: "no-cabe", vramNecesariaGb: fila.qlora4, fuente: FUENTE };
}

/** Receta YAML de `llamafactory-cli train` (siempre con trust_remote_code en false). */
export function recetaEntrenamiento(
  op: OpcionesEntrenamiento,
): RecetaGenerada | Fallo {
  if (TERNARIO.test(op.baseHf)) {
    return {
      ok: false,
      motivo:
        "LlamaFactory no registra modelos ternarios ni Needle: usar QVAC (LoRA sobre el GGUF ternario), onebitllms o `needle finetune`",
    };
  }
  if (!op.plantilla.trim()) return { ok: false, motivo: "falta plantilla de chat (template) para LlamaFactory" };
  const afinado = elegirAfinado(op.parametrosB, op.vramGb);
  if (afinado.modo === "no-cabe") {
    return {
      ok: false,
      motivo: `no cabe: ${op.parametrosB} B necesitan al menos ${afinado.vramNecesariaGb} GB de VRAM (hay ${op.vramGb})`,
    };
  }
  const dondeEjecutar: DondeEjecutar =
    op.destino === "privado" ? "dispositivo-propio" : "gpu-gratuita-permitida";
  const ambito = sanearAmbito(op.ambito);
  const lineas = [
    `model_name_or_path: ${op.baseHf}`,
    "trust_remote_code: false",
    `stage: ${op.etapa}`,
    "do_train: true",
    "finetuning_type: lora",
    "lora_rank: 16",
    "lora_target: all",
  ];
  if (afinado.modo === "qlora4") lineas.push("quantization_bit: 4");
  lineas.push(
    `dataset: ${op.dataset}`, `template: ${op.plantilla}`, "cutoff_len: 2048",
    `output_dir: saves/${ambito}/${op.etapa}-lora`,
    "logging_steps: 10", "save_steps: 500", "plot_loss: true",
    "overwrite_output_dir: true", "report_to: none",
    "per_device_train_batch_size: 1", "gradient_accumulation_steps: 8",
    "learning_rate: 1.0e-4", "num_train_epochs: 3.0",
    "lr_scheduler_type: cosine", "warmup_ratio: 0.1", "bf16: true",
  );
  if (op.etapa === "kto") lineas.push("pref_beta: 0.1");
  const avisos: string[] = [];
  if (afinado.modo === "qlora4") avisos.push("QLoRA 4 bits: fusionar después sobre el modelo base sin cuantizar.");
  if (dondeEjecutar === "gpu-gratuita-permitida") avisos.push("GPU ajena permitida solo con el corpus ya filtrado por paraLlamaFactory.");
  return { ok: true, yaml: `${lineas.join("\n")}\n`, dondeEjecutar, avisos };
}

/** Receta YAML de `llamafactory-cli export`: fusión sobre el base sin cuantizar. */
export function recetaFusion(op: OpcionesFusion): RecetaFusionOk | Fallo {
  if (CUANTIZADO.test(op.baseHf.trim())) {
    return { ok: false, motivo: "no se fusiona sobre un modelo cuantizado: usa el base en 16 bits" };
  }
  if (!op.plantilla.trim()) return { ok: false, motivo: "falta plantilla de chat (template) para LlamaFactory" };
  const yaml = [
    `model_name_or_path: ${op.baseHf}`,
    `adapter_name_or_path: ${op.adaptadorDir}`,
    `template: ${op.plantilla}`,
    "trust_remote_code: false",
    `export_dir: exports/${sanearAmbito(op.ambito)}`,
    "export_size: 2",
    "export_device: cpu",
    "export_legacy_format: false",
  ].join("\n");
  return { ok: true, yaml: `${yaml}\n` };
}
