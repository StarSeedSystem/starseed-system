// Agent-Reach v1.6 — módulo PURO: ids del cliente (y viejos) → argv del CLI.
// Sin node:* ni red/disco/reloj. Contrato: architecture/repos-libreria-1025.md
// (R1: solo canales sin sesión; R10: instalar solo con la orden uv de abajo).
export type EntradaProxy = { q?: string; url?: string; limit?: number };
export type ErrorComando = { code: string; hint: string };
export type Resolucion = { ok: true; argv: string[] } | { ok: false; error: ErrorComando };
/** Orden de instalación oficial (R10): queda en ~/.local/bin; el de PyPI no es este proyecto. */
export const ORDEN_INSTALACION = "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip";
type Especie = { tipo: "q" | "url"; sesion: boolean; argv: (valor: string, limit: number) => string[] };

const buscarWeb = (q: string, l: number): string[] => ["web", "search", q, "--limit", String(l)];
const leerWeb = (u: string): string[] => ["read", u];
const youtubeSub = (u: string): string[] => ["youtube", "subtitle", u];
const githubLeer = (u: string): string[] => ["github", "read", u];
const publi = (tipo: "q" | "url", argv: Especie["argv"]): Especie => ({ tipo, sesion: false, argv });

/** Tabla de capacidades: ids del cliente + viejos de la v1.5. */
export const CAPACIDADES: Record<string, Especie> = {
  "web-search": publi("q", buscarWeb), search: publi("q", buscarWeb),
  "read-web": publi("url", leerWeb), rss: publi("url", leerWeb), web: publi("url", leerWeb),
  "youtube-transcript": publi("url", youtubeSub), youtube: publi("url", youtubeSub),
  "github-read": publi("url", githubLeer), github: publi("url", githubLeer),
  bilibili: publi("q", (q) => ["bilibili", "search", q]),
  ...canalesConSesion(),
};
/** Reddit, X y demás canales con sesión quedan fuera (R1) salvo el interruptor. */
function canalesConSesion(): Record<string, Especie> {
  return Object.fromEntries(
    (["reddit", "reddit-search", "twitter", "linkedin", "facebook", "instagram", "xiaohongshu"] as const).map(
      (id): [string, Especie] => [id, { tipo: "url", sesion: true, argv: (u) => [id.replace(/-search$/, ""), "read", u] }],
    ),
  );
}
/** Límite de resultados: 1–20, por defecto 5. */
export function normalizarLimite(limit?: number): number {
  return Math.min(20, Math.max(1, typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : 5));
}
type Validacion = { ok: true; valor: string; limit: number } | { ok: false; error: ErrorComando };

/** Ningún argumento vacío, con guion inicial, query > 300 ni URL de SSRF. */
export function validarEntrada(entrada: EntradaProxy, tipo: "url" | "q"): Validacion {
  const bruto = tipo === "url" ? entrada.url : entrada.q;
  const valor = typeof bruto === "string" ? bruto.trim() : "";
  if (!valor) return { ok: false, error: { code: "BAD_INPUT", hint: `Falta el argumento (${tipo}).` } };
  if (valor.startsWith("-"))
    return { ok: false, error: { code: "BAD_INPUT", hint: "Ningún argumento puede empezar por «-»: el CLI lo tomaría como bandera." } };
  if (tipo === "url" ? urlProhibida(valor) : valor.length > 300)
    return {
      ok: false,
      error: { code: "BAD_INPUT", hint: tipo === "url" ? "URL no permitida (SSRF): solo http/https público, sin localhost, IP privada ni metadatos de nube." : "La consulta supera los 300 caracteres." },
    };
  return { ok: true, valor, limit: normalizarLimite(entrada.limit) };
}
const METADATOS_NUBE = new Set(["metadata.google.internal", "instance-data", "metadata", "metadata.azure.com", "169.254.169.254"]);

/** true si la URL es local, privada o de metadatos de nube (SSRF). */
export function urlProhibida(valor: string): boolean {
  let u: URL;
  try { u = new URL(valor); } catch { return true; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || METADATOS_NUBE.has(h)) return true;
  const n = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)?.slice(1).map(Number);
  if (n)
    return n.some((m) => m > 255) || n[0] === 0 || n[0] === 10 || n[0] === 127 || (n[0] === 169 && n[1] === 254) ||
      (n[0] === 192 && n[1] === 168) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31);
  if (h.includes(":")) {
    const mapeo = h.replace(/^::ffff:/i, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(mapeo)) return urlProhibida(`http://${mapeo}/`);
    if (h === "::1" || h === "::") return true;
    return /^(fc|fd)/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}
/** id → argv del CLI v1.6; los canales con sesión van cerrados salvo flag (R1). */
export function resolverCapacidad(id: string, entrada: EntradaProxy, loginPermitido: boolean): Resolucion {
  if (id === "health") return { ok: true, argv: ["version"] };
  const especie = CAPACIDADES[id];
  if (!especie) return { ok: false, error: { code: "BAD_INPUT", hint: `Capacidad desconocida: ${id}` } };
  if (especie.sesion && !loginPermitido) return { ok: false, error: { code: "NEED_LOGIN_BLOQUEADO", hint: HINTES.NEED_LOGIN_BLOQUEADO } };
  const v = validarEntrada(entrada, especie.tipo === "q" ? "q" : "url");
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, argv: especie.argv(v.valor, v.limit) };
}
/** Códigos de error del CLI v1.6 (NEED_LOGIN_BLOQUEADO es del OS). */
export const CODIGOS_V16 = ["NEED_SETUP", "NEED_LOGIN", "UPSTREAM_BROKEN", "TIMEOUT", "RATE_LIMITED", "PLATFORM_BLOCKED", "BUSY", "NOT_FOUND", "BAD_INPUT", "NEED_LOGIN_BLOQUEADO"] as const;

export const HINTES: Record<string, string> = {
  NEED_SETUP: ORDEN_INSTALACION,
  NEED_LOGIN: "El canal pide sesión y el proxy no le pasa ninguna (R1).",
  UPSTREAM_BROKEN: "El servicio externo (Exa/Jina) falló; reintenta más tarde.",
  TIMEOUT: "El CLI tardó demasiado y se detuvo a la fuerza.",
  RATE_LIMITED: "Demasiadas peticiones seguidas; espera un rato.",
  PLATFORM_BLOCKED: "La plataforma bloqueó la consulta.",
  BUSY: "El CLI está ocupado; reintenta.",
  NOT_FOUND: "El recurso no existe.",
  BAD_INPUT: "Entrada inválida para el CLI.",
  NEED_LOGIN_BLOQUEADO: "Canal con sesión: el OS solo lee canales públicos sin sesión (R1). Se abre a conciencia con STARSEED_AGENT_REACH_LOGIN=1.",
};
/** Fallo del CLI (código, stderr, timeout) → {code, hint} de la v1.6. */
export function diagnostico(d: { codigo: number | null; stderr: string; timeout: boolean }): ErrorComando {
  if (d.timeout) return { code: "TIMEOUT", hint: HINTES.TIMEOUT };
  if (d.codigo === 127) return { code: "NEED_SETUP", hint: ORDEN_INSTALACION };
  const limpio = d.stderr.trim();
  try {
    const err = (JSON.parse(limpio) as { error?: { code?: unknown; hint?: unknown } })?.error;
    const code = typeof err?.code === "string" ? err.code : "";
    if ((CODIGOS_V16 as readonly string[]).includes(code))
      return { code, hint: typeof err?.hint === "string" && err.hint ? err.hint : (HINTES[code] ?? "") };
  } catch { /* stderr no es JSON del CLI */ }
  return { code: "UPSTREAM_BROKEN", hint: limpio ? limpio.slice(0, 300) : `agent-reach terminó con código ${d.codigo ?? "desconocido"} sin salida útil.` };
}
export type ItemV16 = { title?: string; url?: string; author?: string; published_at?: string; text?: string };
export type SobreV16 = { ok: boolean; content: string; items: ItemV16[]; error: { code: string; hint?: string } | null };

/** Parsea el JSON de la v1.6 → {ok, content (Markdown), items, error}; nunca lanza. */
export function leerSobre(texto: string): SobreV16 {
  const roto = (hint: string): SobreV16 => ({ ok: false, content: "", items: [], error: { code: "UPSTREAM_BROKEN", hint } });
  let j: unknown;
  try { j = JSON.parse(texto.trim()); } catch { return roto("La salida de agent-reach no fue JSON válido."); }
  if (typeof j !== "object" || j === null) return roto("La salida de agent-reach no fue un objeto JSON.");
  const sobre = j as { ok?: unknown; items?: unknown; error?: unknown };
  const filas = Array.isArray(sobre.items) ? sobre.items.filter(esItemV16) : [];
  const error = esErrorV16(sobre.error)
    ? { code: sobre.error.code, hint: typeof sobre.error.hint === "string" ? sobre.error.hint : undefined }
    : sobre.ok === true ? null : { code: "UPSTREAM_BROKEN", hint: HINTES.UPSTREAM_BROKEN };
  return { ok: sobre.ok === true, content: filas.map(itemAMarkdown).join("\n"), items: filas, error };
}
const esItemV16 = (x: unknown): x is ItemV16 =>
  typeof x === "object" && x !== null &&
  ["title", "url", "author", "published_at", "text"].every(
    (c) => { const v = (x as Record<string, unknown>)[c]; return typeof v === "string" || v === undefined; });
const esErrorV16 = (x: unknown): x is { code: string; hint?: unknown } =>
  typeof x === "object" && x !== null && typeof (x as Record<string, unknown>).code === "string" && (x as Record<string, unknown>).code !== "";

function itemAMarkdown(i: ItemV16): string {
  const titulo = (i.title && i.title.trim()) || i.url || "Sin título";
  const meta = [i.author, i.published_at].filter(Boolean).join(" · ");
  const cabeza = (i.url ? `- [${titulo}](${i.url})` : `- ${titulo}`) + (meta ? ` · ${meta}` : "");
  return i.text ? `${cabeza}\n  ${i.text}` : cabeza;
}
