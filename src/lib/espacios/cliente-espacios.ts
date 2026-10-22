/**
 * Cliente de Spaces públicos de Hugging Face que corre EN EL NAVEGADOR de cada
 * persona (tarea ESP1011A). Contratos: architecture/astraura-avatares-3d.md §11.2
 * (Pixal3D y TRELLIS.2) y architecture/astraura-imagenes.md §3 (capa «espacio»:
 * FLUX.1 schnell y Qwen-Image).
 *
 * Reglas duras:
 *  - La llamada sale del navegador de la persona: cada quien gasta SU cuota de
 *    ZeroGPU. Nunca pasa por nuestros servidores ni usa una cuota compartida.
 *  - El token de Hugging Face, si la persona lo pone, vive SOLO en su aparato
 *    (`safe-storage`) y solo viaja a Hugging Face. Nunca aparece en un mensaje,
 *    un error ni un registro.
 *  - Con imagen de referencia, permiso explícito; fotos de personas, siempre su
 *    consentimiento.
 *  - «Basta de ilusiones»: dormido, lleno, sin cuota o con la API cambiada se
 *    dice tal cual y `generarConRespaldo` pasa a la siguiente opción del plan.
 *  - Ningún sondeo a Supabase.
 *
 * Protocolo: el mismo que usa `@gradio/client` (Gradio 4–6), hablado con `fetch`
 * para no sumar dependencias: `GET /config` (versión, prefijo y funciones),
 * `GET <prefijo>/info` (la API REAL que publica el Space, con sus parámetros),
 * `POST <prefijo>/upload`, `POST <prefijo>/queue/join` y `GET <prefijo>/queue/data`
 * (SSE con la cola, el tiempo estimado y el resultado).
 */
import {
  agotadoHoy,
  almacenDelAparato,
  clasificarErrorEspacio,
  marcarAgotado,
  registrarUso,
  segundosRestantesDeError,
  type AlmacenLocal,
} from "@/lib/espacios/cuota-espacios";
import { safeRemove } from "@/lib/safe-storage";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const CLAVE_API = "starseed.espacios.api.v1";
export const CLAVE_TOKEN_HF = "starseed.espacios.hf-token.v1";
const HF_API = "https://huggingface.co/api/spaces";

export type FalloEspacio = "dormido" | "arrancando" | "lleno" | "cuota" | "api-cambiada" | "permiso" | "sin-red" | "error";

/** Error con su motivo humano. Nunca lleva el token dentro. */
export class ErrorEspacio extends Error {
  constructor(public readonly tipo: FalloEspacio, public readonly espacioId: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorEspacio";
  }
}

export interface ParametroApi {
  nombre: string;
  /** Componente de Gradio («Textbox», «Image», «Slider»…). */
  componente: string;
  tieneDefecto: boolean;
  defecto?: unknown;
}

export interface EndpointApi {
  nombre: string; // «/generate_3d»
  fnIndex: number;
  parametros: ParametroApi[];
}

export interface ApiEspacio {
  espacioId: string;
  host: string;
  version: string;
  apiPrefix: string;
  endpoints: EndpointApi[];
}

export interface OpcionesCliente {
  fetch?: FetchLike;
  almacen?: AlmacenLocal;
  /** Token de la persona; si no se pasa, se lee de su aparato. `null` = sin token. */
  token?: string | null;
  ahora?: () => number;
}

/* ── Token de la persona: solo en su aparato ── */

export function leerTokenHf(almacen: AlmacenLocal = almacenDelAparato): string | null {
  const t = almacen.get(CLAVE_TOKEN_HF);
  return t && t.trim() ? t.trim() : null;
}

/** Guarda el token en ESTE aparato. Devuelve el motivo si no parece un token de Hugging Face. */
export function guardarTokenHf(token: string, almacen: AlmacenLocal = almacenDelAparato): string | null {
  const t = token.trim();
  if (!/^hf_[A-Za-z0-9]{20,}$/.test(t)) return "Eso no parece un token de Hugging Face (empiezan por «hf_»).";
  return almacen.set(CLAVE_TOKEN_HF, t) ? null : "Este aparato no dejó guardar el token.";
}

export function borrarTokenHf(almacen: AlmacenLocal = almacenDelAparato): void {
  if (almacen.remove) almacen.remove(CLAVE_TOKEN_HF);
  else if (almacen === almacenDelAparato) safeRemove(CLAVE_TOKEN_HF);
  else almacen.set(CLAVE_TOKEN_HF, "");
}

/* ── Utilidades ── */

/** Subdominio público de un Space: «TencentARC/Pixal3D» → tencentarc-pixal3d.hf.space. */
export function hostPorDefecto(espacioId: string): string {
  return `https://${espacioId.toLowerCase().replace(/[/._]/g, "-")}.hf.space`;
}

function contexto(op: OpcionesCliente) {
  const almacen = op.almacen ?? almacenDelAparato;
  const token = op.token === undefined ? leerTokenHf(almacen) : op.token;
  const f: FetchLike = op.fetch ?? ((u, i) => fetch(u, i));
  return { almacen, token, f, ahora: op.ahora ?? Date.now };
}

function cabeceras(token: string | null, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function pedir(f: FetchLike, id: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await f(url, init);
  } catch {
    throw new ErrorEspacio("sin-red", id, `No se pudo llegar al Space ${id}: sin conexión o la red lo bloquea.`);
  }
}

async function leerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Estado real del Space según Hugging Face (dormido, arrancando, en error…). */
async function motivoNoResponde(id: string, f: FetchLike): Promise<ErrorEspacio> {
  let etapa = "";
  try {
    const r = await f(`${HF_API}/${id}`);
    const j = (await leerJson(r)) as { runtime?: { stage?: string } } | null;
    etapa = String(j?.runtime?.stage ?? "");
  } catch {
    return new ErrorEspacio("sin-red", id, `No se pudo llegar al Space ${id}: sin conexión o la red lo bloquea.`);
  }
  if (/SLEEPING|PAUSED/.test(etapa)) {
    return new ErrorEspacio("dormido", id, `El Space ${id} está dormido. Despertarlo tarda unos minutos; mientras, se prueba la siguiente opción.`);
  }
  if (/BUILDING|APP_STARTING|RUNNING_BUILDING|STARTING/.test(etapa)) {
    return new ErrorEspacio("arrancando", id, `El Space ${id} está arrancando; aún no acepta trabajos.`);
  }
  if (/ERROR/.test(etapa)) {
    return new ErrorEspacio("error", id, `El Space ${id} está roto ahora mismo (Hugging Face dice «${etapa}»).`);
  }
  return new ErrorEspacio("error", id, `El Space ${id} no respondió como un Space de Gradio${etapa ? ` (estado «${etapa}»)` : ""}.`);
}

/* ── La API real del Space, en caché por versión ── */

function leerCache(almacen: AlmacenLocal): Record<string, ApiEspacio> {
  try {
    const c = JSON.parse(almacen.get(CLAVE_API) ?? "{}") as Record<string, ApiEspacio>;
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}

function escribirCache(almacen: AlmacenLocal, id: string, api: ApiEspacio | null): void {
  const c = leerCache(almacen);
  if (api) c[id] = api;
  else delete c[id];
  almacen.set(CLAVE_API, JSON.stringify(c));
}

interface ConfigGradio {
  version?: string;
  api_prefix?: string;
  dependencies?: Array<{ id?: number; api_name?: string | false | null }>;
}

interface InfoGradio {
  named_endpoints?: Record<string, { parameters?: Array<{ parameter_name?: string; label?: string; component?: string; parameter_has_default?: boolean; parameter_default?: unknown }> }>;
}

/**
 * Lee la API que publica el propio Space. Si la versión de Gradio no cambió
 * desde la última vez, reutiliza la copia del aparato y se ahorra `/info`.
 */
export async function leerApiEspacio(espacioId: string, op: OpcionesCliente = {}): Promise<ApiEspacio> {
  const { almacen, token, f } = contexto(op);
  const host = hostPorDefecto(espacioId);
  const r = await pedir(f, espacioId, `${host}/config`, { headers: cabeceras(token) });
  const config = r.ok ? ((await leerJson(r)) as ConfigGradio | null) : null;
  if (!config || !Array.isArray(config.dependencies)) throw await motivoNoResponde(espacioId, f);

  const version = String(config.version ?? "desconocida");
  const apiPrefix = typeof config.api_prefix === "string" ? config.api_prefix.replace(/\/$/, "") : "";
  const enCache = leerCache(almacen)[espacioId];
  if (enCache && enCache.version === version && enCache.apiPrefix === apiPrefix) return enCache;

  const ri = await pedir(f, espacioId, `${host}${apiPrefix}/info`, { headers: cabeceras(token) });
  const info = ri.ok ? ((await leerJson(ri)) as InfoGradio | null) : null;
  if (!info?.named_endpoints) {
    throw new ErrorEspacio("api-cambiada", espacioId, `El Space ${espacioId} no publica su API; no se puede usar sin adivinar.`);
  }
  const endpoints: EndpointApi[] = [];
  config.dependencies.forEach((dep, i) => {
    if (!dep || typeof dep.api_name !== "string") return;
    const nombre = `/${dep.api_name.replace(/^\//, "")}`;
    const publicado = info.named_endpoints?.[nombre];
    if (!publicado) return;
    endpoints.push({
      nombre,
      fnIndex: typeof dep.id === "number" ? dep.id : i,
      parametros: (publicado.parameters ?? []).map((p, j) => ({
        nombre: String(p.parameter_name ?? p.label ?? `param_${j}`),
        componente: String(p.component ?? ""),
        tieneDefecto: p.parameter_has_default === true,
        defecto: p.parameter_default,
      })),
    });
  });
  const api: ApiEspacio = { espacioId, host, version, apiPrefix, endpoints };
  escribirCache(almacen, espacioId, api);
  return api;
}

/* ── Ejecutar ── */

export interface FileDataGradio {
  path: string;
  url?: string | null;
  orig_name?: string | null;
  mime_type?: string | null;
  meta?: { _type: "gradio.FileData" };
}

export interface EntradaEspacio {
  texto?: string;
  imagen?: Blob;
  /** Valores por nombre de parámetro (mandan sobre texto/imagen y los defectos). */
  datos?: Record<string, unknown>;
}

export interface PermisosEntrada {
  /** true explícito: la persona acepta que SU imagen salga a Hugging Face. */
  permiso?: boolean;
  esFotoDePersonas?: boolean;
  consentimientoPersonas?: boolean;
}

export type ProgresoEspacio =
  | { fase: "cola"; posicion: number; enCola: number | null; segundosEstimados: number | null }
  | { fase: "procesando"; segundosEstimados: number | null }
  | { fase: "descargando" };

export interface OpcionesEjecucion extends OpcionesCliente, PermisosEntrada {
  alProgreso?: (p: ProgresoEspacio) => void;
}

export interface ResultadoEjecucion {
  espacioId: string;
  datos: unknown[];
  archivos: FileDataGradio[];
  segundosGpu: number;
  /** Dónde vive el Space (para descargar sus archivos). */
  base: Pick<ApiEspacio, "host" | "apiPrefix">;
}

/** Motivo por el que la imagen NO puede salir del aparato, o null. */
export function motivoSinPermiso(e: EntradaEspacio, p: PermisosEntrada): string | null {
  if (!e.imagen) return null;
  if (p.permiso !== true) return "Falta tu permiso: tu imagen saldría a un Space público de Hugging Face.";
  if (p.esFotoDePersonas && p.consentimientoPersonas !== true) {
    return "La imagen tiene personas y falta su consentimiento: nunca se sube sin él.";
  }
  return null;
}

const ES_IMAGEN = /image|file|model3d|video|audio|gallery/i;
const ES_TEXTO = /textbox|text|markdown|code/i;

function conArchivo(f: FileDataGradio): FileDataGradio {
  return { ...f, meta: { _type: "gradio.FileData" } };
}

function construirDatos(id: string, ep: EndpointApi, e: EntradaEspacio, archivo: FileDataGradio | null): unknown[] {
  let textoUsado = false;
  let imagenUsada = false;
  return ep.parametros.map((p) => {
    if (e.datos && p.nombre in e.datos) return e.datos[p.nombre];
    if (archivo && !imagenUsada && ES_IMAGEN.test(p.componente)) {
      imagenUsada = true;
      return conArchivo(archivo);
    }
    if (e.texto !== undefined && !textoUsado && ES_TEXTO.test(p.componente)) {
      textoUsado = true;
      return e.texto;
    }
    if (p.tieneDefecto) return p.defecto ?? null;
    throw new ErrorEspacio("api-cambiada", id, `El Space ${id} pide «${p.nombre}» en ${ep.nombre} y no sabemos rellenarlo: su API cambió.`);
  });
}

async function subir(api: ApiEspacio, imagen: Blob, token: string | null, f: FetchLike): Promise<FileDataGradio> {
  const form = new FormData();
  const nombre = (imagen as File).name || "referencia.png";
  form.append("files", imagen, nombre);
  const r = await pedir(f, api.espacioId, `${api.host}${api.apiPrefix}/upload`, { method: "POST", body: form, headers: cabeceras(token) });
  const rutas = r.ok ? ((await leerJson(r)) as unknown) : null;
  if (!Array.isArray(rutas) || typeof rutas[0] !== "string") {
    throw new ErrorEspacio("error", api.espacioId, `El Space ${api.espacioId} no aceptó la imagen.`);
  }
  return { path: rutas[0], orig_name: nombre, mime_type: imagen.type || null };
}

function recogerArchivos(v: unknown, out: FileDataGradio[]): void {
  if (Array.isArray(v)) v.forEach((x) => recogerArchivos(x, out));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.path === "string" && (o.meta !== undefined || "url" in o || "orig_name" in o)) out.push(o as unknown as FileDataGradio);
    else Object.values(o).forEach((x) => recogerArchivos(x, out));
  }
}

/** Lee el SSE de la cola mensaje a mensaje (con streaming si el navegador lo da). */
async function* mensajesSse(r: Response): AsyncGenerator<Record<string, unknown>> {
  const partir = function* (texto: string) {
    for (const linea of texto.split("\n")) {
      if (!linea.startsWith("data:")) continue;
      try {
        yield JSON.parse(linea.slice(5)) as Record<string, unknown>;
      } catch {
        // línea a medias o latido: se ignora
      }
    }
  };
  const lector = r.body?.getReader?.();
  if (!lector) {
    yield* partir(await r.text());
    return;
  }
  const dec = new TextDecoder();
  let resto = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (value) resto += dec.decode(value, { stream: true });
    const corte = resto.lastIndexOf("\n");
    if (corte >= 0) {
      yield* partir(resto.slice(0, corte));
      resto = resto.slice(corte + 1);
    }
    if (done) break;
  }
  if (resto) yield* partir(resto);
}

function errorDeMensaje(id: string, mensaje: string): ErrorEspacio {
  const clase = clasificarErrorEspacio(mensaje);
  if (clase === "cuota") return new ErrorEspacio("cuota", id, `Se acabó tu cuota gratis de GPU en ${id} por hoy.`);
  if (clase === "lleno") return new ErrorEspacio("lleno", id, `La cola del Space ${id} está llena; prueba más tarde.`);
  return new ErrorEspacio("error", id, `El Space ${id} devolvió un error: ${mensaje.slice(0, 200) || "sin detalle"}.`);
}

/**
 * Llama a una función del Space con la API que él mismo publica, enseña la
 * cola y el tiempo estimado, y cuenta los segundos de GPU en la cuota del aparato.
 */
export async function ejecutarEspacio(
  espacioId: string,
  endpoint: string,
  entrada: EntradaEspacio,
  op: OpcionesEjecucion = {},
): Promise<ResultadoEjecucion> {
  const sinPermiso = motivoSinPermiso(entrada, op);
  if (sinPermiso) throw new ErrorEspacio("permiso", espacioId, sinPermiso);
  const { almacen, token, f, ahora } = contexto(op);

  const api = await leerApiEspacio(espacioId, op);
  const nombre = `/${endpoint.replace(/^\//, "")}`;
  const ep = api.endpoints.find((e) => e.nombre === nombre);
  if (!ep) {
    escribirCache(almacen, espacioId, null);
    throw new ErrorEspacio("api-cambiada", espacioId, `El Space ${espacioId} ya no publica ${nombre}: su API cambió.`);
  }
  const archivo = entrada.imagen ? await subir(api, entrada.imagen, token, f) : null;
  const datos = construirDatos(espacioId, ep, entrada, archivo);

  const sesion = Math.random().toString(36).slice(2, 13);
  const base = `${api.host}${api.apiPrefix}`;
  const rj = await pedir(f, espacioId, `${base}/queue/join`, {
    method: "POST",
    headers: cabeceras(token, true),
    body: JSON.stringify({ data: datos, fn_index: ep.fnIndex, session_hash: sesion, event_data: null, trigger_id: null }),
  });
  if (!rj.ok) {
    const cuerpo = (await leerJson(rj)) as { detail?: unknown; error?: unknown } | null;
    const detalle = String(cuerpo?.detail ?? cuerpo?.error ?? "");
    const clase = clasificarErrorEspacio(detalle);
    if (rj.status === 429 || clase !== "otro") {
      const e = errorDeMensaje(espacioId, clase === "otro" ? "queue is full" : detalle);
      if (e.tipo === "cuota") marcarAgotado(espacioId, segundosRestantesDeError(detalle), almacen, ahora());
      throw e;
    }
    if (rj.status === 404 || rj.status === 422) {
      escribirCache(almacen, espacioId, null);
      throw new ErrorEspacio("api-cambiada", espacioId, `El Space ${espacioId} rechazó la llamada a ${nombre}: su API cambió.`);
    }
    throw await motivoNoResponde(espacioId, f);
  }

  const rd = await pedir(f, espacioId, `${base}/queue/data?session_hash=${sesion}`, { headers: { ...cabeceras(token), Accept: "text/event-stream" } });
  if (!rd.ok) throw await motivoNoResponde(espacioId, f);

  let inicio: number | null = null;
  for await (const m of mensajesSse(rd)) {
    const msg = String(m.msg ?? "");
    if (msg === "estimation") {
      const rank = typeof m.rank === "number" ? m.rank : 0;
      op.alProgreso?.({
        fase: "cola",
        posicion: rank + 1,
        enCola: typeof m.queue_size === "number" ? m.queue_size : null,
        segundosEstimados: typeof m.rank_eta === "number" ? m.rank_eta : null,
      });
    } else if (msg === "process_starts") {
      inicio = ahora();
      op.alProgreso?.({ fase: "procesando", segundosEstimados: typeof m.eta === "number" ? m.eta : null });
    } else if (msg === "queue_full") {
      throw errorDeMensaje(espacioId, "queue is full");
    } else if (msg === "unexpected_error") {
      throw errorDeMensaje(espacioId, String(m.message ?? ""));
    } else if (msg === "process_completed") {
      const salida = (m.output ?? {}) as { data?: unknown[]; error?: unknown };
      const segundosGpu = inicio === null ? 0 : Math.max(0, (ahora() - inicio) / 1000);
      if (m.success === false || salida.error) {
        const texto = String(salida.error ?? "");
        const e = errorDeMensaje(espacioId, texto);
        if (e.tipo === "cuota") marcarAgotado(espacioId, segundosRestantesDeError(texto), almacen, ahora());
        else if (segundosGpu > 0) registrarUso(espacioId, segundosGpu, almacen, ahora());
        throw e;
      }
      const datosSalida = Array.isArray(salida.data) ? salida.data : [];
      registrarUso(espacioId, segundosGpu, almacen, ahora());
      const archivos: FileDataGradio[] = [];
      recogerArchivos(datosSalida, archivos);
      return { espacioId, datos: datosSalida, archivos, segundosGpu, base: { host: api.host, apiPrefix: api.apiPrefix } };
    }
  }
  throw new ErrorEspacio("error", espacioId, `El Space ${espacioId} cortó la conexión sin terminar el trabajo.`);
}

/* ── Descargar al aparato ── */

export type TipoResultado = "imagen" | "glb" | "otro";

export interface ArchivoDescargado {
  blob: Blob;
  tipo: TipoResultado;
  nombre: string;
}

export function urlDeArchivo(a: FileDataGradio, api: Pick<ApiEspacio, "host" | "apiPrefix">): string {
  return a.url || `${api.host}${api.apiPrefix}/file=${a.path}`;
}

export function esDeHuggingFace(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.endsWith(".hf.space") || h === "huggingface.co" || h.endsWith(".huggingface.co");
  } catch {
    return false;
  }
}

export function tipoDeArchivo(nombre: string, mime: string | null | undefined): TipoResultado {
  if (/\.glb$/i.test(nombre) || /gltf-binary/i.test(mime ?? "")) return "glb";
  if (/^image\//i.test(mime ?? "") || /\.(png|jpe?g|webp|gif)$/i.test(nombre)) return "imagen";
  return "otro";
}

export async function descargarArchivo(
  espacioId: string,
  archivo: FileDataGradio,
  base: Pick<ApiEspacio, "host" | "apiPrefix">,
  op: OpcionesCliente = {},
): Promise<ArchivoDescargado> {
  const { token, f } = contexto(op);
  const url = urlDeArchivo(archivo, base);
  // El token solo viaja a Hugging Face: si el Space apunta fuera, se descarga sin él.
  const r = await pedir(f, espacioId, url, { headers: cabeceras(esDeHuggingFace(url) ? token : null) });
  if (!r.ok) throw new ErrorEspacio("error", espacioId, `No se pudo descargar el resultado de ${espacioId} (HTTP ${r.status}).`);
  const blob = await r.blob();
  const nombre = archivo.orig_name || archivo.path.split("/").pop() || "resultado";
  return { blob, tipo: tipoDeArchivo(nombre, archivo.mime_type ?? blob.type), nombre };
}

/* ── Varias opciones: si una no puede, se dice y se pasa a la siguiente ── */

export interface OpcionEspacio {
  espacioId: string;
  endpoint: string;
  /** Valores fijos para esa API (p. ej. semilla). */
  datos?: Record<string, unknown>;
}

export interface IntentoFallido {
  espacioId: string;
  tipo: FalloEspacio;
  motivo: string;
}

export type ResultadoConRespaldo =
  | { ok: true; espacioId: string; archivo: ArchivoDescargado; segundosGpu: number; intentos: IntentoFallido[] }
  | { ok: false; intentos: IntentoFallido[] };

export async function generarConRespaldo(
  plan: readonly OpcionEspacio[],
  entrada: EntradaEspacio,
  op: OpcionesEjecucion = {},
): Promise<ResultadoConRespaldo> {
  const almacen = op.almacen ?? almacenDelAparato;
  const ahora = op.ahora ?? Date.now;
  const intentos: IntentoFallido[] = [];
  for (const opcion of plan) {
    if (agotadoHoy(opcion.espacioId, almacen, ahora())) {
      intentos.push({ espacioId: opcion.espacioId, tipo: "cuota", motivo: `Hoy ya se acabó tu cuota en ${opcion.espacioId}; no se gasta otra llamada.` });
      continue;
    }
    try {
      const r = await ejecutarEspacio(opcion.espacioId, opcion.endpoint, { ...entrada, datos: { ...opcion.datos, ...entrada.datos } }, op);
      const archivo = r.archivos[0];
      if (!archivo) {
        intentos.push({ espacioId: opcion.espacioId, tipo: "api-cambiada", motivo: `El Space ${opcion.espacioId} terminó sin devolver ningún archivo.` });
        continue;
      }
      op.alProgreso?.({ fase: "descargando" });
      return { ok: true, espacioId: opcion.espacioId, archivo: await descargarArchivo(opcion.espacioId, archivo, r.base, op), segundosGpu: r.segundosGpu, intentos };
    } catch (e) {
      if (e instanceof ErrorEspacio) {
        intentos.push({ espacioId: e.espacioId, tipo: e.tipo, motivo: e.message });
        if (e.tipo === "permiso") break; // sin permiso no lo arregla otro Space
      } else {
        intentos.push({ espacioId: opcion.espacioId, tipo: "error", motivo: `Fallo inesperado con ${opcion.espacioId}.` });
      }
    }
  }
  return { ok: false, intentos };
}
