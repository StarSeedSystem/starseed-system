// ══════════════════════════════════════════════════════════════════════════
// Agent-Reach v1.6 · comandos puros del proxy del OS (INV1025A).
// Sin `node:*`: los tipos y la resolución de órdenes los comparten la ruta de
// Next (servidor) y cualquier cliente. Contrato:
// architecture/repos-libreria-1025.md §3.1 y reglas duras R1–R10; salida de la
// v1.6: {ok, items:[{title,url,author,published_at,text}], error:{code,hint}, meta}.
// Instalación (única válida): uv tool install https://github.com/
// Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip — queda en
// ~/.local/bin. El paquete `agent-reach` de PyPI NO es este proyecto (R10).
// ══════════════════════════════════════════════════════════════════════════

export const ORDEN_INSTALACION =
  "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip";
export const AVISO_PYPI =
  "El paquete agent-reach de PyPI no es este proyecto; instala solo con la orden de GitHub descrita aquí.";

export const Q_MAXIMO = 300;
export const LIMIT_POR_DEFECTO = 5;
export const LIMIT_MAXIMO = 20;

export type ItemAgentReach = {
  title?: string | null;
  url?: string | null;
  author?: string | null;
  published_at?: string | null;
  text?: string | null;
};

export type ErrorAgentReach = { code: string; hint: string };

export type SobreAgentReach = {
  ok: boolean;
  content: string;
  items: ItemAgentReach[];
  error: ErrorAgentReach | null;
};

export type EntradaAgentReach = { url?: unknown; q?: unknown; limit?: unknown; texto?: unknown };

export type ResolucionAgentReach =
  | { ok: true; argv: string[] }
  | { ok: false; code: string; hint: string };

/** ¿Queda habilitada la vía con sesión (R1) en esta máquina? */
export function loginPermitido(entorno: { STARSEED_AGENT_REACH_LOGIN?: string } | undefined): boolean {
  return (entorno?.STARSEED_AGENT_REACH_LOGIN ?? "").trim() === "1";
}

// ── Capacidad → argv v1.6 ──────────────────────────────────────────────────
// Acepta los ids del cliente (web-search, read-web, youtube-transcript,
// github-read, reddit-search) y los de la ruta vieja v1.5
// (web, search, youtube, github, reddit, twitter, rss, bilibili).

type Grupo = "busqueda" | "lectura" | "version" | "con-sesion";

export type CapacidadAgentReach = { grupo: Grupo };

export const CAPACIDADES: Record<string, CapacidadAgentReach> = {
  "web-search": { grupo: "busqueda" },
  search: { grupo: "busqueda" },
  bilibili: { grupo: "busqueda" },
  "read-web": { grupo: "lectura" },
  web: { grupo: "lectura" },
  rss: { grupo: "lectura" },
  "youtube-transcript": { grupo: "lectura" },
  youtube: { grupo: "lectura" },
  "github-read": { grupo: "lectura" },
  github: { grupo: "lectura" },
  health: { grupo: "version" },
  // Canales con sesión (R1): navegador anti-detección y copia de la sesión de
  // Chrome → bloqueados salvo STARSEED_AGENT_REACH_LOGIN=1.
  reddit: { grupo: "con-sesion" },
  "reddit-search": { grupo: "con-sesion" },
  twitter: { grupo: "con-sesion" },
  linkedin: { grupo: "con-sesion" },
  facebook: { grupo: "con-sesion" },
  instagram: { grupo: "con-sesion" },
  xiaohongshu: { grupo: "con-sesion" },
};

/** Comando por capacidad con sesión habilitada (no se usa de fábrica, R1). */
function argvConSesion(id: string, entrada: EntradaAgentReach): string[] {
  const texto = typeof entrada.q === "string" ? entrada.q : typeof entrada.url === "string" ? entrada.url : "";
  return id === "twitter" ? ["twitter", texto] : ["reddit", "search", texto];
}

/** Limit de búsqueda como entero sano dentro del rango permitido. */
export function limitSano(limit: unknown): number {
  const n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : LIMIT_POR_DEFECTO;
  return Math.min(Math.max(n, 1), LIMIT_MAXIMO);
}

// ── Validación de entrada (SSRF y guiones) ─────────────────────────────────

function esIPv4Privada(h: string): boolean {
  const o = h.split(".");
  if (o.length !== 4 || o.some((x) => !/^\d{1,3}$/.test(x))) return false;
  const n = o.map(Number);
  if (n.some((x) => x > 255)) return false;
  if (n[0] === 10) return true; // red privada 10/8
  if (n[0] === 127) return true; // loopback (127.0.0.1)
  if (n[0] === 0) return true; // 0.0.0.0 y reservados
  if (n[0] === 169 && n[1] === 254) return true; // enlace y metadatos de nube
  if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
  if (n[0] === 192 && n[1] === 168) return true;
  if (n[0] === 100 && n[1] >= 64 && n[1] <= 127) return true;
  return false;
}

/** null si la URL es válida para el alcance público (R1/R4); si no, el motivo. */
export function validarUrl(url: string): string | null {
  let h: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "Solo se permite http o https.";
    h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "URL inválida.";
  }
  if (!h) return "URL sin host.";
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return "No se leen hosts locales ni internos.";
  }
  if (h === "::1" || h === "::" || /^(fc|fd|fe80)/.test(h)) return "No se leen direcciones IPv6 privadas.";
  if (esIPv4Privada(h)) return "No se leen direcciones IP privadas ni de enlace.";
  return null;
}

function textoValido(t: unknown): { texto: string } | { code: string; hint: string } {
  if (typeof t !== "string" || !t.trim()) {
    return { code: "BAD_INPUT", hint: "Falta el argumento (q para búsquedas, url para lecturas)." };
  }
  if (t.trim().startsWith("-")) return { code: "BAD_INPUT", hint: "El argumento no puede empezar por '-'." };
  if (t.length > Q_MAXIMO) {
    return { code: "BAD_INPUT", hint: `La consulta no puede pasar de ${Q_MAXIMO} caracteres.` };
  }
  return { texto: t.trim() };
}

/**
 * ID de capacidad (cliente nuevo o ruta vieja v1.5) → argv de la v1.6.
 * `mayLogin` habilita los canales con sesión, que de fábrica están
 * bloqueados (regla dura R1 del grupo de investigación).
 */
export function resolverCapacidad(id: string, entrada: EntradaAgentReach, mayLogin = false): ResolucionAgentReach {
  const cap = CAPACIDADES[id];
  if (!cap) return { ok: false, code: "NOT_FOUND", hint: `Capacidad desconocida: ${id}.` };

  if (cap.grupo === "version") return { ok: true, argv: ["version"] };

  if (cap.grupo === "con-sesion") {
    if (!mayLogin) {
      return {
        ok: false,
        code: "NEED_LOGIN_BLOQUEADO",
        hint: "Canal con sesión bloqueado (R1): solo fuentes públicas; se habilita con STARSEED_AGENT_REACH_LOGIN=1.",
      };
    }
    const t = textoValido(entrada.q ?? entrada.url);
    if ("code" in t) return t;
    return { ok: true, argv: argvConSesion(id, entrada) };
  }

  const buscador = cap.grupo === "busqueda";
  const t = textoValido(entrada.q ?? entrada.url);
  if ("code" in t) return t;

  if (id === "bilibili") return { ok: true, argv: ["bilibili", "search", t.texto, "--limit", String(limitSano(entrada.limit))] };
  if (buscador) {
    return { ok: true, argv: ["web", "search", t.texto, "--limit", String(limitSano(entrada.limit))] };
  }
  if (id === "youtube-transcript" || id === "youtube") return { ok: true, argv: ["youtube", "subtitle", t.texto] };
  if (id === "github-read" || id === "github") return { ok: true, argv: ["github", "read", t.texto] };

  const motivoUrl = validarUrl(t.texto);
  if (motivoUrl) return { ok: false, code: "BAD_INPUT", hint: motivoUrl };
  return { ok: true, argv: ["read", t.texto] };
}

// ── Lectura de la salida del binario (JSON v1.6) ───────────────────────────

function itemAMarkdown(i: ItemAgentReach): string {
  const titulo = (typeof i.title === "string" && i.title.trim()) || "(sin título)";
  const url = typeof i.url === "string" && i.url.trim() ? i.url.trim() : "";
  const primera = url ? `- [${titulo}](${url})` : `- ${titulo}`;
  const extra: string[] = [];
  if (typeof i.author === "string" && i.author.trim()) extra.push(i.author.trim());
  if (typeof i.published_at === "string" && i.published_at.trim()) extra.push(i.published_at.trim());
  let linea = extra.length ? `${primera} — ${extra.join(" · ")}` : primera;
  if (typeof i.text === "string" && i.text.trim()) {
    linea += `\n  ${i.text.trim().replace(/\s*\n\s*/g, " ")}`;
  }
  return linea;
}

function normalizarError(valor: unknown, defCode: string): ErrorAgentReach {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const o = valor as Record<string, unknown>;
    return {
      code: typeof o.code === "string" && o.code.trim() ? o.code.trim() : defCode,
      hint: typeof o.hint === "string" ? o.hint : "",
    };
  }
  return { code: defCode, hint: typeof valor === "string" ? valor : "" };
}

/**
 * Parsea la salida de `agent-reach` (un objeto JSON de la v1.6) y NUNCA lanza:
 * salida corrupta → { ok:false, error:{code:"UPSTREAM_BROKEN"} }. El Markdown
 * (`content`) lista los items con su enlace, para quien lee en el chat.
 */
export function leerSobre(salida: unknown): SobreAgentReach {
  if (typeof salida !== "string" || !salida.trim()) {
    return { ok: false, content: "", items: [], error: { code: "UPSTREAM_BROKEN", hint: "El binario devolvió una salida vacía." } };
  }
  let dato: unknown;
  try {
    dato = JSON.parse(salida.slice(salida.indexOf("{")));
  } catch {
    return { ok: false, content: salida.trim(), items: [], error: { code: "UPSTREAM_BROKEN", hint: "La salida no fue JSON válido." } };
  }
  if (!dato || typeof dato !== "object" || Array.isArray(dato)) {
    return { ok: false, content: "", items: [], error: { code: "UPSTREAM_BROKEN", hint: "La salida no fue el objeto JSON esperado." } };
  }
  const o = dato as Record<string, unknown>;
  const items: ItemAgentReach[] = Array.isArray(o.items) ? (o.items as ItemAgentReach[]) : [];
  const content = o.ok === true ? items.map(itemAMarkdown).join("\n") : "";
  return {
    ok: o.ok === true,
    content,
    items,
    error: o.ok === true ? null : normalizarError(o.error, "UPSTREAM_BROKEN"),
  };
}
