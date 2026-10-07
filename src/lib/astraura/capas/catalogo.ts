// Catálogo puro de capas de Astraura (architecture/capas-autoadaptables.md §1, §3 y §6).
// Sin red, sin disco, sin node:*: el navegador lo importa directo.

export type Capa =
  | "reflejo"
  | "memoria"
  | "palabra"
  | "razon"
  | "profunda"
  | "voz"
  | "adaptador";

export type Medio = "web" | "pwa" | "nativo" | "servidor";

export type FormatoCapa = "cact" | "gguf" | "mlx" | "onnx";

export type RuntimeCapa =
  | "needle-wasm"
  | "needle-nativo"
  | "webgpu-onnx"
  | "llama-cpp"
  | "bitnet-cpp"
  | "mlx";

export type EstadoCapa = "recomendado" | "respaldo" | "en-banco" | "retirado";

export interface ProfundidadNeedle {
  capas: number;
  disco_mb: number;
}

export interface EntradaCapa {
  id: string;
  familia: string;
  capa: Capa;
  modelo: string;
  version: string;
  formato: FormatoCapa;
  runtime: RuntimeCapa;
  parametros: string;
  disco_mb: number;
  ram_min_mb: number;
  profundidades?: ProfundidadNeedle[];
  sha256: string;
  fuente_oficial: string;
  espejos: string[];
  estado: EstadoCapa;
  medios: Medio[];
}

export interface CatalogoCapas {
  esquema: number;
  actualizado: string;
  capas: EntradaCapa[];
}

const CAPAS: readonly Capa[] = [
  "reflejo",
  "memoria",
  "palabra",
  "razon",
  "profunda",
  "voz",
  "adaptador",
];
const MEDIOS: readonly Medio[] = ["web", "pwa", "nativo", "servidor"];
const FORMATOS: readonly FormatoCapa[] = ["cact", "gguf", "mlx", "onnx"];
const RUNTIMES: readonly RuntimeCapa[] = [
  "needle-wasm",
  "needle-nativo",
  "webgpu-onnx",
  "llama-cpp",
  "bitnet-cpp",
  "mlx",
];
const ESTADOS: readonly EstadoCapa[] = [
  "recomendado",
  "respaldo",
  "en-banco",
  "retirado",
];

// Preferencia de §3 por capa: ids de mejor a más ligero.
const ORDEN_POR_CAPA: Record<Capa, readonly string[]> = {
  reflejo: ["needle3-reflejo"],
  memoria: ["bitnet-embedding-0.6b", "bitnet-embedding-270m", "needle3-reflejo"],
  palabra: [
    "ternary-bonsai-4b",
    "ternary-bonsai-4b-onnx",
    "ternary-bonsai-1.7b",
    "ternary-bonsai-1.7b-onnx",
    "bonsai-1bit-1.7b",
  ],
  razon: ["ternary-bonsai-8b", "bitnet-b1.58-2b-4t", "ternary-bonsai-4b"],
  profunda: ["ternary-bonsai2-27b", "bonsai-1bit-27b", "ternary-bonsai-8b"],
  voz: ["vibeasr-cpp"],
  adaptador: [],
};

const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const esNumero = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function entradaValida(v: unknown): v is EntradaCapa {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  if (
    !esTexto(e.id) ||
    !esTexto(e.familia) ||
    !esTexto(e.modelo) ||
    !esTexto(e.version) ||
    !esTexto(e.parametros) ||
    !esTexto(e.sha256) ||
    !esTexto(e.fuente_oficial)
  ) {
    return false;
  }
  if (!CAPAS.includes(e.capa as Capa)) return false;
  if (!FORMATOS.includes(e.formato as FormatoCapa)) return false;
  if (!RUNTIMES.includes(e.runtime as RuntimeCapa)) return false;
  if (!ESTADOS.includes(e.estado as EstadoCapa)) return false;
  if (!esNumero(e.disco_mb) || !esNumero(e.ram_min_mb)) return false;
  if (!Array.isArray(e.espejos) || !e.espejos.every(esTexto)) return false;
  if (
    !Array.isArray(e.medios) ||
    e.medios.length === 0 ||
    !e.medios.every((m) => MEDIOS.includes(m as Medio))
  ) {
    return false;
  }
  if (e.profundidades !== undefined) {
    if (!Array.isArray(e.profundidades)) return false;
    for (const p of e.profundidades as unknown[]) {
      if (typeof p !== "object" || p === null) return false;
      const pr = p as Record<string, unknown>;
      if (!esNumero(pr.capas) || !esNumero(pr.disco_mb) || pr.capas < 1) return false;
    }
  }
  return true;
}

/** Valida el JSON del catálogo y descarta las entradas mal formadas. */
export function leerCatalogo(json: unknown): CatalogoCapas {
  if (typeof json !== "object" || json === null) {
    return { esquema: 0, actualizado: "", capas: [] };
  }
  const raiz = json as Record<string, unknown>;
  const capasCrudas = Array.isArray(raiz.capas) ? raiz.capas : [];
  return {
    esquema: esNumero(raiz.esquema) ? raiz.esquema : 0,
    actualizado: esTexto(raiz.actualizado) ? raiz.actualizado : "",
    capas: capasCrudas.filter(entradaValida),
  };
}

/** Candidatos de una capa para un medio, de mejor a más ligero (tabla de §3). */
export function candidatosDe(
  catalogo: CatalogoCapas,
  capa: Capa,
  medio: Medio,
): EntradaCapa[] {
  const orden = ORDEN_POR_CAPA[capa];
  const posicion = (e: EntradaCapa): number => {
    const i = orden.indexOf(e.id);
    return i === -1 ? orden.length : i;
  };
  return catalogo.capas
    .filter((e) => e.capa === capa && e.medios.includes(medio))
    .sort((a, b) => posicion(a) - posicion(b) || a.disco_mb - b.disco_mb);
}

/** Una capa solo se usa con su SHA verificado y estado recomendado o respaldo (§6, §11). */
export function usable(entrada: EntradaCapa): boolean {
  return (
    /^[0-9a-f]{64}$/.test(entrada.sha256) &&
    (entrada.estado === "recomendado" || entrada.estado === "respaldo")
  );
}

/** Profundidad de Needle 3 más capaz que cabe en el presupuesto (2 → 20 capas, 8 → 29 MB). */
export function profundidadNeedle(presupuestoMb: number): number {
  const tabla: readonly ProfundidadNeedle[] = [
    { capas: 2, disco_mb: 8 },
    { capas: 6, disco_mb: 12 },
    { capas: 12, disco_mb: 20 },
    { capas: 20, disco_mb: 29 },
  ];
  let elegida = 0;
  for (const p of tabla) {
    if (p.disco_mb <= presupuestoMb) elegida = p.capas;
  }
  return elegida;
}
