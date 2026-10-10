/**
 * config — `config()` del kit StarSeed Link: a qué StarSeed OS y a qué base de datos se conecta
 * la app (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/vinculo-apps-starseed-link.md`. Regla que sale del 2026-10-10 (el login
 * de Omnifrecuencias daba «exceed_egress_quota» porque tenía fijado el proyecto viejo): **ninguna
 * app vinculada fija la base de datos del OS**. La pide a `GET <os>/api/vinculo/config` (pública,
 * CORS abierto, solo la URL y la clave anon, que son públicas por diseño) y, si no responde:
 *   1. lo último que guardó (si no es un proyecto retirado);
 *   2. lo que trae su entorno de compilación (si no es un proyecto retirado);
 *   3. el `respaldo` que le pase la propia app (si no es un proyecto retirado).
 * Este archivo NO lleva ninguna clave: la clave anon llega del OS, del entorno o de la app.
 * Nunca lanza.
 */

export const OS_PUBLICO = "https://starseed-os.vercel.app";
export const RUTA_CONFIG = "/api/vinculo/config";
/** Misma clave que ya usaba Omnifrecuencias desde a6bdd53: no se pierde lo guardado. */
export const CLAVE_CONFIG = "starseed.vinculo.config.v1";
/** Proyectos del OS que ya no se usan: se ignoran aunque vengan del entorno o de lo guardado. */
export const PROYECTOS_RETIRADOS: readonly string[] = ["pqzdpmedcsgcedkvndzl", "nxstilnyidvkqeosofuh"];
/** Proyecto activo conocido (2026-10-10). Solo la URL: la clave la da el OS o la app. */
export const PROYECTO_ACTIVO_CONOCIDO = "https://jhgvhkypqadfdkkqoxta.supabase.co";

const RE_URL_SUPABASE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;

export interface ProyectoSupabase {
  url: string;
  anonKey: string;
}

export type OrigenConfig = "os" | "guardada" | "entorno" | "respaldo" | "ninguno";

export interface ConfigVinculo {
  v: 1;
  /** Origen del OS (para enlaces, login y estaciones). */
  os: string;
  supabase: ProyectoSupabase | null;
  servicios: { login: string; estaciones: string };
  /** De dónde salió la base de datos. */
  origen: OrigenConfig;
}

/** Almacenamiento mínimo (localStorage, el de Capacitor/Electron o uno en memoria para pruebas). */
export interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** localStorage si existe y deja usarse; si no, null (modo privado, servidor…). */
export function almacenPorDefecto(): Almacen | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return null;
    const k = "__ssl_prueba__";
    ls.setItem(k, "1");
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

/** ¿Esta URL es de un proyecto retirado? */
export function esRetirado(url: string): boolean {
  return PROYECTOS_RETIRADOS.some((r) => url.includes(r));
}

/** Valida un proyecto: URL de Supabase bien formada, clave anon con forma de JWT y no retirado. */
export function proyectoValido(x: unknown): ProyectoSupabase | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim().replace(/\/$/, "") : "";
  const anonKey = typeof o.anonKey === "string" ? o.anonKey.trim() : "";
  if (!RE_URL_SUPABASE.test(url) || !anonKey.startsWith("eyJ") || anonKey.length > 2000) return null;
  if (esRetirado(url)) return null;
  return { url, anonKey };
}

function servicios(os: string): ConfigVinculo["servicios"] {
  return { login: `${os}/login`, estaciones: `${os}/estaciones` };
}

function limpiarOs(os: string | undefined): string {
  try {
    const u = new URL(os || OS_PUBLICO);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return OS_PUBLICO;
    return u.origin;
  } catch {
    return OS_PUBLICO;
  }
}

export interface OpcionesConfig {
  /** Origen del OS (por defecto el público). */
  os?: string;
  /** Lo que trae la app en su entorno (`VITE_SUPABASE_URL`/`_ANON_KEY`, etc.). */
  entorno?: Partial<ProyectoSupabase> | null;
  /** Último recurso que conoce la app. */
  respaldo?: Partial<ProyectoSupabase> | null;
  almacen?: Almacen | null;
  fetch?: typeof fetch;
  /** Tiempo máximo para que conteste el OS (ms). */
  esperaMs?: number;
}

function leerGuardada(almacen: Almacen | null): ProyectoSupabase | null {
  if (!almacen) return null;
  try {
    return proyectoValido(JSON.parse(almacen.getItem(CLAVE_CONFIG) || "null"));
  } catch {
    return null;
  }
}

/**
 * La configuración que hay SIN preguntar a nadie (para crear el cliente al arrancar, sin esperar a
 * la red): guardada → entorno → respaldo. Pura salvo leer el almacén.
 */
export function configSincrona(op: OpcionesConfig = {}): ConfigVinculo {
  const os = limpiarOs(op.os);
  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;
  const guardada = leerGuardada(almacen);
  if (guardada) return { v: 1, os, supabase: guardada, servicios: servicios(os), origen: "guardada" };
  const entorno = proyectoValido(op.entorno);
  if (entorno) return { v: 1, os, supabase: entorno, servicios: servicios(os), origen: "entorno" };
  const respaldo = proyectoValido(op.respaldo);
  if (respaldo) return { v: 1, os, supabase: respaldo, servicios: servicios(os), origen: "respaldo" };
  return { v: 1, os, supabase: null, servicios: servicios(os), origen: "ninguno" };
}

/**
 * `config()`: pregunta al OS (con tiempo máximo), guarda lo que diga y, si no contesta, cae a
 * `configSincrona`. Una respuesta del OS con un proyecto retirado o mal formado no se acepta.
 */
export async function config(op: OpcionesConfig = {}): Promise<ConfigVinculo> {
  const os = limpiarOs(op.os);
  const almacen = op.almacen === undefined ? almacenPorDefecto() : op.almacen;
  const f = op.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  if (f) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const corte = setTimeout(() => ctrl?.abort(), Math.max(500, op.esperaMs ?? 6000));
    try {
      const r = await f(`${os}${RUTA_CONFIG}`, { cache: "no-store", signal: ctrl?.signal } as RequestInit);
      if (r.ok) {
        const j = (await r.json()) as { supabase?: unknown; servicios?: { login?: unknown; estaciones?: unknown } };
        const sb = proyectoValido(j?.supabase);
        if (sb) {
          try {
            almacen?.setItem(CLAVE_CONFIG, JSON.stringify(sb));
          } catch {
            /* sin almacenamiento: vale para esta vez */
          }
          const sv = servicios(os);
          const login = typeof j.servicios?.login === "string" && j.servicios.login.startsWith(os) ? j.servicios.login : sv.login;
          const estaciones = typeof j.servicios?.estaciones === "string" && j.servicios.estaciones.startsWith(os) ? j.servicios.estaciones : sv.estaciones;
          return { v: 1, os, supabase: sb, servicios: { login, estaciones }, origen: "os" };
        }
      }
    } catch {
      /* sin red, CORS o tiempo agotado: se sigue con lo que hay */
    } finally {
      clearTimeout(corte);
    }
  }
  return configSincrona({ ...op, almacen });
}
