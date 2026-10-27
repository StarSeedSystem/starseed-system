// Agent-Reach v1.6 · comandos puro (sin node:*): ids → argv, validación
// SSRF/inyección y parseo del JSON v1.6. R1: solo canales sin sesión.
export const CODIGO_NEED_LOGIN = "NEED_LOGIN_BLOQUEADO";
export type ComandoEntrada = { url?: string; q?: string; limit?: number; repo?: string; feed?: string };
export type ComandoResuelto = { ok: boolean; argv?: string[]; codigo?: string; hint?: string };
export type ItemAgentReach = {
  title?: string; url?: string; author?: string; published_at?: string; text?: string;
};
export type Lectura = { ok: boolean; content: string; items: ItemAgentReach[]; error?: { code: string; hint: string } };
type Fabrica = (e: ComandoEntrada, avisoLogin: boolean) => ComandoResuelto;
export type Validacion = { ok: boolean; error?: string };

/** Canales que exigen sesión en la v1.6: bloqueados por R1. */
const CANALES_CON_SESION = ["reddit", "reddit-search", "twitter", "x", "linkedin", "instagram", "facebook", "xiaohongshu"];
const limiteDe = (n: number | undefined): number =>
  n !== undefined && Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 20) : 5;
const busqueda = (q: string, limit: number | undefined): string[] =>
  ["web", "search", q, "--limit", String(limiteDe(limit))];
function bloqueLogin(id: string, avisoLogin: boolean): ComandoResuelto {
  if (avisoLogin) return { ok: true, argv: ["channels"] };
  return {
    ok: false,
    codigo: CODIGO_NEED_LOGIN,
    hint: `El canal «${id}» exige iniciar sesión (navegador con cookies de Chrome): bloqueado por R1. Solo canales públicos sin sesión.`,
  };
}
/** Mapa id → argv de la v1.6. Acepta ids nuevos del cliente y viejos de la v1.5. */
export const CAPACIDADES: Record<string, Fabrica> = {
  "web-search": (e) => ({ ok: true, argv: busqueda(e.q ?? e.url ?? "", e.limit) }),
  search: (e) => ({ ok: true, argv: busqueda(e.url ?? e.q ?? "", e.limit) }),
  "read-web": (e) => ({ ok: true, argv: ["read", e.url ?? ""] }),
  rss: (e) => ({ ok: true, argv: ["read", e.url ?? e.feed ?? ""] }),
  read: (e) => ({ ok: true, argv: ["read", e.url ?? ""] }),
  "youtube-transcript": (e) => ({ ok: true, argv: ["youtube", "subtitle", e.url ?? ""] }),
  youtube: (e) => ({ ok: true, argv: ["youtube", "subtitle", e.url ?? ""] }),
  "github-read": (e) => ({ ok: true, argv: ["github", "read", e.repo ?? e.url ?? ""] }),
  github: (e) => ({ ok: true, argv: ["github", "read", e.url ?? e.repo ?? ""] }),
  bilibili: (e) => ({ ok: true, argv: ["bilibili", "search", e.q ?? e.url ?? ""] }),
  health: () => ({ ok: true, argv: ["version"] }),
  version: () => ({ ok: true, argv: ["version"] }),
  channels: () => ({ ok: true, argv: ["channels"] }),
  reddit: (_e, av) => bloqueLogin("reddit", av),
  "reddit-search": (_e, av) => bloqueLogin("reddit", av),
  twitter: (_e, av) => bloqueLogin("twitter", av),
  linkedin: (_e, av) => bloqueLogin("linkedin", av),
  instagram: (_e, av) => bloqueLogin("instagram", av),
  facebook: (_e, av) => bloqueLogin("facebook", av),
  xiaohongshu: (_e, av) => bloqueLogin("xiaohongshu", av),
};
// ── Validación de entrada: SSRF y opciones inyectadas ──
const RANGOS_IP = /^(localhost$|\.localhost$|::1|\[::1\]|(127|10|192\.168)\.\d|169\.254\.\d|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|fe80:)/i;
const HOSTS_METADATOS = new Set(["169.254.169.254", "metadata.google.internal", "metadata.internal"]);
function hostDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
/** URL segura (http/https, host público), consulta ≤ 300 y sin opciones inyectadas. */
export function validarEntrada(e: ComandoEntrada): Validacion {
  const args = [e.url, e.q, e.repo, e.feed].filter((a): a is string => !!a);
  if (args.length === 0) return { ok: false, error: "Falta el argumento (url, q o repo)." };
  for (const a of args) {
    if (a.startsWith("-") || /\s-{1,2}[a-z]/i.test(a)) {
      return { ok: false, error: "Los argumentos no pueden empezar por «-» ni contener opciones." };
    }
  }
  if (e.q !== undefined && e.q.length > 300) return { ok: false, error: "La consulta no puede superar los 300 caracteres." };
  if (e.limit !== undefined && (!Number.isFinite(e.limit) || e.limit < 1 || e.limit > 20)) return { ok: false, error: "El límite debe estar entre 1 y 20." };
  if (e.url) {
    if (!/^https?:\/\//i.test(e.url)) return { ok: false, error: "La URL debe ser http o https." };
    const host = hostDe(e.url);
    if (!host) return { ok: false, error: "URL inválida." };
    if (RANGOS_IP.test(host) || HOSTS_METADATOS.has(host)) return { ok: false, error: "No se permiten hosts locales, privados ni de metadatos de nube." };
  }
  return { ok: true };
}
/** Capacidades cuyo texto no es URL (el cliente viejo lo pasaba en «url»). */
const SEARCH_TEXTALES = new Set(["search", "bilibili", "web-search"]);

const codigoDe = (error?: string): string =>
  error?.startsWith("No se permiten hosts") ? "SSRF_BLOQUEADO" : "BAD_INPUT";
function itemAMarkdown(it: ItemAgentReach, i: number): string {
  const titulo = it.title || `Resultado ${i + 1}`;
  const partes = [it.url ? `[${titulo}](${it.url})` : titulo];
  if (it.author) partes.push(`Autor: ${it.author}`);
  if (it.published_at) partes.push(`Publicado: ${it.published_at}`);
  if (it.text) partes.push(it.text);
  return partes.join(" · ");
}
/** Parsea el JSON de la v1.6. Nunca lanza: salida rota → error UPSTREAM_BROKEN. */
export function leerSobre(texto: string, codigoUpstream = "UPSTREAM_BROKEN"): Lectura {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, content: "", items: [], error: { code: codigoUpstream, hint: "La salida de agent-reach no es JSON válido." } };
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) {
    return { ok: false, content: "", items: [], error: { code: codigoUpstream, hint: "La salida no viene como objeto JSON." } };
  }
  const o = crudo as Record<string, unknown>;
  const items = Array.isArray(o.items) ? (o.items as ItemAgentReach[]) : [];
  const content = items.map(itemAMarkdown).join("\n");
  if (o.ok === true || o.ok === undefined) return { ok: true, content, items };
  const err = (o.error ?? {}) as { code?: string; hint?: string };
  return { ok: false, content, items, error: { code: err.code ?? codigoUpstream, hint: err.hint ?? "Sin pista del error." } };
}
/** Resuelve id → argv validado (la ruta no lanza nada que no esté aprobado). */
export function resolver(id: string, e: ComandoEntrada = {}, avisoLogin = false): ComandoResuelto {
  const fabrica = CAPACIDADES[id];
  if (!fabrica) {
    return { ok: false, codigo: "NOT_FOUND", hint: `Capacidad desconocida: «${id}». Consulta la lista de canales con «agent-reach channels».` };
  }
  const resuelto = fabrica(e, avisoLogin);
  if (!resuelto.ok) return resuelto;
  // health/version/channels no llevan argumento: nada que validar.
  if (e.url === undefined && e.q === undefined && e.repo === undefined) return resuelto;
  // En «search» y «bilibili» el texto va en «url» como alias del cliente viejo: no es URL.
  const paraValidar: ComandoEntrada = SEARCH_TEXTALES.has(id) ? { q: e.url ?? e.q, limit: e.limit } : e;
  const v = validarEntrada(paraValidar);
  if (!v.ok) return { ok: false, codigo: codigoDe(v.error), hint: v.error };
  return resuelto;
}
