// ════════════════════════════════════════════════════════════════
// Agent-Reach v1.6 — capacidades → argv, validación y lectura del JSON
// -----------------------------------------------------------------
// Módulo PURO (sin node:*): la ruta /api/agent-reach/[capability] lo usa
// para decidir qué orden lanza y cómo leer lo que imprime. Acepta los ids
// del cliente (web-search, read-web…) y los viejos (search, web, rss…).
// Contrato: architecture/repos-libreria-1025.md §3.1 y R1 (sin sesión).
// ════════════════════════════════════════════════════════════════

export const HINT_INSTALACION = "Instala Agent-Reach con: uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip (queda en ~/.local/bin). Ojo: el paquete «agent-reach» de PyPI NO es este proyecto; no uses pip ni npx.";

type Entrada = "q" | "url" | "ref" | "nada";
interface Capacidad { entrada: Entrada; argv: (x: string, limite: number) => string[]; conSesion?: boolean }

const buscar: Capacidad = { entrada: "q", argv: (q, n) => ["web", "search", q, "--limit", String(n)] };
const leer: Capacidad = { entrada: "url", argv: (u) => ["read", u] };
const youtube: Capacidad = { entrada: "url", argv: (u) => ["youtube", "subtitle", u] };
const github: Capacidad = { entrada: "ref", argv: (x) => ["github", "read", x] };
const conSesion: Capacidad = { entrada: "url", argv: (u) => ["read", u], conSesion: true };

export const CAPACIDADES: Readonly<Record<string, Capacidad>> = {
  "web-search": buscar, search: buscar,
  "read-web": leer, web: leer, rss: leer,
  "youtube-transcript": youtube, youtube,
  "github-read": github, github,
  bilibili: { entrada: "q", argv: (q) => ["bilibili", "search", q] },
  health: { entrada: "nada", argv: () => ["version"] },
  reddit: conSesion, "reddit-search": conSesion, twitter: conSesion,
};

export type Resolucion =
  | { ok: true; argv: string[] }
  | { ok: false; motivo: "DESCONOCIDA" | "NEED_LOGIN_BLOQUEADO" | "BAD_INPUT"; error: string };

/** ¿Es un host local, privado o de metadatos de nube? (bloqueo de SSRF) */
function hostPrivado(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h || h === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) return true;
  if (h === "metadata" || h === "metadata.google.internal") return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(":")) return h === "::" || h === "::1" || /^(fc|fd|fe[89ab])/.test(h) || h.startsWith("::ffff:");
  return false;
}

/** Valida una entrada; devuelve el texto de error o null si vale. */
export function validarEntrada(tipo: Entrada, valor: string): string | null {
  if (tipo === "nada") return null;
  const v = valor.trim();
  if (!v) return "Falta el argumento (url, repo o q).";
  if (v.startsWith("-")) return "Un argumento no puede empezar por «-».";
  if (v.length > (tipo === "q" ? 300 : 2048)) return "El argumento es demasiado largo.";
  if (/[\u0000-\u001f]/.test(v)) return "El argumento lleva caracteres de control.";
  if (tipo === "q") return null;
  if (tipo === "ref" && !/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    return /^[\w.-]+\/[\w.-]+(\/[\w./-]*)?$/.test(v) ? null : "Referencia de GitHub inválida (dueño/repo).";
  }
  let u: URL;
  try { u = new URL(v); } catch { return "URL inválida."; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Solo se aceptan URLs http o https.";
  if (u.username || u.password) return "La URL no puede llevar credenciales.";
  if (hostPrivado(u.hostname)) return "No se leen hosts locales, privados ni de metadatos.";
  return null;
}

/** Traduce capacidad + cuerpo a la orden de la v1.6 (sin lanzar nada). */
export function resolverComando(
  capacidad: string, cuerpo: Record<string, unknown>, opciones: { login?: boolean } = {},
): Resolucion {
  const cap = Object.prototype.hasOwnProperty.call(CAPACIDADES, capacidad) ? CAPACIDADES[capacidad] : undefined;
  if (!cap) return { ok: false, motivo: "DESCONOCIDA", error: `Capacidad no permitida: ${capacidad}` };
  if (cap.conSesion && !opciones.login) {
    return { ok: false, motivo: "NEED_LOGIN_BLOQUEADO", error: "Canal con sesión apagado (R1): solo canales públicos sin iniciar sesión." };
  }
  const campos = cap.entrada === "q" ? ["q", "query"] : ["url", "repo", "feed"];
  const valor = campos.map((c) => cuerpo[c]).find((x): x is string => typeof x === "string") ?? "";
  const error = validarEntrada(cap.entrada, valor);
  if (error) return { ok: false, motivo: "BAD_INPUT", error };
  const n = typeof cuerpo.limit === "number" && Number.isFinite(cuerpo.limit) ? cuerpo.limit : 5;
  return { ok: true, argv: cap.argv(valor.trim(), Math.min(20, Math.max(1, Math.round(n)))) };
}

export interface ItemReach { title: string; url: string; author?: string; published_at?: string; text: string }
export interface SobreLeido { ok: boolean; content: string; items: ItemReach[]; error?: { code: string; hint: string } }

const MENSAJES: Record<string, string> = {
  NEED_SETUP: "Agent-Reach necesita configuración en esta neurona.",
  NEED_LOGIN: "Ese canal pide iniciar sesión y está apagado (R1).",
  UPSTREAM_BROKEN: "El servicio de origen ha cambiado o falla.",
  TIMEOUT: "El origen tardó demasiado.",
  RATE_LIMITED: "El origen limita las peticiones; prueba más tarde.",
  PLATFORM_BLOCKED: "La plataforma bloquea la lectura.",
  BUSY: "Agent-Reach está ocupado; prueba en un momento.",
  NOT_FOUND: "No se encontró el recurso.",
  BAD_INPUT: "La entrada no es válida para Agent-Reach.",
};

const texto = (x: unknown): string => (typeof x === "string" ? x : "");
/** Lee el objeto JSON que imprime la v1.6. Nunca lanza. */
export function leerSobre(salida: string): SobreLeido {
  let crudo: unknown;
  try { crudo = JSON.parse(salida); } catch {
    const i = salida.indexOf("{"), j = salida.lastIndexOf("}");
    try { crudo = i >= 0 && j > i ? JSON.parse(salida.slice(i, j + 1)) : null; } catch { crudo = null; }
  }
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) {
    return { ok: false, content: "", items: [], error: { code: "BAD_OUTPUT", hint: "Agent-Reach no devolvió JSON (¿versión anterior a la 1.6?)." } };
  }
  const o = crudo as Record<string, unknown>, items: ItemReach[] = (Array.isArray(o.items) ? o.items : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ title: texto(x.title), url: texto(x.url), author: texto(x.author) || undefined, published_at: texto(x.published_at) || undefined, text: texto(x.text) }));
  const content = items.map((it) => `### ${it.title || it.url || "(sin título)"}\n\n${it.text}${it.url ? `\n\nFuente: ${it.url}` : ""}`.trim()).join("\n\n---\n\n");
  if (o.ok === true) return { ok: true, content, items };
  const e = (o.error && typeof o.error === "object" ? o.error : {}) as Record<string, unknown>, code = texto(e.code) || "UNKNOWN";
  return { ok: false, content, items, error: { code, hint: texto(e.hint) || MENSAJES[code] || "Agent-Reach devolvió un error." } };
}
