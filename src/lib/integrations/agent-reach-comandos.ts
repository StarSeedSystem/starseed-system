/**
 * AGENT REACH v1.6 · comandos (puro, sin node:*)
 * ─────────────────────────────────────────────────────────────────────
 * Mapa de ids (nuevos del cliente y viejos de la v1.5) al argv real de la
 * v1.6, que salió el 2026-10-23 con una sola orden y salida JSON uniforme:
 *   {ok, items:[{title,url,author,published_at,text}], error:{code,hint}, meta}
 * Contrato: architecture/repos-libreria-1025.md §7 · regla R1 (nada con sesión).
 */

export interface ItemV6 {
  title?: string;
  url?: string;
  author?: string;
  published_at?: string;
  text?: string;
}

export type CodigoError =
  | "NEED_SETUP"
  | "NEED_LOGIN"
  | "UPSTREAM_BROKEN"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PLATFORM_BLOCKED"
  | "BUSY"
  | "NOT_FOUND"
  | "BAD_INPUT"
  | "UNKNOWN";

export type TipoArg = "url" | "q" | "repo" | "ninguno";

export type ResultadoCapacidad =
  | { accion: "ejecutar"; tipo: TipoArg; argv: string[] }
  | { accion: "rechazar"; tipo: TipoArg; motivo: string };

const CODIGOS: CodigoError[] = [
  "NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT", "RATE_LIMITED",
  "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT",
];
const esCodigo = (v: string): v is CodigoError => CODIGOS.includes(v as CodigoError);

const webSearch = (q: string, limite: number): string[] => ["web", "search", q, "--limit", String(limite)];

/** Tabla: id → constructor de argv de la v1.6. */
export const CAPACIDADES: Record<string, (arg: string, limite: number) => string[]> = {
  "web-search": (a, n) => webSearch(a, n),
  search: (a, n) => webSearch(a, n),
  "read-web": (a) => ["read", a],
  rss: (a) => ["read", a],
  web: (a) => ["read", a],
  "youtube-transcript": (a) => ["youtube", "subtitle", a],
  youtube: (a) => ["youtube", "subtitle", a],
  "github-read": (a) => ["github", "read", a],
  github: (a) => ["github", "read", a],
  bilibili: (a) => ["bilibili", "search", a],
};

/** Canales con sesión (R1): apagados salvo STARSEED_AGENT_REACH_LOGIN=1. */
export const SIN_LOGIN: Record<string, true> = {
  reddit: true,
  "reddit-search": true,
  twitter: true,
};

/** Tipo de argumento que pide cada id (para leer el body de la ruta). */
export function tipoDeCapacidad(id: string): TipoArg {
  if (id === "health") return "ninguno";
  if (id.startsWith("web-search") || id === "search" || id === "bilibili") return "q";
  if (id.startsWith("github")) return "repo";
  if (SIN_LOGIN[id] === true) return id === "reddit-search" ? "q" : "url";
  return "url";
}

/** ¿Se puede ejecutar esta capacidad? con sesión solo si la bandera R1 está levantada. */
export function resolverCapacidad(
  id: string,
  arg: string,
  opciones: { limite?: number; loginPermitido?: boolean } = {},
): ResultadoCapacidad {
  const tipo = tipoDeCapacidad(id);
  const limite = Math.min(Math.max(Math.trunc(opciones.limite ?? 5), 1), 20);
  const fn = CAPACIDADES[id];
  if (fn) return { accion: "ejecutar", tipo, argv: arg ? fn(arg, limite) : [] };
  if (SIN_LOGIN[id] === true && opciones.loginPermitido !== true) {
    return { accion: "rechazar", tipo, motivo: "NEED_LOGIN_BLOQUEADO" };
  }
  return { accion: "rechazar", tipo, motivo: "UNKNOWN" };
}

/* ── validación de entrada ── */

const HOST_PROHIBIDO = [
  /^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /metadata/i,
  /^0\.0\.0\.0$/, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^\[?::1\]?$/, /^[fF][cCdD]/,
];

/** Nada de guion de opción disfrazado, ni q gigante, ni SSRF. */
export function validarEntrada(tipo: TipoArg, arg: string): { ok: boolean; motivo?: string } {
  if (tipo === "ninguno") return { ok: true };
  const texto = (arg ?? "").trim();
  if (!texto) return { ok: false, motivo: "BAD_INPUT" };
  if (texto.startsWith("-")) return { ok: false, motivo: "BAD_INPUT" };
  if (tipo === "q" && texto.length > 300) return { ok: false, motivo: "BAD_INPUT" };
  if (tipo !== "q") {
    let u: URL;
    try { u = new URL(texto); } catch { return { ok: false, motivo: "BAD_INPUT" }; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, motivo: "BAD_INPUT" };
    const host = u.hostname;
    if (HOST_PROHIBIDO.some((r) => r.test(host))) return { ok: false, motivo: "BAD_INPUT" };
  }
  return { ok: true };
}

/* ── parseo de la salida JSON de la v1.6 (nunca lanza) ── */

export interface SobreLeido {
  ok: boolean;
  content: string;
  items: ItemV6[];
  error: CodigoError[];
}

/** Parsea la salida cruda del CLI, sea lo que sea, sin lanzar. */
export function leerSobre(texto: string): SobreLeido {
  const vacio: SobreLeido = { ok: false, content: "", items: [], error: ["UNKNOWN"] };
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse((texto ?? "").trim()) as Record<string, unknown>;
  } catch {
    return vacio;
  }
  if (typeof datos !== "object" || datos === null) return vacio;
  const error = datoError(datos.error ?? []);
  const ok = datos.ok === true;
  const items = Array.isArray(datos.items) ? datos.items.filter(esItem) : [];
  if (error.error.length > 0) return { ok: false, content: "", items: [], error: error.error };
  if (!ok) return { ...vacio, error: ["UNKNOWN"] };
  return {
    ok: true,
    content: markdown(items),
    items,
    error: [],
  };
}

function esItem(v: unknown): v is ItemV6 {
  return typeof v === "object" && v !== null && "url" in v;
}

function datoError(v: unknown): SobreLeido {
  if (Array.isArray(v)) {
    const codes = v.map(datoError).flatMap((e) => e.error);
    return { ok: false, content: "", items: [], error: codes };
  }
  const code = typeof v === "object" && v !== null && "code" in v ? String(v.code) : "";
  return { ok: false, content: "", items: [], error: esCodigo(code) ? [code] : [] };
}

function markdown(items: ItemV6[]): string {
  return items
    .map((it) => {
      const partes = [it.title ? `## ${it.title}` : "## (sin título)", it.url ?? ""];
      if (it.author) partes.push(`Autor: ${it.author}`);
      if (it.published_at) partes.push(`Publicado: ${it.published_at}`);
      if (it.text) partes.push("", it.text);
      return partes.join("\n");
    })
    .join("\n\n---\n\n");
}


