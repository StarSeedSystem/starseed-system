// Catálogo puro de capas de Astraura (architecture/capas-autoadaptables.md §1, §3 y §6).
// Sin red, sin disco, sin node:*: el navegador lo importa directo.

// La trinidad es reflejo → juicio → deliberación (architecture/colibri-multicapas.md §2).
export type Capa =
  | "reflejo"
  | "juicio"
  | "memoria"
  | "palabra"
  | "razon"
  | "profunda"
  | "voz"
  | "adaptador";

export type Medio = "web" | "pwa" | "nativo" | "servidor";

export type FormatoCapa = "cact" | "gguf" | "mlx" | "onnx" | "safetensors";

export type RuntimeCapa =
  | "needle-wasm"
  | "needle-nativo"
  | "webgpu-onnx"
  | "llama-cpp"
  | "bitnet-cpp"
  | "colibri"
  | "mlx";

/** «por-verificar»: entra al catálogo sin SHA medido y no se usa hasta que el instalador lo anote. */
export type EstadoCapa = "recomendado" | "respaldo" | "en-banco" | "retirado" | "por-verificar";

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
  /** Los expertos se leen del disco (MoE de Colibri): no hace falta que quepan en RAM. */
  streaming_disco?: boolean;
  /** RAM con la que el modelo va cómodo, por encima del mínimo. */
  ram_ok_mb?: number;
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
  "juicio",
  "memoria",
  "palabra",
  "razon",
  "profunda",
  "voz",
  "adaptador",
];
const MEDIOS: readonly Medio[] = ["web", "pwa", "nativo", "servidor"];
const FORMATOS: readonly FormatoCapa[] = ["cact", "gguf", "mlx", "onnx", "safetensors"];
const RUNTIMES: readonly RuntimeCapa[] = [
  "needle-wasm",
  "needle-nativo",
  "webgpu-onnx",
  "llama-cpp",
  "bitnet-cpp",
  "colibri",
  "mlx",
];
const ESTADOS: readonly EstadoCapa[] = [
  "recomendado",
  "respaldo",
  "en-banco",
  "retirado",
  "por-verificar",
];

// Preferencia de §3 por capa: ids de mejor a más ligero.
const ORDEN_POR_CAPA: Record<Capa, readonly string[]> = {
  reflejo: ["needle3-reflejo"],
  // Juicio (Colibri): Laya → GLiNER2.5-Decide → Clef, de más ligero a más capaz.
  juicio: ["colibri-laya", "colibri-gliner-decide", "colibri-clef"],
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
  if (e.streaming_disco !== undefined && typeof e.streaming_disco !== "boolean") return false;
  if (e.ram_ok_mb !== undefined && !esNumero(e.ram_ok_mb)) return false;
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
  // Las de Colibri entran «por-verificar» y no se usan hasta que el instalador anote el SHA.
  if (entrada.estado === "por-verificar") return false;
  if (typeof entrada.sha256 !== "string" || entrada.sha256.length === 0) return false;
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

/** Convierte las entradas de Colibri de `config/capas-colibri-1027.json` a `EntradaCapa[]`. */
export function entradasColibri(json: unknown): EntradaCapa[] {
  const raiz = (typeof json === "object" && json !== null ? json : {}) as { entradas?: unknown };
  const entradas = Array.isArray(raiz.entradas) ? raiz.entradas : [];
  const salida: EntradaCapa[] = [];

  for (const cruda of entradas) {
    if (typeof cruda !== "object" || cruda === null) continue;
    const c = cruda as Record<string, unknown>;

    if (!esTexto(c.id) || !esTexto(c.capa)) continue;
    const id = c.id.trim();
    const capa = c.capa.trim();
    if (!CAPAS.includes(capa as Capa)) continue;

    const familia = esTexto(c.repo_hf) ? c.repo_hf.trim() : "JustVugg/colibri";
    const modelo = esTexto(c.modelo) ? c.modelo.trim() : id;
    const mediosRaw = Array.isArray(c.medios)
      ? c.medios.filter((m): m is Medio => MEDIOS.includes(m as Medio))
      : ["servidor"];
    const medios = mediosRaw.length > 0 ? mediosRaw : ["servidor"];

    const discoGb = esNumero(c.disco_gb) ? c.disco_gb : 0;
    const ramMinGb = esNumero(c.ram_min_gb) ? c.ram_min_gb : 0;
    const ramOkGb = esNumero(c.ram_ok_gb) ? c.ram_ok_gb : ramMinGb;
    const streaming = c.streaming_disco === true;

    const entrada: EntradaCapa = {
      id,
      familia,
      capa: capa as Capa,
      modelo,
      version: "v2.0.0",
      formato: "safetensors",
      runtime: "colibri",
      parametros: discoGb > 0 ? `${discoGb} GB` : "desconocido",
      disco_mb: Math.round(discoGb * 1000),
      ram_min_mb: Math.round(ramMinGb * 1024),
      streaming_disco: streaming,
      ram_ok_mb: ramOkGb > ramMinGb ? Math.round(ramOkGb * 1024) : undefined,
      sha256: "por-verificar",
      fuente_oficial: esTexto(c.repo_hf) ? `https://huggingface.co/${c.repo_hf}` : "",
      espejos: [],
      estado: "por-verificar",
      medios,
    };

    salida.push(entrada);
  }
  return salida;
}
