// Semilla del catálogo comparativo (MOD1110A · comprobada el 2026-11-10).
// SOLO builds normales de los editores. Cada cifra sale de dos fuentes vivas, leídas ese día:
//   · Ollama: https://ollama.com/library/<familia>/tags  (tamaño de descarga, contexto, entrada texto/imagen)
//             https://ollama.com/library/<familia>       (insignias tools / vision / thinking)
//   · Epoch AI: https://epoch.ai/data/eci_scores.csv     (Epoch Capabilities Index y fecha del modelo)
// Lo que NO se pudo contrastar queda con `puntuacion: null` y, si falla algo esencial, `sin-comprobar`.
// Los números de la página de terceros que inspiró el método se contrastaron y NO se copiaron a ciegas:
// donde Epoch daba otra cifra manda Epoch, y la «Qwen3.8 27B = 151,8» no aparece en Epoch (solo existe
// «Qwen3.8 Max», cerrado): queda sin puntuación.

import type { CatalogoModelos, ModeloLocal, Puntuacion, PuntoFrontera } from "./tipos";

export const FECHA_SEMILLA = "2026-11-10";
const OLLAMA = "https://ollama.com/library/";
const EPOCH = "https://epoch.ai/data/eci_scores.csv";

interface Base {
  id: string;
  familia: string;
  editor: string;
  descargaGb: number;
  contextoK: number;
  vision: boolean;
  herramientas: boolean;
  razonamiento: boolean;
  licencia?: string | null;
  eci?: [nombre: string, valor: number, fecha: string];
  soloApple?: boolean;
  nota?: string;
}

function punt(e: [string, number, string] | undefined): Puntuacion | null {
  if (!e) return null;
  return { eci: e[1], fecha: e[2], nombreEpoch: e[0], fuente: EPOCH, comprobado: FECHA_SEMILLA };
}

function m(b: Base): ModeloLocal {
  const fam = b.id.split(":")[0];
  return {
    id: b.id,
    etiqueta: b.id,
    familia: b.familia,
    editor: b.editor,
    clase: "normal",
    tipo: "estandar",
    runtimes: ["ollama"],
    soloApple: b.soloApple,
    descargaGb: b.descargaGb,
    contextoK: b.contextoK,
    herramientas: b.herramientas,
    vision: b.vision,
    razonamiento: b.razonamiento,
    licencia: b.licencia ?? null,
    puntuacion: punt(b.eci),
    eciNombre: b.eci?.[0],
    estado: "comprobado",
    comprobado: FECHA_SEMILLA,
    fuentes: b.eci ? [`${OLLAMA}${fam}/tags`, `${OLLAMA}${fam}`, EPOCH] : [`${OLLAMA}${fam}/tags`, `${OLLAMA}${fam}`],
    nota: b.nota,
  };
}

const Q = { familia: "Qwen3.5", editor: "Alibaba (Qwen)", contextoK: 256, vision: true, herramientas: true, razonamiento: true } as const;
const G = { familia: "Gemma 4", editor: "Google", vision: true, herramientas: true, razonamiento: true } as const;
const OSS = { familia: "gpt-oss", editor: "OpenAI", contextoK: 128, vision: false, herramientas: true, razonamiento: true } as const;
const LIBRE = "Pesos abiertos, uso sin restricción (según Epoch)";
const RESTRINGIDA = "Pesos abiertos, uso restringido (según Epoch)";

const Q9: [string, number, string] = ["Qwen3.5-9B", 139.35, "2026-02-24"];
const Q35: [string, number, string] = ["Qwen3.5-35B-A3B", 143.97, "2026-02-24"];

export const MODELOS_SEMILLA: ModeloLocal[] = [
  m({ ...Q, id: "qwen3.5:2b", descargaGb: 2.7 }),
  m({ ...Q, id: "qwen3.5:4b", descargaGb: 3.3 }),
  m({ ...Q, id: "qwen3.5:9b", descargaGb: 6.6, eci: Q9, licencia: RESTRINGIDA }),
  m({ ...Q, id: "qwen3.5:27b", descargaGb: 17 }),
  m({ ...Q, id: "qwen3.5:35b-a3b", descargaGb: 22, eci: Q35, licencia: LIBRE }),
  m({ ...Q, id: "qwen3.5:122b", descargaGb: 81 }),
  // Builds MLX (solo Apple silicon): mismos pesos, otra cuantización; se hereda la puntuación del modelo base.
  m({ ...Q, id: "qwen3.5:4b-mlx", descargaGb: 4.0, soloApple: true }),
  m({ ...Q, id: "qwen3.5:9b-mlx", descargaGb: 8.9, soloApple: true, eci: Q9, licencia: RESTRINGIDA, nota: "Puntuación del modelo base; la cuantización MLX puede variar un poco." }),
  m({ ...Q, id: "qwen3.5:35b-mlx", descargaGb: 22, soloApple: true, eci: Q35, licencia: LIBRE, nota: "Puntuación del modelo base; la cuantización MLX puede variar un poco." }),
  m({ ...G, id: "gemma4:e2b", contextoK: 128, descargaGb: 4.6 }),
  m({ ...G, id: "gemma4:e4b", contextoK: 128, descargaGb: 6.6 }),
  m({ ...G, id: "gemma4:12b", contextoK: 256, descargaGb: 7.7 }),
  m({ ...G, id: "gemma4:26b", contextoK: 256, descargaGb: 16, eci: ["Gemma 4 26B A4B", 141.7, "2026-04-02"], licencia: LIBRE }),
  m({ ...G, id: "gemma4:31b", contextoK: 256, descargaGb: 19, eci: ["Gemma 4 31B IT", 144.24, "2026-04-02"], licencia: RESTRINGIDA }),
  m({ ...OSS, id: "gpt-oss:20b", descargaGb: 14, eci: ["gpt-oss-20b", 135.04, "2025-08-05"], licencia: LIBRE }),
  m({ ...OSS, id: "gpt-oss:120b", descargaGb: 65, eci: ["gpt-oss-120b", 140.21, "2025-08-05"], licencia: LIBRE }),
  m({ id: "qwen3.8:27b", familia: "Qwen3.8", editor: "Alibaba (Qwen)", descargaGb: 18, contextoK: 256, vision: true, herramientas: true, razonamiento: true,
    nota: "Epoch no mide este modelo abierto (solo el «Qwen3.8 Max», cerrado): sin puntuación comparable." }),
  m({ id: "glm-4.7-flash", familia: "GLM-4.7 Flash", editor: "Z.ai (GLM)", descargaGb: 19, contextoK: 198, vision: false, herramientas: true, razonamiento: true }),
  m({ id: "deepseek-r1:8b", familia: "DeepSeek-R1 (destilado 0528 sobre Qwen3 8B)", editor: "DeepSeek", descargaGb: 5.2, contextoK: 128, vision: false, herramientas: true, razonamiento: true, licencia: "MIT (según la página de Ollama)" }),
  m({ id: "deepseek-r1:70b", familia: "DeepSeek-R1 (destilado sobre Llama 70B)", editor: "DeepSeek", descargaGb: 43, contextoK: 128, vision: false, herramientas: true, razonamiento: true, licencia: "MIT (según la página de Ollama)" }),
];

// ── «Variantes sin filtros» (MOD1110B · comprobadas el 2026-11-10) ───────────────────────────────────────────
// Clase APARTE y opcional. Son builds de la comunidad a los que un tercero (huihui_ai) les quitó los rechazos
// (técnica «abliteration»); NO son del editor del modelo. Cada entrada se contrastó el 2026-11-10 con la página viva
// de Ollama: que la etiqueta existe en https://ollama.com/huihui_ai/<familia>/tags (tamaño de descarga y contexto,
// que Ollama redondea a 2 cifras por encima de 10 GB) y las insignias de https://ollama.com/huihui_ai/<familia>
// (tools / vision / thinking). NADIE midió estas variantes: `puntuacion` es SIEMPRE null («sin medir») y la de su
// modelo base se enseña aparte, rotulada como de la base (`baseId`). Una que pierde herramientas lo dice (la base
// del catálogo las tiene y la variante no) y no se ofrece donde hacen falta.
// Se dejaron FUERA (no verificables a este nivel o sin utilidad aquí): Qwen3.8 de huihui_ai y orcarouter (el modelo
// base no tiene ficha propia y orcarouter es la página de una pasarela de pago), eriktonon/deepseek-v4.1-flash-1017
// (afinado por un particular, sin base verificable), qwen3-next, devstral-2, qwen3.5 35b/122b, gemma-4 48b y
// deepseek-r1 70b (descargas de 24 a 81 GB, fuera del alcance de una neurona normal).
const HUIHUI = "https://ollama.com/huihui_ai/";
const PUBLICA = "huihui_ai (comunidad de Ollama; no es el editor del modelo)";

interface Sf {
  id: string;
  baseId: string;
  familia: string;
  editor: string;
  descargaGb: number;
  contextoK: number;
  vision: boolean;
  herramientas: boolean;
  nota?: string;
}

function sf(b: Sf): ModeloLocal {
  const [fam] = b.id.replace("huihui_ai/", "").split(":");
  return {
    id: b.id,
    etiqueta: b.id,
    familia: b.familia,
    editor: b.editor,
    clase: "abliterated",
    tipo: "estandar",
    runtimes: ["ollama"],
    descargaGb: b.descargaGb,
    contextoK: b.contextoK,
    herramientas: b.herramientas,
    vision: b.vision,
    razonamiento: true,
    licencia: null,
    puntuacion: null,
    estado: "comprobado",
    comprobado: FECHA_SEMILLA,
    fuentes: [`${HUIHUI}${fam}/tags`, `${HUIHUI}${fam}`],
    publicador: PUBLICA,
    baseId: b.baseId,
    nota: b.nota ?? "Variante sin filtros de la comunidad: nadie midió su calidad (la puntuación que se enseña es la de su base).",
  };
}

const SF_Q = { familia: "Qwen3.5 sin filtros", editor: "Alibaba (Qwen) · variante huihui_ai", contextoK: 256, vision: true, herramientas: true } as const;
const SF_G = { familia: "Gemma 4 sin filtros", editor: "Google · variante huihui_ai", vision: true, herramientas: true } as const;

export const MODELOS_SIN_FILTROS_SEMILLA: ModeloLocal[] = [
  sf({ ...SF_Q, id: "huihui_ai/qwen3.5-abliterated:4B", baseId: "qwen3.5:4b", descargaGb: 3.3 }),
  sf({ ...SF_Q, id: "huihui_ai/qwen3.5-abliterated:9b", baseId: "qwen3.5:9b", descargaGb: 6.6 }),
  sf({ ...SF_Q, id: "huihui_ai/qwen3.5-abliterated:27b", baseId: "qwen3.5:27b", descargaGb: 17 }),
  sf({ ...SF_G, id: "huihui_ai/gemma-4-abliterated:12b", baseId: "gemma4:12b", contextoK: 128, descargaGb: 7.6 }),
  sf({ ...SF_G, id: "huihui_ai/gemma-4-abliterated:26b", baseId: "gemma4:26b", contextoK: 256, descargaGb: 18 }),
  sf({ ...SF_G, id: "huihui_ai/gemma-4-abliterated:31b", baseId: "gemma4:31b", contextoK: 256, descargaGb: 20 }),
  sf({
    id: "huihui_ai/deepseek-r1-abliterated:8b", baseId: "deepseek-r1:8b", familia: "DeepSeek-R1 sin filtros (destilado 0528 sobre Qwen3 8B)",
    editor: "DeepSeek · variante huihui_ai", descargaGb: 5.0, contextoK: 128, vision: false, herramientas: false,
    nota: "PIERDE el uso de herramientas (la página de Ollama de esta variante solo marca «thinking»; el modelo base sí las trae). Nadie midió su calidad.",
  }),
  sf({
    id: "huihui_ai/glm-4.7-flash-abliterated:latest", baseId: "glm-4.7-flash", familia: "GLM-4.7 Flash sin filtros",
    editor: "Z.ai (GLM) · variante huihui_ai", descargaGb: 19, contextoK: 198, vision: false, herramientas: true,
  }),
];

/**
 * Frontera: el mejor modelo CERRADO de cada fecha según Epoch (récords sucesivos del ECI desde may. 2024),
 * leída de https://epoch.ai/data/eci_scores.csv el 2026-11-10.
 */
export const FRONTERA_SEMILLA: PuntoFrontera[] = [
  { fecha: "2024-05-13", eci: 128.2, modelo: "GPT-4o (may. 2024)" },
  { fecha: "2024-06-20", eci: 130.0, modelo: "Claude 3.5 Sonnet" },
  { fecha: "2024-09-12", eci: 135.38, modelo: "o1-mini" },
  { fecha: "2024-12-17", eci: 141.16, modelo: "o1" },
  { fecha: "2025-03-31", eci: 143.91, modelo: "Gemini 2.5 Pro (mar. 2025)" },
  { fecha: "2025-04-16", eci: 147.01, modelo: "o3" },
  { fecha: "2025-06-10", eci: 147.45, modelo: "o3-pro" },
  { fecha: "2025-08-07", eci: 150.0, modelo: "GPT-5" },
  { fecha: "2025-10-07", eci: 151.17, modelo: "GPT-5 Pro" },
  { fecha: "2025-11-18", eci: 152.89, modelo: "Gemini 3 Pro" },
  { fecha: "2025-12-11", eci: 157.21, modelo: "GPT-5.2 Pro" },
  { fecha: "2026-03-05", eci: 160.17, modelo: "GPT-5.4 Pro" },
  { fecha: "2026-04-23", eci: 162.75, modelo: "GPT-5.5 Pro" },
  { fecha: "2026-06-09", eci: 164.25, modelo: "Claude Fable 5" },
  { fecha: "2026-07-24", eci: 164.48, modelo: "Claude Opus 5" },
  { fecha: "2026-09-01", eci: 167.04, modelo: "Claude Fable 5.1" },
  { fecha: "2026-09-03", eci: 169.16, modelo: "GPT-6 Astra" },
  { fecha: "2026-11-09", eci: 174.24, modelo: "Claude Fable 5.2" },
];

/** Familias de la biblioteca de Ollama que la semilla ya conoce (no se avisan como novedad). */
export const FAMILIAS_SEMILLA: string[] = ["qwen3.5", "qwen3.8", "gemma4", "gpt-oss", "deepseek-r1", "glm-4.7-flash"];

export function catalogoSemilla(): CatalogoModelos {
  return {
    esquema: 1,
    actualizado: FECHA_SEMILLA,
    revisado: FECHA_SEMILLA,
    modelos: [...MODELOS_SEMILLA, ...MODELOS_SIN_FILTROS_SEMILLA].map((x) => ({ ...x, runtimes: [...x.runtimes], fuentes: [...x.fuentes] })),
    frontera: FRONTERA_SEMILLA.map((x) => ({ ...x })),
    familiasVistas: [...FAMILIAS_SEMILLA],
  };
}
