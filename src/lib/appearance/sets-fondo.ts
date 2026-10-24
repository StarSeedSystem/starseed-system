/**
 * sets-fondo — formato `.starseed-fondo.json` (Ola 1018F · FSH1018C · architecture/fondos-shaders.md §2): motor base
 * (o null = el actual) + capas de `background-layers.ts` + autoría, licencias y vista previa fija para aparatos sin WebGPU.
 * PURO (reloj, id y catálogo inyectados). `validarSet` RECHAZA con motivos lo peligroso —componentes desconocidos, URLs
 * ajenas a la Biblioteca, > 2 MB, cámara en sets compartidos, muestras remotas por defecto del paquete— y SANEA el resto.
 */
import { normalizeLayers, AUDIOMORPHIC_DEFAULT_URL, type BackgroundLayer } from "./background-layers";
import type { ShaderCatalog, ShaderCatalogEntry } from "./catalogo-shaders";

export const FORMATO_SET = "starseed-fondo", EXTENSION_SET = ".starseed-fondo.json";
export const MAX_SET_BYTES = 2 * 1024 * 1024, MAX_VISTA_BYTES = 300 * 1024;
export const LICENCIA_SHADERS = "MIT · paquete npm «shaders» (Shader Effects Inc.)";
const MAX_CAPAS = 8, MAX_NODOS = 200, MAX_PROF = 12, PNG = "data:image/png;base64,", PESADO = "pesa más de 2 MB";
const CAMARA = ["WebcamTexture", "ObjectTracker"]; // nunca en un set compartido, lo marque o no el catálogo
const MASCARAS = ["ninguna", "radial", "lineal"], TEXTURAS = ["ninguna", "grano", "papel", "escarcha"];

export interface SetFondo {
  formato: typeof FORMATO_SET; version: 1; id: string; nombre: string; autor: string; licencias: string[];
  base: string | null; // motor base (spline, webgl…) o null = se queda el que ya tiene la persona
  capas: BackgroundLayer[]; creado: string; // fecha ISO 8601
  vistaPrevia?: string; // PNG en data URL (≤ 300 KB): sin WebGPU, con ahorro de batería o «reducir movimiento»
}
export interface OpcionesSet {
  catalogo: ShaderCatalog; // el de la versión instalada (`cargarCatalogo`): fija los tipos de componente conocidos
  /** Prefijos de la propia Biblioteca; en la nube, `<URL de Supabase>/storage/v1/object/public/os-files/`. */
  biblioteca?: readonly string[];
  compartido?: boolean; // grupo, página, publicación, Librería: sin cámara, micro ni archivos solo de este aparato
}
export type ResultadoSet = { ok: true; set: SetFondo } | { ok: false; motivos: string[] };
type Obj = Record<string, unknown>;
interface Ctx { o: OpcionesSet; m: string[]; tipos: Map<string, ShaderCatalogEntry>; nodos: number }

const esObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const cadena = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const corto = (s: string): string => (s.startsWith("data:") ? "data:…" : s.length > 60 ? `${s.slice(0, 60)}…` : s);
const num = (v: unknown, lo: number, hi: number, fb: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
const idNuevo = (): string => globalThis.crypto?.randomUUID?.() ?? `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const PARECE_URL = /^\s*(\/\/|[a-z][a-z0-9+.-]*:\/\/|(data|blob|javascript|vbscript|file):)/i;
/** Color o degradado CSS que no puede pedir nada a la red: sin comillas, `:`, `;`, `url(` ni `image-set`. */
const cssSeguro = (s: string): boolean => s.length <= 600 && /^[#a-z0-9%(),.\s/+-]*$/i.test(s) && !/url\(|image-set/i.test(s);

/** data: de imagen o vídeo, `starseed://library/…`, la Biblioteca y —solo en privado— lo de este aparato. */
export function urlAdmitida(u: string, o: Pick<OpcionesSet, "biblioteca" | "compartido">): boolean {
  const s = u.trim(), href = (x: string): string => { try { return new URL(x).href; } catch { return ""; } };
  if (s === "" || /^data:(image|video)\/[a-z0-9.+-]+[;,]/i.test(s) || s.startsWith("starseed://library/")) return true;
  if (s.startsWith("local-archivos-malla://")) return !o.compartido;
  const h = href(s); // `new URL` resuelve `..`, `%2e%2e` y `usuario@host` ANTES de comparar el prefijo
  return h !== "" && (o.biblioteca ?? []).some((p) => { const b = href(p.endsWith("/") ? p : `${p}/`); return b !== "" && h.startsWith(b); });
}

function revisarUrls(v: unknown, clave: string, prof: number, donde: string, x: Ctx): void {
  if (prof > MAX_PROF) x.m.push(`${donde}: datos demasiado anidados`);
  else if (Array.isArray(v)) v.forEach((e) => revisarUrls(e, clave, prof + 1, donde, x));
  else if (esObj(v)) for (const [k, e] of Object.entries(v)) revisarUrls(e, k, prof + 1, donde, x);
  else if (typeof v === "string" && clave !== "text" && (/^(url|src|href)$/i.test(clave) || PARECE_URL.test(v)) && !urlAdmitida(v, x.o))
    x.m.push(`${donde}: URL fuera de la Biblioteca (${corto(v)})`); // `text` solo se muestra: nunca se pide a la red
}

function sanearComponentes(lista: unknown, donde: string, x: Ctx, prof = 0): Obj[] {
  if (!Array.isArray(lista)) { x.m.push(`${donde}: los componentes tienen que ser una lista`); return []; }
  const out: Obj[] = [];
  for (const c of lista) {
    if (++x.nodos > MAX_NODOS || prof > MAX_PROF) { x.m.push(`${donde}: preset demasiado grande`); break; }
    if (!esObj(c) || typeof c.type !== "string") { x.m.push(`${donde}: componente sin tipo`); continue; }
    const e = x.tipos.get(c.type), p = esObj(c.props) ? c.props : {};
    if (!e) x.m.push(`${donde}: componente «${corto(c.type)}» desconocido`);
    if (x.o.compartido && (CAMARA.includes(c.type) || e?.requiereCamara)) x.m.push(`${donde}: «${c.type}» usa la cámara y el set es compartido`);
    for (const [k, meta] of Object.entries(e?.props ?? {})) { // p. ej. ImageTexture trae por defecto una muestra de shaders.com
      const d = esObj(meta) ? meta.default : undefined;
      if (typeof d === "string" && PARECE_URL.test(d) && !cadena(p[k], Infinity)) x.m.push(`${donde}: «${c.type}» sin «${k}» propio cargaría ${corto(d)}`);
    }
    revisarUrls(p, "", 1, donde, x);
    const hijos = Array.isArray(c.children) ? { children: sanearComponentes(c.children, donde, x, prof + 1) } : {};
    out.push({ type: c.type, ...(typeof c.id === "string" ? { id: c.id.slice(0, 64) } : {}), props: p, ...hijos });
  }
  return out;
}

function sanearCapas(raw: unknown, x: Ctx): BackgroundLayer[] {
  if (!Array.isArray(raw)) { x.m.push("capas: tiene que ser una lista"); return []; }
  if (raw.length > MAX_CAPAS) x.m.push(`capas: ${MAX_CAPAS} como mucho`);
  const capas = normalizeLayers(raw); // sus topes de siempre; lo que no cubre (posición, máscara, textura, URLs) se rehace aquí
  if (capas.length < Math.min(raw.length, MAX_CAPAS)) x.m.push("capas: hay capas vacías o de un tipo desconocido");
  return capas.map((c, i): BackgroundLayer => {
    const donde = `capa ${i + 1}`, v = c.value ?? "", t: Obj = esObj(c.transform) ? c.transform : {}, css = c.kind === "color" || c.kind === "gradiente";
    const capa: BackgroundLayer = { id: /^[\w-]{1,64}$/.test(c.id) ? c.id : idNuevo(), kind: c.kind, name: c.name?.slice(0, 80), visible: c.visible,
      opacity: c.opacity, blend: c.blend, mascara: MASCARAS.includes(String(c.mascara)) ? c.mascara : "ninguna",
      transform: { x: num(t.x, 0, 1, 0), y: num(t.y, 0, 1, 0), escala: num(t.escala, 0, 1, 1), rotacion: num(t.rotacion, -360, 360, 0),
        ancho: num(t.ancho, 0, 1, 1), alto: num(t.alto, 0, 1, 1) } };
    if (css || c.kind === "imagen" || c.kind === "video") {
      capa.value = v;
      if (css ? !cssSeguro(v) : !urlAdmitida(v, x.o)) x.m.push(`${donde}: ${css ? "CSS no permitido" : "URL fuera de la Biblioteca"} (${corto(v)})`);
    }
    const pr: Obj = esObj(c.preset) ? c.preset : {}, d = c.difusion, a = c.audiomorphic;
    if (c.kind === "shader") capa.preset = { components: sanearComponentes(pr.components ?? [], donde, x),
      ...(typeof pr.structureVersion === "number" ? { structureVersion: pr.structureVersion } : {}) };
    if (c.kind === "difusion" && d) capa.difusion = { modo: d.modo, desenfoquePx: d.desenfoquePx, opacidad: d.opacidad,
      textura: TEXTURAS.includes(d.textura) ? d.textura : "ninguna", ...(d.modo === "tono" ? { tono: cssSeguro(d.tono ?? "") ? d.tono : "#ffffff" } : {}) };
    if (c.kind === "audiomorphic" && a) { // el iframe solo puede ser el oficial y nunca roba clics; micro solo en privado
      if (a.url !== AUDIOMORPHIC_DEFAULT_URL) x.m.push(`${donde}: Audiomorphic solo admite su URL oficial`);
      revisarUrls(a.visual, "", 1, donde, x);
      capa.audiomorphic = { ...a, mic: a.mic && !x.o.compartido, interactive: false };
    }
    return capa;
  });
}

/** Valida y sanea un set venga de donde venga (archivo, Biblioteca, neurona). Nunca modifica `json`. */
export function validarSet(json: unknown, o: OpcionesSet): ResultadoSet {
  let txt: string | undefined;
  try { txt = JSON.stringify(json); } catch { return { ok: false, motivos: ["no se puede serializar como JSON"] }; }
  if (txt && bytes(txt) > MAX_SET_BYTES) return { ok: false, motivos: [PESADO] };
  const j: unknown = txt ? JSON.parse(txt) : null; // copia profunda: el objeto de quien llama queda intacto
  if (!esObj(j)) return { ok: false, motivos: ["no es un set de fondos"] };
  const x: Ctx = { o, m: [], tipos: new Map(Object.values(o.catalogo).flat().map((e) => [e.name, e] as const)), nodos: 0 };
  const vp = j.vistaPrevia, lic = j.licencias, b64 = typeof vp === "string" ? vp.slice(PNG.length) : "";
  const png = typeof vp === "string" && vp.startsWith(`${PNG}iVBORw0KGgo`) && /^[A-Za-z0-9+/]*={0,2}$/.test(b64) && (b64.length * 3) / 4 <= MAX_VISTA_BYTES;
  const reglas: Array<[boolean, string]> = [
    [j.formato === FORMATO_SET, `formato: se esperaba «${FORMATO_SET}»`], [j.version === 1, "versión no admitida (solo la 1)"],
    [typeof j.id === "string" && /^[\w-]{1,64}$/.test(j.id), "id: de 1 a 64 letras, cifras, «-» o «_»"],
    [cadena(j.nombre, 120), "nombre: obligatorio, 120 caracteres como mucho"],
    [typeof j.autor === "string" && j.autor.length <= 120, "autor: texto de 120 caracteres como mucho"],
    [j.base === null || (typeof j.base === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(j.base)), "base: motor no válido (o null = el actual)"],
    [Array.isArray(lic) && lic.length <= 32 && lic.every((l) => cadena(l, 200)), "licencias: lista de textos (32 como mucho)"],
    [vp === undefined || png, "vistaPrevia: PNG en data URL de 300 KB como mucho"],
    [typeof j.creado === "string" && !Number.isNaN(Date.parse(j.creado)), "creado: fecha ISO 8601"]];
  for (const [bien, motivo] of reglas) if (!bien) x.m.push(motivo);
  const capas = sanearCapas(j.capas, x);
  if (x.m.length) return { ok: false, motivos: [...new Set(x.m)].slice(0, 20) };
  return { ok: true, set: { formato: FORMATO_SET, version: 1, id: j.id as string, nombre: (j.nombre as string).trim(), autor: j.autor as string,
    licencias: lic as string[], base: j.base as string | null, capas, creado: j.creado as string, ...(png ? { vistaPrevia: vp as string } : {}) } };
}

/** Lee el texto de un `.starseed-fondo.json`: mide ANTES de parsear (nada de 2 MB+ convertido en objetos). */
export function importarSet(texto: string, o: OpcionesSet): ResultadoSet {
  if (texto.length > MAX_SET_BYTES || bytes(texto) > MAX_SET_BYTES) return { ok: false, motivos: [PESADO] };
  let j: unknown;
  try { j = JSON.parse(texto); } catch { return { ok: false, motivos: ["el archivo no es JSON válido"] }; }
  return validarSet(j, o);
}

export interface DatosSet { nombre: string; base: string | null; capas: BackgroundLayer[]; autor: string; licencias?: string[]; vistaPrevia?: string; id?: string }
/** Crea el set (añade la licencia MIT de shaders si usa capas shader), lo valida y da el JSON y el nombre de archivo. */
export function exportarSet(d: DatosSet, o: OpcionesSet & { ahora?: () => Date; crearId?: () => string }):
  { ok: true; set: SetFondo; json: string; archivo: string } | { ok: false; motivos: string[] } {
  const licencias = [...new Set([...(d.licencias ?? []), ...(d.capas.some((c) => c.kind === "shader") ? [LICENCIA_SHADERS] : [])])];
  const r = validarSet({ formato: FORMATO_SET, version: 1, id: d.id ?? (o.crearId ?? idNuevo)(), nombre: d.nombre, autor: d.autor, licencias,
    base: d.base, capas: d.capas, vistaPrevia: d.vistaPrevia, creado: (o.ahora?.() ?? new Date()).toISOString() }, o);
  if (!r.ok) return r;
  const bonito = JSON.stringify(r.set, null, 2); // legible, salvo que la sangría lo pase de 2 MB al reimportarlo
  const slug = d.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return { ...r, json: bytes(bonito) <= MAX_SET_BYTES ? bonito : JSON.stringify(r.set), archivo: `${slug || "fondo"}${EXTENSION_SET}` };
}
