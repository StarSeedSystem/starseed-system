// Autoactualización diaria del catálogo comparativo (MOD1110A). Amplía `auto-actualizar-modelos.ts`:
// aquel decide SI se aplica un top nuevo; este revisa las fuentes vivas, fusiona con fechas y levanta
// UN aviso discreto cuando hay un modelo mejor para esta neurona. La red se inyecta (`traer`): lo puro
// se prueba sin red. Fuentes y permisos: solo ollama.com/library y epoch.ai/data/eci_scores.csv.

import { queAplicar, type DecisionAutoActualizar } from "@/lib/astraura/auto-actualizar-modelos";
import { recomendarTodos, type EntornoRuta, type Recomendacion } from "./recomendar";
import type { PerfilNeurona } from "./perfil-neurona";
import { CASOS, ETIQUETA_CASO, type CasoUso, type CatalogoModelos, type ModeloLocal, type PuntoFrontera } from "./tipos";

export const URL_ECI = "https://epoch.ai/data/eci_scores.csv";
export const URL_INDICE_OLLAMA = "https://ollama.com/search?o=newest";
export const urlTags = (familia: string) => `https://ollama.com/library/${familia}/tags`;
export const urlFamilia = (familia: string) => `https://ollama.com/library/${familia}`;
/** Como mucho una revisión completa al día. */
export const INTERVALO_REVISION_MS = 24 * 60 * 60 * 1000;
const NOMBRE_FAMILIA = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Lista cerrada de URLs que el servicio de revisión puede leer (la usa también la ruta de la API). */
export function urlPermitida(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.hostname === "epoch.ai") return u.pathname === "/data/eci_scores.csv" && u.search === "";
  if (u.hostname !== "ollama.com") return false;
  if (u.pathname === "/search") return u.search === "?o=newest";
  const m = /^\/library\/([^/]+)(\/tags)?$/.exec(u.pathname);
  return !!m && NOMBRE_FAMILIA.test(m[1]) && u.search === "";
}

// ── Lectores de las fuentes ──────────────────────────────────────────────────────────────────────

function lineaCsv(l: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export interface FilaEci { nombre: string; eci: number; fecha: string; grupo: string }

/** Lee `eci_scores.csv` de Epoch (columnas Model, eci, date, Accessibility group). Robusto a columnas extra. */
export function parsearEciCsv(csv: string): FilaEci[] {
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const cab = lineaCsv(lineas[0]);
  const iM = cab.indexOf("Model"), iE = cab.indexOf("eci"), iF = cab.indexOf("date"), iG = cab.indexOf("Accessibility group");
  if (iM < 0 || iE < 0 || iF < 0) return [];
  const out: FilaEci[] = [];
  for (const l of lineas.slice(1)) {
    const c = lineaCsv(l);
    const eci = Number(c[iE]);
    if (!c[iM] || !Number.isFinite(eci) || !/^\d{4}-\d{2}-\d{2}$/.test(c[iF] ?? "")) continue;
    out.push({ nombre: c[iM], eci, fecha: c[iF], grupo: iG >= 0 ? c[iG] ?? "" : "" });
  }
  return out;
}

/** Récords sucesivos del ECI entre los modelos CERRADOS desde may. 2024: la «frontera». */
export function fronteraDeFilas(filas: readonly FilaEci[]): PuntoFrontera[] {
  const cerr = filas.filter((f) => f.grupo === "Closed weights" && f.fecha >= "2024-05-01").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const out: PuntoFrontera[] = [];
  let mejor = 0;
  for (const f of cerr) if (f.eci > mejor) { mejor = f.eci; out.push({ fecha: f.fecha, eci: f.eci, modelo: f.nombre }); }
  return out;
}

export interface FilaTag { tag: string; descargaGb: number; contextoK: number; vision: boolean }

/** Lee la página `/library/<familia>/tags` de Ollama: tamaño (el menor del rango), contexto y entrada. */
export function parsearTagsOllama(html: string): FilaTag[] {
  const out = new Map<string, FilaTag>();
  const re = /href="\/library\/([\w.-]+:[\w.-]+)"[\s\S]{0,1500}?•\s*([\d.]+)\s*(GB|MB)(?:\s*-\s*[\d.]+\s*(?:GB|MB))?\s*•\s*(\d+)K context window[\s\S]{0,300}?\b(Text, Image|Text) input/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (out.has(m[1])) continue;
    const n = Number(m[2]);
    out.set(m[1], { tag: m[1], descargaGb: m[3] === "MB" ? n / 1024 : n, contextoK: Number(m[4]), vision: m[5] === "Text, Image" });
  }
  return [...out.values()];
}

export interface CapsOllama { tools: boolean; vision: boolean; thinking: boolean }

/** Insignias de la página de la familia (`tools`, `vision`, `thinking`); null si no se reconoce la página. */
export function parsearCapacidadesOllama(html: string): CapsOllama | null {
  const i = html.indexOf("flex flex-wrap gap-2");
  if (i < 0) return null;
  const seg = html.slice(i, i + 3000);
  const has = (w: string) => new RegExp(`>${w}</span>`).test(seg);
  const caps = { tools: has("tools"), vision: has("vision"), thinking: has("thinking") };
  return caps.tools || caps.vision || caps.thinking ? caps : null;
}

/** Nombres de familias del índice «más nuevas» de la biblioteca de Ollama. */
export function parsearIndiceOllama(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="\/library\/([\w.-]+)"/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

// ── Fusión con fechas ────────────────────────────────────────────────────────────────────────────

export type TipoCambio = "tamano" | "contexto" | "capacidad" | "puntuacion" | "retirado" | "familia-nueva" | "candidato";
export interface Cambio { id: string; tipo: TipoCambio; detalle: string }

export interface Observaciones {
  /** Día de hoy (YYYY-MM-DD). */
  hoy: string;
  /** Filas de Epoch; null = no se pudo leer (no se toca nada de puntuaciones). */
  eci?: readonly FilaEci[] | null;
  /** Por familia de Ollama: filas de etiquetas; null = no se pudo leer. */
  tags?: Record<string, readonly FilaTag[] | null>;
  caps?: Record<string, CapsOllama | null>;
  /** Índice de familias nuevas; null = no se pudo leer. */
  indice?: readonly string[] | null;
}

const familiaDe = (id: string) => id.split(":")[0];
const tagVivo = (id: string) => (id.includes(":") ? id : `${id}:latest`);
const EDITORES = /^(qwen|gemma|gpt-oss|deepseek|glm|llama|mistral|ministral|phi|smollm|olmo|granite|nemotron|lfm|bonsai)/;
const ETIQUETA_CANDIDATA = /^[\w.-]+:(\d+(\.\d+)?b|e\d+b|latest)$/;

/**
 * Funde lo observado hoy con el catálogo. Reglas:
 *  · una etiqueta que sigue en Ollama conserva `comprobado` y se pone a hoy; si cambia tamaño/contexto se actualiza y se anota;
 *  · una etiqueta que ya no aparece pasa a «sin-comprobar» (deja de recomendarse);
 *  · una fuente que no se pudo leer NO cambia nada (un fallo de red nunca borra datos);
 *  · las familias nuevas entran como «candidato» (no se recomiendan hasta que alguien las contraste);
 *  · la frontera se recalcula con los récords de Epoch.
 */
export function fusionar(cat: CatalogoModelos, obs: Observaciones): { catalogo: CatalogoModelos; cambios: Cambio[] } {
  const cambios: Cambio[] = [];
  const eci = obs.eci && obs.eci.length > 0 ? obs.eci : null;
  const modelos: ModeloLocal[] = cat.modelos.map((orig) => {
    let m: ModeloLocal = { ...orig, fuentes: [...orig.fuentes], puntuacion: orig.puntuacion ? { ...orig.puntuacion } : null };
    if (m.tipo !== "estandar" || m.estado === "candidato") return m;
    const fam = familiaDe(m.id);
    const filas = obs.tags?.[fam];
    if (filas && filas.length > 0) {
      const fila = filas.find((f) => f.tag === tagVivo(m.id));
      if (!fila) {
        if (m.estado === "comprobado") cambios.push({ id: m.id, tipo: "retirado", detalle: `«${m.id}» ya no aparece en la biblioteca de Ollama: deja de recomendarse.` });
        m = { ...m, estado: "sin-comprobar" };
      } else {
        if (Math.abs(fila.descargaGb - m.descargaGb) / m.descargaGb > 0.05) {
          cambios.push({ id: m.id, tipo: "tamano", detalle: `«${m.id}»: descarga ${m.descargaGb.toFixed(1)} → ${fila.descargaGb.toFixed(1)} GB.` });
          m = { ...m, descargaGb: Math.round(fila.descargaGb * 10) / 10 };
        }
        if (fila.contextoK !== m.contextoK) {
          cambios.push({ id: m.id, tipo: "contexto", detalle: `«${m.id}»: contexto ${m.contextoK ?? "?"}K → ${fila.contextoK}K.` });
          m = { ...m, contextoK: fila.contextoK };
        }
        m = { ...m, vision: fila.vision, estado: "comprobado", comprobado: obs.hoy };
      }
    }
    const caps = obs.caps?.[fam];
    if (caps && (caps.tools !== m.herramientas)) {
      cambios.push({ id: m.id, tipo: "capacidad", detalle: `«${m.id}»: herramientas ${caps.tools ? "sí" : "no"}.` });
      m = { ...m, herramientas: caps.tools };
    }
    if (eci && m.eciNombre) {
      const f = eci.find((x) => x.nombre === m.eciNombre);
      if (f) {
        if (!m.puntuacion || Math.abs(m.puntuacion.eci - f.eci) > 0.05) {
          cambios.push({ id: m.id, tipo: "puntuacion", detalle: `«${m.id}»: ECI ${m.puntuacion?.eci ?? "sin dato"} → ${f.eci}.` });
        }
        m = { ...m, puntuacion: { eci: f.eci, fecha: f.fecha, nombreEpoch: f.nombre, fuente: URL_ECI, comprobado: obs.hoy } };
      }
    }
    return m;
  });

  // Familias nuevas y sus etiquetas, como candidatas.
  const vistas = new Set(cat.familiasVistas);
  const nuevas: string[] = [];
  for (const nombre of obs.indice ?? []) {
    if (EDITORES.test(nombre) && NOMBRE_FAMILIA.test(nombre) && !vistas.has(nombre)) {
      nuevas.push(nombre);
      vistas.add(nombre);
      cambios.push({ id: nombre, tipo: "familia-nueva", detalle: `Familia nueva en la biblioteca de Ollama: «${nombre}». Queda como candidata, sin recomendar.` });
    }
  }
  const ya = new Set(modelos.map((m) => m.id));
  for (const fam of nuevas) {
    const filas = obs.tags?.[fam];
    if (!filas) continue;
    for (const f of filas.filter((x) => ETIQUETA_CANDIDATA.test(x.tag) && !ya.has(x.tag)).slice(0, 6)) {
      const caps = obs.caps?.[fam];
      modelos.push({
        id: f.tag, etiqueta: f.tag, familia: fam, editor: "sin comprobar", clase: "normal", tipo: "estandar", runtimes: ["ollama"],
        descargaGb: Math.round(f.descargaGb * 10) / 10, contextoK: f.contextoK, herramientas: caps?.tools ?? false, vision: f.vision,
        razonamiento: caps?.thinking ?? false, licencia: null, puntuacion: null, estado: "candidato", comprobado: obs.hoy,
        fuentes: [urlTags(fam), urlFamilia(fam)], nota: "Candidato: tamaño y contexto leídos hoy; falta contrastar su puntuación antes de recomendarlo.",
      });
      cambios.push({ id: f.tag, tipo: "candidato", detalle: `Candidato nuevo «${f.tag}» (${f.descargaGb.toFixed(1)} GB).` });
    }
  }

  const fr = eci ? fronteraDeFilas(eci) : [];
  const catalogo: CatalogoModelos = {
    ...cat,
    modelos,
    frontera: fr.length > 0 ? fr : cat.frontera,
    familiasVistas: [...vistas],
    revisado: obs.hoy,
    actualizado: cambios.length > 0 || fr.length > 0 ? obs.hoy : cat.actualizado,
  };
  return { catalogo, cambios };
}

// ── Cuándo revisar y qué avisar ──────────────────────────────────────────────────────────────────

/** Como mucho una vez al día y solo con conexión. `forzar` es el botón «Revisar ahora» de la persona. */
export function debeRevisar(e: { ahoraMs: number; ultimoIntentoMs: number | null; enLinea: boolean; forzar?: boolean }): boolean {
  if (!e.enLinea) return false;
  if (e.forzar === true) return true;
  return e.ultimoIntentoMs === null || e.ahoraMs - e.ultimoIntentoMs >= INTERVALO_REVISION_MS;
}

export interface Mejora { caso: CasoUso; de: ModeloLocal | null; a: ModeloLocal }

/** Compara lo recomendado ANTES y DESPUÉS de la revisión: solo cuenta una mejora local real (más puntuación o antes nada). */
export function mejorasTrasRevision(antes: Record<CasoUso, Recomendacion>, despues: Record<CasoUso, Recomendacion>): Mejora[] {
  const out: Mejora[] = [];
  for (const caso of CASOS) {
    const a = antes[caso], d = despues[caso];
    if (d.ruta.tipo !== "local" || !d.modelo || d.veredicto === "falta-disco") continue;
    if (a.modelo?.id === d.modelo.id) continue;
    const ea = a.modelo?.puntuacion?.eci ?? -1, ed = d.modelo.puntuacion?.eci ?? -1;
    if (!a.modelo || ed > ea) out.push({ caso, de: a.modelo, a: d.modelo });
  }
  return out;
}

/** UN aviso discreto (o null). Un mismo aviso no se repite: `vistos` guarda las claves ya mostradas. */
export function avisoDiscreto(mejoras: readonly Mejora[], vistos: readonly string[]): { clave: string; texto: string } | null {
  const m = mejoras.find((x) => !vistos.includes(`${x.caso}:${x.a.id}`));
  if (!m) return null;
  const antes = m.de ? ` (hoy usas «${m.de.etiqueta}»)` : "";
  return { clave: `${m.caso}:${m.a.id}`, texto: `Hay un modelo mejor para esta neurona en ${ETIQUETA_CASO[m.caso].toLowerCase()}: «${m.a.etiqueta}»${antes}.` };
}

/** Une la decisión de «aplicar solo» ya existente con la mejora detectada. */
export function decidirAplicarMejora(opts: { automatico: boolean; manual?: boolean; actualId?: string | null; mejora: Mejora | null; vistos?: readonly string[] }): DecisionAutoActualizar {
  return queAplicar({
    autoUpdate: opts.automatico,
    seleccionActual: opts.actualId ? { id: opts.actualId, manual: opts.manual === true } : null,
    topNuevo: opts.mejora ? { id: opts.mejora.a.id, label: opts.mejora.a.etiqueta } : null,
    vistos: opts.vistos,
  });
}

// ── Orquestación con red inyectada ───────────────────────────────────────────────────────────────

export type Traer = (url: string) => Promise<string>;

export interface ResultadoRevision {
  catalogo: CatalogoModelos;
  cambios: Cambio[];
  fuentesLeidas: number;
  fuentesFallidas: number;
  /** false = no se pudo leer ninguna fuente: el catálogo queda como estaba, con su fecha. */
  revisado: boolean;
}

/** Lee las fuentes vivas y fusiona. Un fallo de una fuente nunca estropea el catálogo ni lanza. */
export async function revisarFuentes(
  cat: CatalogoModelos,
  hoy: string,
  traer: Traer,
  opciones: { perfil?: PerfilNeurona; entorno?: Partial<EntornoRuta>; propios?: readonly ModeloLocal[] } = {},
): Promise<ResultadoRevision & { mejoras: Mejora[] }> {
  const { perfil, entorno, propios = [] } = opciones;
  let ok = 0, mal = 0;
  const leer = async (url: string): Promise<string | null> => {
    if (!urlPermitida(url)) { mal++; return null; }
    try { const t = await traer(url); ok++; return t; } catch { mal++; return null; }
  };
  const csv = await leer(URL_ECI);
  const idx = await leer(URL_INDICE_OLLAMA);
  const obs: Observaciones = { hoy, eci: csv ? parsearEciCsv(csv) : null, indice: idx ? parsearIndiceOllama(idx) : null, tags: {}, caps: {} };
  const familias = new Set(cat.modelos.filter((m) => m.tipo === "estandar" && m.estado !== "candidato").map((m) => familiaDe(m.id)));
  const vistas = new Set(cat.familiasVistas);
  const nuevas = (obs.indice ?? []).filter((n) => EDITORES.test(n) && NOMBRE_FAMILIA.test(n) && !vistas.has(n)).slice(0, 3);
  for (const fam of [...familias, ...nuevas]) {
    const t = await leer(urlTags(fam));
    obs.tags![fam] = t ? parsearTagsOllama(t) : null;
    const f = await leer(urlFamilia(fam));
    obs.caps![fam] = f ? parsearCapacidadesOllama(f) : null;
  }
  if (ok === 0) return { catalogo: cat, cambios: [], fuentesLeidas: 0, fuentesFallidas: mal, revisado: false, mejoras: [] };
  const { catalogo, cambios } = fusionar(cat, obs);
  let mejoras: Mejora[] = [];
  if (perfil) {
    const antes = recomendarTodos({ catalogo: [...cat.modelos, ...propios], perfil, entorno });
    const despues = recomendarTodos({ catalogo: [...catalogo.modelos, ...propios], perfil, entorno });
    mejoras = mejorasTrasRevision(antes, despues);
  }
  return { catalogo, cambios, fuentesLeidas: ok, fuentesFallidas: mal, revisado: true, mejoras };
}
