// Autoactualización diaria del catálogo comparativo (MOD1110A). Amplía `auto-actualizar-modelos.ts`:
// aquel decide SI se aplica un top nuevo; este revisa las fuentes vivas, fusiona con fechas y levanta
// UN aviso discreto cuando hay un modelo mejor para esta neurona. La red se inyecta (`traer`): lo puro
// se prueba sin red. Fuentes y permisos: solo ollama.com/library y epoch.ai/data/eci_scores.csv.

import { queAplicar, type DecisionAutoActualizar } from "@/lib/astraura/auto-actualizar-modelos";
import { PUBLICADORES_HF_NORMALES, PUBLICADORES_SIN_FILTROS, PUBLICADORES_SIN_FILTROS_HF } from "./catalogo";
import { recomendarTodos, type EntornoRuta, type Recomendacion } from "./recomendar";
import type { PerfilNeurona } from "./perfil-neurona";
import { CASOS, ETIQUETA_CASO, type CasoUso, type CatalogoModelos, type ModeloLocal, type PuntoFrontera } from "./tipos";

export const URL_ECI = "https://epoch.ai/data/eci_scores.csv";
export const URL_INDICE_OLLAMA = "https://ollama.com/search?o=newest";
export const URL_INDICE_HF_GGUF = "https://huggingface.co/api/models?filter=gguf&sort=trendingScore&limit=20";
export const urlModeloHf = (repo: string) => `https://huggingface.co/api/models/${repo}?blobs=true`;
// Una «familia» es `qwen3.5` (biblioteca oficial) o `huihui_ai/qwen3.5-abliterated` (variante sin filtros de un publicador de la lista cerrada).
const baseFamilia = (familia: string) => (familia.includes("/") ? `https://ollama.com/${familia}` : `https://ollama.com/library/${familia}`);
export const urlTags = (familia: string) => `${baseFamilia(familia)}/tags`;
export const urlFamilia = (familia: string) => baseFamilia(familia);
/** Como mucho una revisión completa al día. */
export const INTERVALO_REVISION_MS = 24 * 60 * 60 * 1000;
const NOMBRE_FAMILIA = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const NOMBRE_HF_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

export function repoHfDeId(id: string): { repo: string; cuant: string } | null {
  if (!id.startsWith("hf.co/")) return null;
  const sinPref = id.slice(6);
  const idx = sinPref.indexOf(":");
  if (idx < 0) return null;
  const repo = sinPref.slice(0, idx);
  const cuant = sinPref.slice(idx + 1);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !cuant) return null;
  return { repo, cuant };
}

/** Lista cerrada de URLs que el servicio de revisión puede leer (la usa también la ruta de la API). */
export function urlPermitida(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.hostname === "epoch.ai") return u.pathname === "/data/eci_scores.csv" && u.search === "";
  if (u.hostname === "huggingface.co") {
    if (u.pathname === "/api/models" && u.search === "?filter=gguf&sort=trendingScore&limit=20") return true;
    const hf = /^\/api\/models\/([\w.-]+)\/([\w.-]+)$/.exec(u.pathname);
    if (!hf) return false;
    if (u.search !== "" && u.search !== "?blobs=true") return false;
    return (PUBLICADORES_HF_NORMALES.includes(hf[1]) || PUBLICADORES_SIN_FILTROS_HF.includes(hf[1])) && NOMBRE_HF_REPO.test(hf[2]);
  }
  if (u.hostname !== "ollama.com") return false;
  if (u.pathname === "/search") return u.search === "?o=newest";
  const m = /^\/library\/([^/]+)(\/tags)?$/.exec(u.pathname);
  if (m) return NOMBRE_FAMILIA.test(m[1]) && u.search === "";
  // (MOD1110B) Páginas de las variantes sin filtros: SOLO de los publicadores de la lista cerrada.
  const c = /^\/([\w.-]+)\/([^/]+)(\/tags)?$/.exec(u.pathname);
  return !!c && PUBLICADORES_SIN_FILTROS.includes(c[1]) && NOMBRE_FAMILIA.test(c[2]) && u.search === "";
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

/** Lee la página `/library/<familia>/tags` de Ollama: tamaño (el menor del rango), contexto (K o M) y entrada. */
export function parsearTagsOllama(html: string): FilaTag[] {
  const out = new Map<string, FilaTag>();
  const re = /href="\/(?:library\/)?([\w.-]+(?:\/[\w.-]+)?:[\w.-]+)"[\s\S]{0,1500}?•\s*([\d.]+)\s*(GB|MB)(?:\s*-\s*[\d.]+\s*(?:GB|MB))?\s*•\s*(\d+(?:\.\d+)?)(K|M) context window[\s\S]{0,300}?\b(Text, Image|Text) input/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (out.has(m[1])) continue;
    const n = Number(m[2]);
    const ctxN = Number(m[4]);
    out.set(m[1], {
      tag: m[1],
      descargaGb: m[3] === "MB" ? n / 1024 : n,
      contextoK: m[5] === "M" ? Math.round(ctxN * 1024) : ctxN,
      vision: m[6] === "Text, Image",
    });
  }
  return [...out.values()];
}

export interface FilaHfTag {
  archivo: string;
  cuant: string;
  descargaGb: number;
  vision: boolean;
  licencia: string | null;
}

/** Extrae cuantizaciones GGUF y tamaños reales del JSON de `https://huggingface.co/api/models/<org>/<repo>?blobs=true`. */
export function parsearModeloHf(jsonText: string): FilaHfTag[] {
  let d: Record<string, unknown>;
  try { d = JSON.parse(jsonText) as Record<string, unknown>; } catch { return []; }
  if (!d || typeof d !== "object" || !Array.isArray(d.siblings)) return [];
  const tags = Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const card = (typeof d.cardData === "object" && d.cardData !== null ? d.cardData : {}) as Record<string, unknown>;
  const licencia = typeof card.license === "string" && card.license ? card.license : null;
  const siblings = d.siblings as Array<{ rfilename?: unknown; size?: unknown; lfs?: { size?: unknown } | null }>;
  const tieneMmproj = siblings.some((s) => typeof s.rfilename === "string" && /mmproj.*\.gguf$/i.test(s.rfilename));
  const vision = d.pipeline_tag === "image-text-to-text" || tags.includes("image-text-to-text") || tieneMmproj;
  const out: FilaHfTag[] = [];
  for (const s of siblings) {
    if (typeof s.rfilename !== "string" || !/\.gguf$/i.test(s.rfilename)) continue;
    if (/mmproj|lora/i.test(s.rfilename)) continue;
    const qm = /(IQ\d+_[A-Z0-9]+|Q\d+_[A-Z0-9_]+|BF16|F16|F32)\.gguf$/i.exec(s.rfilename);
    if (!qm) continue;
    const bytes = Number(s.size ?? s.lfs?.size ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) continue;
    out.push({
      archivo: s.rfilename,
      cuant: qm[1].toUpperCase(),
      descargaGb: Math.round((bytes / 1e9) * 10) / 10,
      vision,
      licencia,
    });
  }
  return out;
}

export interface TendenciaHf {
  repo: string;
  org: string;
  vision: boolean;
  licencia: string | null;
}

/** Lee los GGUF en tendencia de `huggingface.co/api/models` filtrados a publicadores normales permitidos. */
export function parsearTendenciasHf(jsonText: string): TendenciaHf[] {
  let arr: unknown;
  try { arr = JSON.parse(jsonText); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: TendenciaHf[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id.includes("/")) continue;
    const [org, nombre] = r.id.split("/");
    if (!org || !nombre || !PUBLICADORES_HF_NORMALES.includes(org) || !NOMBRE_HF_REPO.test(nombre)) continue;
    const tags = Array.isArray(r.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
    if (!tags.includes("gguf")) continue;
    const licTag = tags.find((t) => t.startsWith("license:"));
    out.push({
      repo: r.id,
      org,
      vision: r.pipeline_tag === "image-text-to-text" || tags.includes("image-text-to-text"),
      licencia: licTag ? licTag.slice(8) : null,
    });
  }
  return out;
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
  /** Por repo Hugging Face (<org>/<repo>): archivos GGUF detectados; null = fallo de lectura. */
  hf?: Record<string, readonly FilaHfTag[] | null>;
  /** Repos GGUF en tendencia en Hugging Face; null = fallo de lectura. */
  tendenciasHf?: readonly TendenciaHf[] | null;
}

const familiaDe = (id: string) => id.split(":")[0];
const tagVivo = (id: string) => (id.includes(":") ? id : `${id}:latest`);
const EDITORES = /^(qwen|gemma|gpt-oss|deepseek|glm|llama|mistral|ministral|phi|smollm|olmo|granite|nemotron|lfm|bonsai|inkling|kimi|minimax|devstral|cogito)/;
const ETIQUETA_CANDIDATA = /^[\w.-]+:(\d+(\.\d+)?b|e\d+b|latest)$/;

/**
 * Funde lo observado hoy con el catálogo. Reglas:
 *  · una etiqueta que sigue en Ollama conserva `comprobado` y se pone a hoy; si cambia tamaño/contexto se actualiza y se anota;
 *  · un GGUF en Hugging Face (`hf.co/...`) actualiza tamaño, visión y fecha comprobada desde su ficha viva;
 *  · una etiqueta/cuantización que ya no aparece pasa a «sin-comprobar» (deja de recomendarse);
 *  · una fuente que no se pudo leer NO cambia nada (un fallo de red nunca borra datos);
 *  · las familias o repos nuevos entran como «candidato» (no se recomiendan hasta contrastarse);
 *  · la frontera se recalcula con los récords de Epoch.
 */
export function fusionar(cat: CatalogoModelos, obs: Observaciones): { catalogo: CatalogoModelos; cambios: Cambio[] } {
  const cambios: Cambio[] = [];
  const eci = obs.eci && obs.eci.length > 0 ? obs.eci : null;
  const modelos: ModeloLocal[] = cat.modelos.map((orig) => {
    let m: ModeloLocal = { ...orig, fuentes: [...orig.fuentes], puntuacion: orig.puntuacion ? { ...orig.puntuacion } : null };
    if (m.tipo !== "estandar" || m.estado === "candidato") return m;
    const hfRef = repoHfDeId(m.id);
    if (hfRef) {
      const filasHf = obs.hf?.[hfRef.repo];
      if (filasHf && filasHf.length > 0) {
        const fila = filasHf.find((f) => f.cuant.toLowerCase() === hfRef.cuant.toLowerCase());
        if (!fila) {
          if (m.estado === "comprobado") cambios.push({ id: m.id, tipo: "retirado", detalle: `«${m.id}» ya no aparece en Hugging Face: deja de recomendarse.` });
          m = { ...m, estado: "sin-comprobar" };
        } else {
          if (m.descargaGb > 0 && Math.abs(fila.descargaGb - m.descargaGb) / m.descargaGb > 0.05) {
            cambios.push({ id: m.id, tipo: "tamano", detalle: `«${m.id}»: descarga ${m.descargaGb.toFixed(1)} → ${fila.descargaGb.toFixed(1)} GB.` });
            m = { ...m, descargaGb: fila.descargaGb };
          }
          m = { ...m, vision: fila.vision || m.vision, estado: "comprobado", comprobado: obs.hoy };
        }
      }
      return m;
    }
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

  for (const t of obs.tendenciasHf ?? []) {
    if (vistas.has(t.repo)) continue;
    vistas.add(t.repo);
    cambios.push({ id: t.repo, tipo: "familia-nueva", detalle: `Repositorio GGUF en tendencia en Hugging Face: «${t.repo}». Queda como candidato, sin recomendar.` });
    const filasHf = obs.hf?.[t.repo];
    if (!filasHf || filasHf.length === 0) continue;
    const ordenadas = filasHf.slice().sort((a, b) => a.descargaGb - b.descargaGb);
    const elegir = ordenadas.find((x) => x.descargaGb >= 0.5) ?? ordenadas[0];
    const idCand = `hf.co/${t.repo}:${elegir.cuant}`;
    if (ya.has(idCand)) continue;
    ya.add(idCand);
    modelos.push({
      id: idCand,
      etiqueta: idCand,
      familia: t.repo.split("/")[1] ?? t.repo,
      editor: t.org,
      clase: "normal",
      tipo: "estandar",
      runtimes: ["ollama"],
      descargaGb: elegir.descargaGb,
      contextoK: null,
      herramientas: false,
      vision: elegir.vision || t.vision,
      razonamiento: false,
      licencia: elegir.licencia ?? t.licencia,
      puntuacion: null,
      estado: "candidato",
      comprobado: obs.hoy,
      fuentes: [urlModeloHf(t.repo)],
      nota: "Candidato GGUF detectado en Hugging Face: tamaño leído hoy; falta contrastar su puntuación antes de recomendarlo.",
    });
    cambios.push({ id: idCand, tipo: "candidato", detalle: `Candidato nuevo «${idCand}» (${elegir.descargaGb.toFixed(1)} GB).` });
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
    if (!a.modelo || ed > ea || (d.modelo.preferente === true && a.modelo.preferente !== true)) out.push({ caso, de: a.modelo, a: d.modelo });
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
  const idxHf = await leer(URL_INDICE_HF_GGUF);
  const obs: Observaciones = {
    hoy,
    eci: csv ? parsearEciCsv(csv) : null,
    indice: idx ? parsearIndiceOllama(idx) : null,
    tendenciasHf: idxHf ? parsearTendenciasHf(idxHf) : null,
    tags: {},
    caps: {},
    hf: {},
  };
  const familias = new Set(
    cat.modelos
      .filter((m) => m.tipo === "estandar" && m.estado !== "candidato" && !m.id.startsWith("hf.co/"))
      .map((m) => familiaDe(m.id)),
  );
  const vistas = new Set(cat.familiasVistas);
  const nuevas = (obs.indice ?? []).filter((n) => EDITORES.test(n) && NOMBRE_FAMILIA.test(n) && !vistas.has(n)).slice(0, 3);
  for (const fam of [...familias, ...nuevas]) {
    const t = await leer(urlTags(fam));
    obs.tags![fam] = t ? parsearTagsOllama(t) : null;
    const f = await leer(urlFamilia(fam));
    obs.caps![fam] = f ? parsearCapacidadesOllama(f) : null;
  }
  const reposHf = new Set(
    cat.modelos
      .filter((m) => m.tipo === "estandar" && m.estado !== "candidato")
      .map((m) => repoHfDeId(m.id)?.repo)
      .filter((r): r is string => Boolean(r)),
  );
  for (const t of (obs.tendenciasHf ?? []).filter((x) => !vistas.has(x.repo)).slice(0, 2)) {
    reposHf.add(t.repo);
  }
  for (const repo of reposHf) {
    const h = await leer(urlModeloHf(repo));
    obs.hf![repo] = h ? parsearModeloHf(h) : null;
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
