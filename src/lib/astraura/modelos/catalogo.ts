// Catálogo comparativo: validación, adaptador de las capas 1.58-bit/Needle, requisitos y equivalencias.
// MOD1110A. Puro: sin red, sin disco, sin DOM. Amplía `capas/catalogo.ts` (no lo duplica).

import { usable, type EntradaCapa, type CatalogoCapas } from "@/lib/astraura/capas/catalogo";
import { catalogoSemilla } from "./catalogo-datos";
import type { CatalogoModelos, ModeloLocal, Puntuacion, PuntoFrontera, RuntimeLocal } from "./tipos";

const RUNTIMES: readonly RuntimeLocal[] = ["ollama", "llama-cpp", "bitnet-cpp", "needle-nativo", "needle-wasm", "webgpu", "colibri"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const txt = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Publicadores de variantes sin filtros que se aceptan (lista cerrada; las demás se descartan al leer). */
export const PUBLICADORES_SIN_FILTROS: readonly string[] = ["huihui_ai"];
const FUENTE_SIN_FILTROS = /^https:\/\/ollama\.com\/([\w.-]+)\/[\w.-]+(\/tags)?$/;

/** Una variante sin filtros solo vale con su rastro completo: publicador de la lista, fuente viva, base y sin puntuación propia. */
function sinFiltrosValida(e: Record<string, unknown>): boolean {
  if (e.tipo !== "estandar" || e.puntuacion !== null) return false; // nadie las midió: jamás lleva puntuación propia
  if (!txt(e.baseId) || !txt(e.publicador)) return false;
  if (!Array.isArray(e.runtimes) || e.runtimes.length !== 1 || e.runtimes[0] !== "ollama") return false;
  const id = String(e.id);
  const usuario = id.split("/")[0];
  if (!id.includes("/") || !PUBLICADORES_SIN_FILTROS.includes(usuario)) return false;
  const fuentes = e.fuentes as string[];
  return fuentes.length > 0 && fuentes.every((f) => {
    const m = FUENTE_SIN_FILTROS.exec(f);
    return !!m && PUBLICADORES_SIN_FILTROS.includes(m[1]);
  });
}

/** Una entrada es válida si cumple el esquema; las variantes sin filtros, además, su rastro completo (`sinFiltrosValida`). */
export function modeloValido(v: unknown): v is ModeloLocal {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  if (!txt(e.id) || !txt(e.etiqueta) || !txt(e.familia) || !txt(e.editor)) return false;
  if (e.clase !== "normal" && e.clase !== "abliterated") return false;
  if (e.tipo !== "estandar" && e.tipo !== "capa-158" && e.tipo !== "needle") return false;
  if (!Array.isArray(e.runtimes) || e.runtimes.length === 0 || !e.runtimes.every((r) => RUNTIMES.includes(r as RuntimeLocal))) return false;
  if (!num(e.descargaGb)) return false;
  if (e.contextoK !== null && !num(e.contextoK)) return false;
  if (typeof e.herramientas !== "boolean" || typeof e.vision !== "boolean" || typeof e.razonamiento !== "boolean") return false;
  if (e.estado !== "comprobado" && e.estado !== "sin-comprobar" && e.estado !== "candidato") return false;
  if (e.comprobado !== null && !(typeof e.comprobado === "string" && FECHA.test(e.comprobado))) return false;
  if (!Array.isArray(e.fuentes) || !e.fuentes.every(txt)) return false;
  if (e.puntuacion !== null) {
    const p = e.puntuacion as Record<string, unknown> | undefined;
    if (!p || !num(p.eci) || !txt(p.fecha) || !txt(p.nombreEpoch) || !txt(p.comprobado)) return false;
  }
  if (e.clase === "abliterated" && !sinFiltrosValida(e)) return false;
  return true;
}

/** Lee un catálogo guardado; descarta lo mal formado. Si no queda nada útil devuelve la semilla. */
export function leerCatalogoModelos(json: unknown): CatalogoModelos {
  const semilla = catalogoSemilla();
  if (typeof json !== "object" || json === null) return semilla;
  const r = json as Record<string, unknown>;
  if (r.esquema !== 1 || !Array.isArray(r.modelos)) return semilla;
  const modelos = r.modelos.filter(modeloValido);
  if (modelos.length === 0) return semilla;
  // Propagación a cuentas existentes (regla del OS): un catálogo guardado antes de MOD1110B no trae la clase
  // «sin filtros»; se le añaden las de la semilla que falten. Una que ya está (aunque retirada) no se repone.
  const vistos = new Set(modelos.map((x) => x.id));
  for (const s of semilla.modelos) if (s.clase === "abliterated" && !vistos.has(s.id)) modelos.push(s);
  const frontera = Array.isArray(r.frontera)
    ? (r.frontera as unknown[]).filter((p): p is PuntoFrontera => {
        const q = p as Record<string, unknown> | null;
        return !!q && txt(q.fecha) && num(q.eci) && txt(q.modelo);
      })
    : [];
  return {
    esquema: 1,
    actualizado: typeof r.actualizado === "string" && FECHA.test(r.actualizado) ? r.actualizado : semilla.actualizado,
    revisado: typeof r.revisado === "string" && FECHA.test(r.revisado) ? r.revisado : null,
    modelos,
    frontera: frontera.length ? frontera : semilla.frontera,
    familiasVistas: Array.isArray(r.familiasVistas) ? (r.familiasVistas as unknown[]).filter(txt) : semilla.familiasVistas,
  };
}

/** ¿Se puede recomendar? Solo lo comprobado, de clase normal y con datos de tamaño válidos. NUNCA una variante sin filtros. */
export function recomendable(m: ModeloLocal): boolean {
  return m.clase === "normal" && m.estado === "comprobado" && m.descargaGb > 0;
}

export const esSinFiltros = (m: ModeloLocal): boolean => m.clase === "abliterated";

/** Heurística por id para ajustes viejos o ilegibles: ¿parece una variante sin filtros? */
export const idSinFiltros = (id: string): boolean => /abliterated|uncensored/i.test(id);

/**
 * ¿Se puede LISTAR (y elegir a mano) una variante sin filtros? Solo si se comprobó contra la fuente viva (fecha y estado),
 * tiene rastro (fuente, base) y sus datos de tamaño son válidos. Lo retirado o sin comprobar desaparece.
 */
export function listableSinFiltros(m: ModeloLocal): boolean {
  return m.clase === "abliterated" && m.estado === "comprobado" && m.comprobado !== null && FECHA.test(m.comprobado) && m.descargaGb > 0 && m.fuentes.length > 0 && !!m.baseId;
}

/** Puntuación del modelo BASE (rotulada así en las tarjetas); nunca se hereda como propia. */
export function puntuacionDeBase(m: ModeloLocal, modelos: readonly ModeloLocal[]): Puntuacion | null {
  if (!m.baseId) return null;
  return modelos.find((x) => x.id === m.baseId && x.clase === "normal")?.puntuacion ?? null;
}

/** La variante perdió el uso de herramientas respecto a su base (hay que decirlo y no ofrecerla donde hacen falta). */
export function pierdeHerramientas(m: ModeloLocal, modelos: readonly ModeloLocal[]): boolean {
  if (m.clase !== "abliterated" || m.herramientas) return false;
  const base = modelos.find((x) => x.id === m.baseId && x.clase === "normal");
  return base ? base.herramientas : true;
}

// ── Capas 1.58-bit y Needle, en la misma comparación ─────────────────────────────────────────────

const PAPELES_COMPARABLES = new Set(["reflejo", "memoria", "palabra", "razon", "profunda", "voz", "oído"]);

function runtimesDeCapa(e: EntradaCapa): RuntimeLocal[] {
  switch (e.runtime) {
    case "needle-wasm": return ["needle-wasm", "needle-nativo"];
    case "needle-nativo": return ["needle-nativo"];
    case "webgpu-onnx": return ["webgpu"];
    case "llama-cpp": return ["llama-cpp"];
    case "bitnet-cpp": return ["bitnet-cpp"];
    case "colibri": return ["colibri"];
    case "ollama": return ["ollama"];
    default: return [];
  }
}

/** Convierte las capas USABLES (SHA verificado, recomendadas o de respaldo) del catálogo de Astraura en entradas comparables. */
export function modelosDesdeCapas(catalogo: CatalogoCapas): ModeloLocal[] {
  const out: ModeloLocal[] = [];
  for (const e of catalogo.capas) {
    if (!usable(e) || !PAPELES_COMPARABLES.has(e.capa)) continue;
    const runtimes = runtimesDeCapa(e);
    if (runtimes.length === 0) continue;
    const tipo = e.capa === "reflejo" ? "needle" : "capa-158";
    out.push({
      id: e.id,
      etiqueta: e.modelo,
      familia: e.familia,
      editor: e.familia,
      clase: "normal",
      tipo,
      papel: e.capa,
      runtimes,
      descargaGb: Math.max(0.01, e.disco_mb / 1024),
      contextoK: null,
      herramientas: false,
      vision: false,
      razonamiento: false,
      licencia: null,
      puntuacion: null,
      memoriaMinGb: e.ram_min_mb / 1024,
      memoriaComodaGb: (e.ram_ok_mb ?? e.ram_min_mb * 1.5) / 1024,
      estado: "comprobado",
      comprobado: catalogo.actualizado || null,
      fuentes: [e.fuente_oficial],
      nota: "Capa propia de Astraura: su SHA-256 está verificado en el catálogo de capas; sin puntuación ECI.",
    });
  }
  return out;
}

/** El catálogo completo a comparar: modelos estándar + capas propias usables. */
export function catalogoCompleto(base: CatalogoModelos, capas?: CatalogoCapas | null): ModeloLocal[] {
  const propios = capas ? modelosDesdeCapas(capas) : [];
  const ids = new Set(base.modelos.map((x) => x.id));
  return [...base.modelos, ...propios.filter((p) => !ids.has(p.id))];
}

// ── Requisitos: regla propia, derivada del tamaño de descarga comprobado ─────────────────────────

export interface Requisitos {
  memoriaMinGb: number;
  memoriaComodaGb: number;
  /** VRAM de una GPU discreta; null para capas que no usan GPU. */
  vramMinGb: number | null;
  vramComodaGb: number | null;
  discoGb: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Regla de StarSeed (no copiada de nadie): pesos en memoria + caché de contexto + sistema.
 *   memoria mínima  = descarga × 1,15 + 3,5 GB       (cabe, pero justo)
 *   memoria cómoda  = descarga × 1,5 + 5 GB          (con holgura para contexto largo)
 *   VRAM mínima     = descarga × 1,1 + 1 GB · cómoda = descarga × 1,3 + 2 GB
 *   disco           = descarga × 1,1 + 1 GB          (descarga + temporales)
 * Las capas de Astraura usan la RAM que declara su catálogo de capas.
 */
export function requisitosDe(m: ModeloLocal): Requisitos {
  if (m.tipo !== "estandar") {
    const min = m.memoriaMinGb ?? 1;
    return { memoriaMinGb: r1(min), memoriaComodaGb: r1(m.memoriaComodaGb ?? min * 1.5), vramMinGb: null, vramComodaGb: null, discoGb: r1(m.descargaGb * 1.1 + 0.2) };
  }
  const d = m.descargaGb;
  return {
    memoriaMinGb: Math.ceil(m.memoriaMinGb ?? d * 1.15 + 3.5),
    memoriaComodaGb: Math.ceil(m.memoriaComodaGb ?? d * 1.5 + 5),
    vramMinGb: Math.ceil(d * 1.1 + 1),
    vramComodaGb: Math.ceil(d * 1.3 + 2),
    discoGb: r1(d * 1.1 + 1),
  };
}

// ── Equivalencia con la frontera ─────────────────────────────────────────────────────────────────

const MESES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];

export function fechaCorta(iso: string): string {
  const [a, mes] = iso.split("-");
  const i = Number(mes) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]} ${a}` : iso;
}

function mesesEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round(((b - a) / (30.4375 * 86_400_000)) * 10) / 10);
}

export interface Equivalencia {
  texto: string;
  /** Meses de retraso respecto al mejor modelo cerrado de su fecha; null si no aplica. */
  mesesDetras: number | null;
  referencia: PuntoFrontera | null;
}

/** «Tan bueno como el mejor modelo cerrado de <fecha>»: el primer récord de la frontera que alcanzó esa puntuación. */
export function equivalencia(m: ModeloLocal, frontera: readonly PuntoFrontera[]): Equivalencia {
  const p = m.puntuacion;
  if (!p) {
    return { texto: m.tipo === "estandar" ? "Sin puntuación comparable de Epoch" : "Capa propia: sin puntuación ECI", mesesDetras: null, referencia: null };
  }
  const orden = [...frontera].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (orden.length === 0) return { texto: `ECI ${p.eci.toFixed(1).replace(".", ",")}`, mesesDetras: null, referencia: null };
  const ref = orden.find((f) => f.eci >= p.eci);
  if (!ref) return { texto: "Al nivel del mejor modelo cerrado actual", mesesDetras: 0, referencia: orden[orden.length - 1] };
  if (ref === orden[0] && p.eci < ref.eci) {
    return { texto: `Por debajo de ${ref.modelo} (${fechaCorta(ref.fecha)})`, mesesDetras: mesesEntre(ref.fecha, p.fecha), referencia: ref };
  }
  const meses = mesesEntre(ref.fecha, p.fecha);
  return {
    texto: `Como el mejor modelo cerrado de ${fechaCorta(ref.fecha)} (${ref.modelo}) · ${meses.toFixed(1).replace(".", ",")} meses por detrás`,
    mesesDetras: meses,
    referencia: ref,
  };
}
