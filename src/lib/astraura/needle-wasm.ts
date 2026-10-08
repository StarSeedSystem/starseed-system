// Needle 3 de verdad en el navegador (architecture/capas-autoadaptables.md §1, §3 y §6).
// Carga el motor oficial (`needle.js` + `needle.wasm`, Cactus-Compute/needle3) desde el
// almacén de capas o, si falta, de las fuentes de §6 en orden. Elige la profundidad con
// `profundidadNeedle(presupuesto)`. Sin WebAssembly o con un SHA que no casa con el
// catálogo devuelve `no-disponible` y `needle3-client` cae a `/api/needle/decidir`.
// Puro: sin node:*; todo lo externo (fetch, WebAssembly, almacén, fábrica Emscripten)
// se inyecta por `EntornoNeedleWasm`.

import {
  leerCatalogo,
  profundidadNeedle,
  usable,
  type EntradaCapa,
} from "./capas/catalogo";
import { AlmacenCapas, type Almacenamiento } from "./capas/almacen";
import type {
  DecisionNeedle,
  HerramientaNeedle,
  LlamadaNeedle,
} from "./needle3-client";

export const CACHE_NAME_NEEDLE = "needle-wasm-v1";
export const DEFAULT_URL_ENGINE = "/needle/needle.wasm";
export const DEFAULT_URL_GLUE = "/needle/needle.js";
export const DEFAULT_URL_PESOS = "/needle/needle3.cact";
export const ARCHIVO_PESOS = "needle3.cact";
/** Presupuesto web de visita (§4): reflejo de 2 a 6 capas, ≤ 12 MB. */
export const PRESUPUESTO_WEB_DEFECTO_MB = 12;

export interface OpcionesNeedleWasm {
  urlEngine?: string;
  urlPesos?: string;
  sistema?: string;
  maxTokens?: number;
  entorno?: EntornoNeedleWasm;
}

/** Motor Needle 3 ya instanciado (Emscripten en el navegador; falso en pruebas). */
export interface MotorNeedle {
  generar(prompt: string, maxTokens?: number): Promise<string>;
  embeber(texto: string): Promise<number[]>;
}

export interface KitMotor {
  wasm: ArrayBuffer;
  pesos: ArrayBuffer;
  profundidad: number;
  urlGlue: string;
}

export type FabricaMotorNeedle = (kit: KitMotor) => Promise<MotorNeedle>;

/** Todo lo externo se inyecta: así las pruebas no tocan red ni descargan modelos. */
export interface EntornoNeedleWasm {
  /** JSON crudo del catálogo firmado (config/capas-astraura.json). */
  catalogo?: unknown;
  almacen?: Almacenamiento | null;
  presupuestoMb?: number;
  soportaWasm?: () => boolean;
  buscar?: (url: string) => Promise<ArrayBuffer | null>;
  fabrica?: FabricaMotorNeedle;
}

/** Compatibilidad con el contrato que ya usa `needle3-client.ts`. */
export interface EngineNeedleWasm {
  cargado: boolean;
  disponible: boolean;
  motivo?: string;
  profundidad?: number;
  origenEngine: string;
  origenPesos: string;
  ejecutar?: (prompt: string) => Promise<string>;
}

/** El catálogo puede anotar el SHA de cada archivo del paquete web (§6). */
type EntradaConArchivos = EntradaCapa & { archivos?: Record<string, string> };

/** Primera entrada web del reflejo, con runtime needle-wasm. */
export function entradaNeedleWeb(catalogoCrudo: unknown): EntradaCapa | null {
  const catalogo = leerCatalogo(catalogoCrudo);
  return (
    catalogo.capas.find(
      (c) =>
        c.capa === "reflejo" &&
        c.runtime === "needle-wasm" &&
        c.medios.includes("web"),
    ) ?? null
  );
}

/** Fuentes de §6 en orden: copia local, espejos y por último la fuente oficial. */
export function fuentesPesos(
  entrada: EntradaCapa,
  urlLocal = DEFAULT_URL_PESOS,
): string[] {
  return [
    urlLocal,
    ...entrada.espejos.map((e) => `${e.replace(/\/+$/, "")}/${ARCHIVO_PESOS}`),
    `${entrada.fuente_oficial}/resolve/main/${ARCHIVO_PESOS}`,
  ];
}

export async function sha256Hex(datos: ArrayBuffer): Promise<string> {
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buscarPorDefecto(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function paraCachear(urls: string[]): void {
  if (typeof window === "undefined" || !("caches" in window)) return;
  void caches
    .open(CACHE_NAME_NEEDLE)
    .then((cache) => cache.addAll(urls))
    .catch(() => {
      // La caché es un extra: si falla, el motor ya está en memoria.
    });
}

export function construirPromptNeedle(
  consulta: string,
  herramientas: HerramientaNeedle[],
  sistema?: string,
): string {
  const sys = sistema ? `${sistema}\n` : "";
  const tools = JSON.stringify(herramientas);
  return `${sys}Herramientas: ${tools}\nConsulta: ${consulta}`;
}

export function normalizarRespuestaNeedle(
  salidaRaw: string,
  ms?: number,
): DecisionNeedle {
  if (!salidaRaw || !salidaRaw.trim()) {
    return { ok: false, motor: "needle3-wasm", confianza: null, ms, error: "Respuesta vacía" };
  }
  try {
    const data = JSON.parse(salidaRaw) as Record<string, unknown>;
    const rawCalls = (data.function_calls ?? data.llamadas ?? []) as Array<Record<string, unknown>>;
    const llamadas: LlamadaNeedle[] = rawCalls.map((c) => ({
      nombre: String(c.name ?? c.nombre ?? ""),
      argumentos: (c.args ?? c.argumentos ?? {}) as Record<string, unknown>,
    }));
    const conf = typeof data.confidence === "number" ? data.confidence : typeof data.confianza === "number" ? data.confianza : null;
    const raz = typeof data.reasoning === "string" ? data.reasoning : typeof data.razonamiento === "string" ? data.razonamiento : undefined;
    return { ok: true, motor: "needle3-wasm", llamadas, confianza: conf, razonamiento: raz, ms };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, motor: "needle3-wasm", confianza: null, ms, error: `Error de parseo: ${errorMsg}` };
  }
}

export function construirPromptClasificacion(
  texto: string,
  etiquetas: readonly string[],
  sistema?: string,
): string {
  const sys = sistema ? `${sistema}\n` : "";
  return `${sys}Etiquetas: ${JSON.stringify(etiquetas)}\nTexto: ${texto}`;
}

/** De la salida cruda saca una etiqueta de la lista (o null si no casa). */
export function interpretarClasificacion(
  salidaRaw: string,
  etiquetas: readonly string[],
): { etiqueta: string | null; confianza: number | null } {
  try {
    const data = JSON.parse(salidaRaw) as Record<string, unknown>;
    const cruda = String(data.label ?? data.etiqueta ?? "");
    const conf = typeof data.confidence === "number" ? data.confidence
      : typeof data.confianza === "number" ? data.confianza : null;
    const encontrada = etiquetas.find(
      (e) => e.toLowerCase() === cruda.toLowerCase(),
    );
    return { etiqueta: encontrada ?? null, confianza: conf };
  } catch {
    return { etiqueta: null, confianza: null };
  }
}

export function construirPromptExtraccion(
  texto: string,
  campos: readonly string[],
  sistema?: string,
): string {
  const sys = sistema ? `${sistema}\n` : "";
  return `${sys}Campos: ${JSON.stringify(campos)}\nTexto: ${texto}`;
}

/** Extrae solo los campos pedidos; el resto de la salida se ignora. */
export function interpretarExtraccion(
  salidaRaw: string,
  campos: readonly string[],
): Record<string, unknown> {
  try {
    const data = JSON.parse(salidaRaw) as Record<string, unknown>;
    const datos: Record<string, unknown> = {};
    for (const c of campos) {
      if (c in data) datos[c] = data[c];
    }
    return datos;
  } catch {
    return {};
  }
}

/**
 * Fábrica real con el pegamento Emscripten de `needle.js` (solo navegador).
 * El módulo expone la factoría global `createNeedleModule`; los pesos `.cact`
 * y la profundidad elegida se pasan al motor oficial.
 */
const fabricaEmscripten: FabricaMotorNeedle = async (kit) => {
  if (typeof document === "undefined") {
    throw new Error("El pegamento needle.js solo carga en el navegador");
  }
  await new Promise<void>((resuelve, rechaza) => {
    const script = document.createElement("script");
    script.src = kit.urlGlue;
    script.onload = () => resuelve();
    script.onerror = () => rechaza(new Error("needle.js no pudo cargarse"));
    document.head.appendChild(script);
  });
  const fabrica = (globalThis as Record<string, unknown>).createNeedleModule as
    | ((args: Record<string, unknown>) => Promise<MotorNeedle>)
    | undefined;
  if (typeof fabrica !== "function") {
    throw new Error("needle.js no expone createNeedleModule");
  }
  return fabrica({
    wasmBinary: kit.wasm,
    pesos: kit.pesos,
    profundidad: kit.profundidad,
  });
};

let instancia: EngineNeedleWasm | null = null;
let motorActual: MotorNeedle | null = null;

/** Reinicia la instancia guardada (pruebas y recarga manual). */
export function reiniciarNeedleWasm(): void {
  instancia = null;
  motorActual = null;
}

function noDisponible(motivo: string, _entorno: EntornoNeedleWasm): EngineNeedleWasm {
  return {
    cargado: false,
    disponible: false,
    motivo,
    origenEngine: "",
    origenPesos: "",
  };
}

/**
 * Carga el motor oficial. Orden (§6): almacén de capas, copia local en
 * `public/needle/`, espejos del catálogo y por último la fuente oficial.
 * Una capa sin su SHA casado con el catálogo no se usa jamás (§11).
 */
export async function cargarNeedleWasm(
  entorno: EntornoNeedleWasm = {},
): Promise<EngineNeedleWasm> {
  if (instancia?.cargado) return instancia;

  const soporta = entorno.soportaWasm
    ? entorno.soportaWasm()
    : typeof WebAssembly !== "undefined";
  if (!soporta) return noDisponible("sin-webassembly", entorno);

  const entrada = entradaNeedleWeb(entorno.catalogo);
  if (!entrada) return noDisponible("no-en-catalogo", entorno);
  if (!usable(entrada)) return noDisponible("sha-sin-verificar", entorno);

  const presupuesto = entorno.presupuestoMb ?? PRESUPUESTO_WEB_DEFECTO_MB;
  const profundidad = profundidadNeedle(presupuesto);
  if (profundidad === 0) return noDisponible("sin-presupuesto", entorno);

  const buscar = entorno.buscar ?? buscarPorDefecto;

  let pesos: ArrayBuffer | null = null;
  let origenPesos = "";
  if (entorno.almacen) {
    pesos = await new AlmacenCapas(entorno.almacen).abrirCapa(entrada.id);
    if (pesos) origenPesos = `almacen:${entrada.id}`;
  }
  if (!pesos) {
    for (const url of fuentesPesos(entrada)) {
      const datos = await buscar(url);
      if (!datos) continue;
      if ((await sha256Hex(datos)) !== entrada.sha256) continue;
      pesos = datos;
      origenPesos = url;
      break;
    }
  }
  if (!pesos) return noDisponible("sha-no-coincide", entorno);

  const urlEngine = DEFAULT_URL_ENGINE;
  const wasm = await buscar(urlEngine);
  if (!wasm) return noDisponible("engine-no-descargable", entorno);
  const shaEngine = (entrada as EntradaConArchivos).archivos?.["needle.wasm"];
  if (shaEngine && (await sha256Hex(wasm)) !== shaEngine) {
    return noDisponible("sha-engine-no-coincide", entorno);
  }

  try {
    const fabrica = entorno.fabrica ?? fabricaEmscripten;
    const motor = await fabrica({ wasm, pesos, profundidad, urlGlue: DEFAULT_URL_GLUE });
    paraCachear([urlEngine, DEFAULT_URL_GLUE, origenPesos]);
    motorActual = motor;
    instancia = {
      cargado: true,
      disponible: true,
      profundidad,
      origenEngine: urlEngine,
      origenPesos,
      ejecutar: (prompt: string) => motor.generar(prompt),
    };
    return instancia;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return noDisponible(`motor-no-instancia: ${msg}`, entorno);
  }
}

const ahora = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function decisionNoDisponible(motivo: string, ms: number): DecisionNeedle {
  return {
    ok: false,
    motor: "needle3-wasm",
    confianza: null,
    origen: "dispositivo",
    ms,
    error: `no-disponible: ${motivo}`,
  };
}

/** Llamada a herramientas en el dispositivo (reflejo del §3). */
export async function decidirEnDispositivo(
  consulta: string,
  herramientas: HerramientaNeedle[],
  opciones?: OpcionesNeedleWasm,
): Promise<DecisionNeedle> {
  const t0 = ahora();
  try {
    const engine = await cargarNeedleWasm(opciones?.entorno ?? {});
    if (!engine.disponible || !engine.ejecutar) {
      return decisionNoDisponible(engine.motivo ?? "motor", Math.round(ahora() - t0));
    }
    const prompt = construirPromptNeedle(consulta, herramientas, opciones?.sistema);
    const rawOut = await engine.ejecutar(prompt);
    return normalizarRespuestaNeedle(rawOut, Math.round(ahora() - t0));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, motor: "needle3-wasm", confianza: null, ms: Math.round(ahora() - t0), error: errorMsg };
  }
}

/** Alias semántico del contrato de `needle3-client.ts`. */
export const llamarHerramientas = decidirEnDispositivo;

export interface ResultadoClasificacion {
  ok: boolean;
  etiqueta: string | null;
  confianza: number | null;
  ms?: number;
  error?: string;
}

export async function clasificar(
  texto: string,
  etiquetas: readonly string[],
  opciones?: OpcionesNeedleWasm,
): Promise<ResultadoClasificacion> {
  const t0 = ahora();
  const engine = await cargarNeedleWasm(opciones?.entorno ?? {});
  if (!engine.disponible || !motorActual) {
    return { ok: false, etiqueta: null, confianza: null, ms: Math.round(ahora() - t0), error: `no-disponible: ${engine.motivo ?? "motor"}` };
  }
  const prompt = construirPromptClasificacion(texto, etiquetas, opciones?.sistema);
  const { etiqueta, confianza } = interpretarClasificacion(
    await motorActual.generar(prompt, opciones?.maxTokens),
    etiquetas,
  );
  return { ok: etiqueta !== null, etiqueta, confianza, ms: Math.round(ahora() - t0) };
}

export interface ResultadoExtraccion {
  ok: boolean;
  datos: Record<string, unknown>;
  ms?: number;
  error?: string;
}

export async function extraer(
  texto: string,
  campos: readonly string[],
  opciones?: OpcionesNeedleWasm,
): Promise<ResultadoExtraccion> {
  const t0 = ahora();
  const engine = await cargarNeedleWasm(opciones?.entorno ?? {});
  if (!engine.disponible || !motorActual) {
    return { ok: false, datos: {}, ms: Math.round(ahora() - t0), error: `no-disponible: ${engine.motivo ?? "motor"}` };
  }
  const prompt = construirPromptExtraccion(texto, campos, opciones?.sistema);
  const datos = interpretarExtraccion(await motorActual.generar(prompt, opciones?.maxTokens), campos);
  return { ok: Object.keys(datos).length > 0, datos, ms: Math.round(ahora() - t0) };
}

export interface ResultadoEmbedding {
  ok: boolean;
  vector: number[] | null;
  ms?: number;
  error?: string;
}

export async function embeber(
  texto: string,
  opciones?: OpcionesNeedleWasm,
): Promise<ResultadoEmbedding> {
  const t0 = ahora();
  const engine = await cargarNeedleWasm(opciones?.entorno ?? {});
  if (!engine.disponible || !motorActual) {
    return { ok: false, vector: null, ms: Math.round(ahora() - t0), error: `no-disponible: ${engine.motivo ?? "motor"}` };
  }
  const vector = await motorActual.embeber(texto);
  return { ok: vector.length > 0, vector, ms: Math.round(ahora() - t0) };
}
