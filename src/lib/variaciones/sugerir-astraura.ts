// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura (contrato: architecture/variaciones-publicas.md §4).
// Módulo PURO: enrutador, ADN y validador se inyectan; sin red, disco ni DOM. La escalera es la de
// genesis-conectores-abiertos.md (local primero): aquí solo se pide, se valida con validar.ts y se
// miden las pruebas automáticas del ADN. Nada privado entra en una variación.
import { leerClave } from "./clave-elemento";
import { validarVariacion, type ResultadoValidacion } from "./validar";

export interface PruebaAdn { id: string; comprobacion: string; auto?: boolean }
export interface AdnContexto { meta?: { slug?: string; nombre?: string }; prohibiciones?: string[]; pruebas?: PruebaAdn[] }
export interface MetricasAdn { acento_porcentaje?: number; numero_tamanos?: number; ratio_titular_cuerpo?: number; tamanio_minimo_texto?: number; longitud_maxima_linea?: number; jugada_rara_veces?: number; contraste?: number; tamanio_minimo_diana?: number }
export interface ContextoSugerencia { payload: unknown; etiquetas?: string[]; tema?: string; descripcion?: string; privado?: boolean; codigo?: boolean }
export interface PeticionAstraura {
  clave: string; familia: string; payload: unknown; privado: boolean; codigo: boolean; cuantas: number;
  etiquetas: string[]; tema: string | null; descripcion: string | null;
  adn: { slug: string | null; pruebas: string[]; prohibiciones: string[] } | null;
}
export type EnrutadorAstraura = (peticion: PeticionAstraura) => Promise<unknown>;
export type ValidadorVariacion = (payload: unknown, opciones?: { codigo?: boolean }) => ResultadoValidacion;
export interface DepsSugerir { enrutador: EnrutadorAstraura; adn?: AdnContexto | null; validar?: ValidadorVariacion; cuantas?: number }
export interface VariacionSugerida { titulo: string; descripcion?: string; payload: unknown; metricas?: MetricasAdn; etiquetas?: string[]; tema?: string; licencia?: string }
export interface SugerenciaAceptada { variacion: VariacionSugerida; motivo: string; requiereAislamiento: boolean }
export interface SugerenciaDescartada { titulo: string | null; motivos: string[] }
export interface ResultadoSugerencias { ok: boolean; clave: string; familia: string; sugerencias: SugerenciaAceptada[]; descartadas: SugerenciaDescartada[]; motivo: string; error?: string }
const FAMILIAS_CODIGO = new Set(["atomo", "herramienta", "codigo"]), MAXIMO = 3;
const objeto = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** Lee JSON aunque venga envuelto en prosa o en un bloque ```json (los modelos suelen hacerlo). */
function jsonTolerante(valor: string): unknown {
  const limpio = valor.replace(/```(?:json)?/gi, "").trim();
  for (const [abre, cierra] of [["[", "]"], ["{", "}"]] as const) {
    const i = limpio.indexOf(abre), j = limpio.lastIndexOf(cierra);
    if (i >= 0 && j > i) { try { return JSON.parse(limpio.slice(i, j + 1)); } catch { /* prueba con el otro */ } }
  } return null;
}
/** Normaliza la respuesta del enrutador: arreglo, objeto con lista o texto con JSON dentro. */
function leerCandidatos(respuesta: unknown): unknown[] {
  if (typeof respuesta === "string") return leerCandidatos(jsonTolerante(respuesta));
  if (Array.isArray(respuesta)) return respuesta;
  const o = objeto(respuesta); if (!o) return [];
  for (const k of ["variaciones", "candidatos", "candidates", "items", "results"]) if (Array.isArray(o[k])) return o[k] as unknown[];
  for (const k of ["texto", "text", "contenido", "content"]) { const t = texto(o[k]); if (t) return leerCandidatos(jsonTolerante(t)); }
  return o.payload !== undefined ? [o] : [];
}
/** Convierte un candidato en variación; sin título o sin payload no se puede probar ni publicar. */
function comoVariacion(candidato: unknown): VariacionSugerida | null {
  const o = objeto(candidato);
  if (!o || typeof o.titulo !== "string" || o.payload === undefined) return null;
  const etiquetas = Array.isArray(o.etiquetas) ? o.etiquetas.filter((e): e is string => typeof e === "string") : undefined;
  return { titulo: o.titulo.trim(), descripcion: texto(o.descripcion) ?? undefined, payload: o.payload,
    metricas: (objeto(o.metricas) as MetricasAdn | null) ?? undefined, etiquetas, tema: texto(o.tema) ?? undefined, licencia: texto(o.licencia) ?? undefined };
}
const REGLAS: Record<string, { metrica: keyof MetricasAdn; patron: RegExp | RegExp[]; comparar: (v: number, a: number) => boolean; que: string }> = {
  p2: { metrica: "numero_tamanos", patron: /(?:máximo|max)\s+(\d+)\s+tama(?:ñ|n)os/, comparar: (v, a) => v <= a, que: "el número de tamaños" },
  p3: { metrica: "ratio_titular_cuerpo", patron: /titular\/cuerpo\s*(?:>=|≥)\s*(\d+(?:\.\d+)?)/, comparar: (v, a) => v >= a, que: "el ratio titular/cuerpo" },
  p4: { metrica: "tamanio_minimo_texto", patron: /texto\s*(?:>=|≥)\s*(\d+)\s*px/, comparar: (v, a) => v >= a, que: "el tamaño mínimo de texto" },
  p5: { metrica: "longitud_maxima_linea", patron: [/cuerpo\s*(?:<=|≤)\s*(\d+)/, /longitud\s*l[íi]nea\s*(?:<=|≤)\s*(\d+)/], comparar: (v, a) => v <= a, que: "la longitud máxima de línea" },
  p6: { metrica: "jugada_rara_veces", patron: /jugada\s*rara\s*(\d+)\s*ve/, comparar: (v, a) => v === a, que: "las veces de la jugada rara" },
  p7: { metrica: "contraste", patron: /contraste\s*(?:>=|≥)\s*([\d.]+)/, comparar: (v, a) => v >= a, que: "el contraste" },
  p8: { metrica: "tamanio_minimo_diana", patron: [/dianas\s*(?:>=|≥)\s*(\d+)\s*px/, /tama[ñn]o\s*m[íi]nimo\s*diana\s*(?:>=|≥)\s*(\d+)\s*px/], comparar: (v, a) => v >= a, que: "la diana mínima" },
};
/** Mide una prueba del ADN: `null` si pasa (o es manual), o el motivo por el que suspende. */
export function evaluarPruebaAdn(prueba: PruebaAdn, metricas: MetricasAdn): string | null {
  if (prueba.auto === false) return null;
  const c = prueba.comprobacion.toLowerCase().replace(/\s+/g, " ");
  if (prueba.id === "p1") {
    const v = metricas.acento_porcentaje;
    if (typeof v !== "number") return "Prueba p1: no se pudo medir el porcentaje de acento";
    const rango = c.match(/acento[^0-9]*(\d+(?:\.\d+)?)\s*%?\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/);
    const menor = c.match(/acento[^0-9]*<\s*(\d+(?:\.\d+)?)\s*%/), mayor = c.match(/acento[^0-9]*>\s*(\d+(?:\.\d+)?)\s*%/);
    const pasa = rango ? v >= +rango[1] && v <= +rango[2] : menor ? v < +menor[1] : mayor ? v > +mayor[1] : false;
    return pasa ? null : `Prueba p1: acento ${v}% no cumple «${prueba.comprobacion}»`;
  }
  const regla = REGLAS[prueba.id];
  if (!regla) return `Prueba ${prueba.id}: prueba automática sin comprobador`;
  const v = metricas[regla.metrica];
  if (typeof v !== "number") return `Prueba ${prueba.id}: no se pudo medir ${regla.que}`;
  const patrones = Array.isArray(regla.patron) ? regla.patron : [regla.patron];
  const r = patrones.map((p) => c.match(p)).find((m): m is RegExpMatchArray => !!m);
  if (!r) return `Prueba ${prueba.id}: comprobación no reconocida`;
  return regla.comparar(v, +r[1]) ? null : `Prueba ${prueba.id}: ${regla.que} ${v} no cumple «${prueba.comprobacion}»`;
}
/** Pide a Astraura tres variaciones del payload capturado y devuelve solo las que pasan. */
export async function sugerirVariaciones(clave: string, contexto: ContextoSugerencia, deps: DepsSugerir): Promise<ResultadoSugerencias> {
  const familia = clave.split(":")[0] ?? "";
  const vacio = (motivo: string, error?: string): ResultadoSugerencias => ({ ok: false, clave, familia, sugerencias: [], descartadas: [], motivo, error });
  if (!leerClave(clave)) return vacio(`Clave: «${clave}» no es una clave de elemento válida`);
  if (contexto.payload === undefined) return vacio("Payload: no hay estado capturado del elemento");
  const adn = deps.adn ?? null, pruebas = adn?.pruebas ?? [];
  const codigo = contexto.codigo === true || FAMILIAS_CODIGO.has(familia);
  const cuantas = Math.min(Math.max(Math.trunc(deps.cuantas ?? MAXIMO), 1), MAXIMO);
  const peticion: PeticionAstraura = {
    clave, familia, payload: contexto.privado ? null : contexto.payload, privado: contexto.privado === true,
    codigo, cuantas, etiquetas: (contexto.etiquetas ?? []).map((e) => e.trim()).filter(Boolean),
    tema: contexto.tema?.trim() || null, descripcion: contexto.descripcion?.trim() || null,
    adn: adn ? { slug: adn.meta?.slug ?? null, pruebas: pruebas.map((p) => p.comprobacion), prohibiciones: adn.prohibiciones ?? [] } : null,
  };
  let respuesta: unknown; try { respuesta = await deps.enrutador(peticion); } catch (e) { return vacio(`Astraura: ${e instanceof Error ? e.message : "sin conexión"}`, "El enrutador de Astraura no respondió"); }
  const validar = deps.validar ?? validarVariacion;
  const sugerencias: SugerenciaAceptada[] = [], descartadas: SugerenciaDescartada[] = [], vistos = new Set<string>();
  for (const candidato of leerCandidatos(respuesta)) {
    if (sugerencias.length + descartadas.length >= cuantas) break;
    const v = comoVariacion(candidato);
    if (!v) { descartadas.push({ titulo: texto(objeto(candidato)?.titulo), motivos: ["Forma: la variación no trae título y payload"] }); continue; }
    let huella = "";
    try { huella = JSON.stringify(v.payload); } catch { descartadas.push({ titulo: v.titulo, motivos: ["JSON: el payload no se puede serializar"] }); continue; }
    if (vistos.has(huella)) { descartadas.push({ titulo: v.titulo, motivos: ["Duplicada: ya había una variación igual"] }); continue; }
    vistos.add(huella);
    const validacion = validar(v.payload, { codigo });
    if (!validacion.ok) { descartadas.push({ titulo: v.titulo, motivos: validacion.motivos }); continue; }
    const fallos = pruebas.map((p) => evaluarPruebaAdn(p, v.metricas ?? {})).filter((m): m is string => !!m);
    if (fallos.length) { descartadas.push({ titulo: v.titulo, motivos: fallos }); continue; }
    const auto = pruebas.filter((p) => p.auto !== false).length, nombre = adn?.meta?.nombre ?? adn?.meta?.slug ?? "el contexto";
    sugerencias.push({ variacion: v, requiereAislamiento: validacion.requiereAislamiento,
      motivo: `Pasa el validador${auto ? ` y ${auto} prueba(s) automática(s) del ADN «${nombre}»` : ""}.${validacion.requiereAislamiento ? " Se abrirá aislada." : ""}` });
  }
  const motivo = sugerencias.length ? `Astraura propuso ${sugerencias.length + descartadas.length} y pasan ${sugerencias.length}.`
    : "Astraura no propuso ninguna variación que pase el validador y el ADN.";
  return { ok: sugerencias.length > 0, clave, familia, sugerencias, descartadas, motivo };
}
