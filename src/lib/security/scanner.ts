"use client";

/**
 * SEGURIDAD INTEGRADA (Adenda 63 §13 — architecture/centro-creacion-sync-permisos.md)
 * ------------------------------------------------------------------------------
 * Escáner de SECRETOS y PII estilo Strix: el "antivirus" del OS para datos
 * sensibles. Detecta claves API, tokens, cadenas de conexión, JWT, bloques PEM,
 * asignaciones password/secret/token, correos, teléfonos, IPs privadas con
 * puerto y rutas de usuario — en TEXTO plano y en OBJETOS JSON profundos.
 *
 * Se usa: (a) al compartir/exportar y al instalar/importar (biblioteca,
 * personalidades, memorias de cerebros), (b) en el panel "Seguridad" de Ajustes
 * (escaneo bajo demanda), (c) en auditorías de semillas por defecto.
 *
 * CONTRATO (cero falsos bloqueos):
 *   · NUNCA lanza: toda función devuelve listas/objetos válidos ante cualquier
 *     entrada (undefined, ciclos, tipos raros). Detectar ≠ bloquear — la UI
 *     decide; solo la severidad `critical` se auto-redacta por defecto en los
 *     puntos de compartir/instalar, siempre con opción explícita de
 *     "compartir igualmente".
 *   · SSR-safe: sin window/DOM; el decodificado base64 degrada solo.
 *
 * API principal:
 *   scanText(text)      → Finding[]                {type, label, severity, match enmascarado, index}
 *   scanDeep(obj)       → Finding[] (+path)        recorre objetos/arrays con guardas de ciclo
 *   redactText(text)    → { text, findings, redactedCount }   sustituye por «[REDACTADO:tipo]»
 *   redactDeep(obj)     → { value, findings, redactedCount }  clon profundo redactado
 *   summarize(findings) → resumen agregado con mensaje en español
 */

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
  /** Clave estable del patrón (slug en español, p.ej. "clave_api"). */
  type: string;
  /** Etiqueta legible en español (para la UI). */
  label: string;
  severity: Severity;
  /** Coincidencia PARCIALMENTE ENMASCARADA — nunca el secreto completo. */
  match: string;
  /** Índice de inicio dentro del texto analizado. */
  index: number;
  /** Ruta dentro del objeto (solo scanDeep/redactDeep): "items[3].content". */
  path?: string;
}

export interface RedactTextResult {
  text: string;
  findings: Finding[];
  redactedCount: number;
}

export interface RedactDeepResult<T = unknown> {
  value: T;
  findings: Finding[];
  redactedCount: number;
}

export interface ScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  clean: boolean;
  /** Frase corta en español lista para mostrar. */
  message: string;
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/** ¿`sev` alcanza al menos `min`? (para umbrales de redacción). */
export function severityAtLeast(sev: Severity, min: Severity): boolean {
  return SEVERITY_RANK[sev] >= SEVERITY_RANK[min];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Límite duro de texto analizado (rendimiento; nunca cuelga la UI). */
const MAX_TEXT = 500_000;

/** Enmascara un valor sensible: primeros/últimos caracteres + longitud. */
export function maskSecret(value: string): string {
  try {
    const s = value.replace(/\s+/g, " ").trim();
    if (s.length <= 6) return `${s.slice(0, 1)}···`;
    if (s.length <= 12) return `${s.slice(0, 3)}···${s.slice(-2)}`;
    return `${s.slice(0, 5)}···${s.slice(-3)} (${s.length} car.)`;
  } catch {
    return "···";
  }
}

/** Decodifica base64url sin lanzar (atob en navegador, Buffer en Node, "" si nada). */
function b64UrlDecode(seg: string): string {
  try {
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    if (typeof atob === "function") return atob(padded);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer;
    if (B?.from) return B.from(padded, "base64").toString("utf8");
    return "";
  } catch {
    return "";
  }
}

/** Valores que NO son secretos aunque estén asignados (placeholders, tipos…). */
const PLACEHOLDER_VALUE_RE =
  /^(true|false|null|undefined|none|string|number|boolean|object|process\.env[.[]?|env\.|import\.meta|\$\{|\*{3,}|x{4,}|_{3,}|\.{3,}|·+|\[REDACTADO|tu[-_]?clave|your[-_]?(key|token|secret)|changeme|ejemplo|example|placeholder|xxxx|<[^>]*>$)/i;

/* ------------------------------------------------------------------ */
/* Catálogo de patrones (tipo + etiqueta en español + severidad)        */
/* ------------------------------------------------------------------ */

interface PatternDef {
  type: string;
  label: string;
  severity: Severity;
  re: RegExp; // SIEMPRE con flag g (se clona en uso para no compartir lastIndex)
  /** Índice del grupo de captura con el valor sensible (0 = todo el match). */
  group?: number;
  /**
   * Refinado opcional: puede reclasificar (JWT → service_role) o descartar
   * (devuelve null) una coincidencia. Nunca debe lanzar.
   */
  refine?: (value: string, m: RegExpExecArray) => Partial<Pick<Finding, "type" | "label" | "severity">> | null | undefined;
}

const PATTERNS: PatternDef[] = [
  // ── Claves API conocidas (criticas) ──────────────────────────────
  {
    type: "clave_api_anthropic",
    label: "Clave API de Anthropic",
    severity: "critical",
    re: /\bsk-ant-[A-Za-z0-9_-]{12,}/g,
  },
  {
    type: "clave_api",
    label: "Clave API (sk-…)",
    severity: "critical",
    re: /\bsk-[A-Za-z0-9_-]{16,}/g,
  },
  {
    type: "clave_api_google",
    label: "Clave API de Google",
    severity: "critical",
    re: /\bAIza[0-9A-Za-z_-]{30,}/g,
  },
  {
    type: "token_github",
    label: "Token de GitHub",
    severity: "critical",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    type: "token_slack",
    label: "Token de Slack",
    severity: "critical",
    re: /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
  },
  {
    type: "token_vercel",
    label: "Token de Vercel",
    severity: "critical",
    re: /\bvcp_[A-Za-z0-9]{8,}\b/g,
  },
  {
    type: "clave_api_resend",
    label: "Clave API de Resend",
    severity: "critical",
    re: /\bre_[A-Za-z0-9]{20,}\b/g,
  },
  // ── Bloques PEM (clave privada) ──────────────────────────────────
  {
    type: "clave_privada_pem",
    label: "Clave privada (bloque PEM)",
    severity: "critical",
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]{0,10000}?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
  },
  // ── Cadenas de conexión con credenciales ─────────────────────────
  {
    type: "cadena_conexion",
    label: "Cadena de conexión con credenciales",
    severity: "critical",
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|mssql):\/\/[^\s:@/"']+:[^\s@/"']+@[^\s"'<>)]+/gi,
  },
  // ── JWT (el refinado detecta service_role de Supabase) ───────────
  {
    type: "jwt",
    label: "Token JWT",
    severity: "high",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?/g,
    refine: (value) => {
      const parts = value.split(".");
      const payload = parts.length >= 2 ? b64UrlDecode(parts[1]) : "";
      if (payload.includes("service_role")) {
        return {
          type: "service_role_supabase",
          label: "Clave service_role de Supabase",
          severity: "critical",
        };
      }
      return undefined;
    },
  },
  // ── Asignaciones password/secret/token/clave = valor ─────────────
  {
    type: "asignacion_credencial",
    label: "Contraseña/secreto asignado en texto",
    severity: "high",
    re: /\b(password|passwd|pwd|contrase(?:ñ|n)a|secret|secreto|token|api[_-]?key|apikey|clave|credential)s?\s*[:=]\s*["'`]?([^\s"'`,;]{6,})/gi,
    group: 2,
    refine: (value) => (PLACEHOLDER_VALUE_RE.test(value) ? null : undefined),
  },
  // ── PII: correos ─────────────────────────────────────────────────
  {
    type: "correo",
    label: "Correo electrónico",
    severity: "low",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // ── PII: teléfonos internacionales (+34 …) ───────────────────────
  {
    type: "telefono",
    label: "Teléfono",
    severity: "medium",
    re: /(^|[^\d\w+])(\+\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){2,4})(?!\d)/g,
    group: 2,
  },
  // ── Red: IPs privadas con puerto ─────────────────────────────────
  {
    type: "ip_privada",
    label: "IP privada con puerto",
    severity: "medium",
    re: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.0\.0\.1|localhost):\d{2,5}\b/g,
  },
  // ── Rutas de usuario (macOS/Linux/Windows) ───────────────────────
  {
    type: "ruta_usuario",
    label: "Ruta personal del equipo",
    severity: "low",
    re: /(?:\/(?:Users|home)\/[A-Za-z0-9._-]{2,}(?:\/[^\s"'<>|?*)\]]*)?|[A-Za-z]:\\Users\\[A-Za-z0-9._ -]{2,}(?:\\[^\s"'<>|?*)\]]*)?)/g,
  },
];

/** Nombres de campo que sugieren credencial (scanDeep, clave→valor). */
const SENSITIVE_KEY_RE = /(password|passwd|contrase|secret|secreto|token|api[_-]?key|apikey|credential|authorization|bearer|private[_-]?key)/i;
/** Campos que son REFERENCIAS o metadatos, no valores (keyRef, tokenRef, …). */
const KEY_EXCLUDE_RE = /(ref|name|nombre|label|id|hint|kind|type|tipo|url|path|placeholder|mask)s?$/i;

/* ------------------------------------------------------------------ */
/* Interno: escaneo crudo (rangos reales, para poder redactar)         */
/* ------------------------------------------------------------------ */

interface RawFinding extends Finding {
  /** Rango real dentro del texto (para redacción). */
  start: number;
  end: number;
}

function scanTextRaw(input: unknown): RawFinding[] {
  if (typeof input !== "string" || !input) return [];
  const text = input.length > MAX_TEXT ? input.slice(0, MAX_TEXT) : input;
  const raw: RawFinding[] = [];
  for (const def of PATTERNS) {
    try {
      const re = new RegExp(def.re.source, def.re.flags); // clon: sin lastIndex compartido
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) !== null && guard++ < 2000) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const groupIdx = def.group ?? 0;
        const value = m[groupIdx] ?? m[0];
        if (!value) continue;
        const offset = groupIdx > 0 ? m[0].indexOf(value) : 0;
        const start = m.index + (offset >= 0 ? offset : 0);
        let type = def.type;
        let label = def.label;
        let severity = def.severity;
        if (def.refine) {
          let over: ReturnType<NonNullable<PatternDef["refine"]>>;
          try {
            over = def.refine(value, m);
          } catch {
            over = undefined;
          }
          if (over === null) continue; // descartado (placeholder, falso positivo)
          if (over) {
            type = over.type ?? type;
            label = over.label ?? label;
            severity = over.severity ?? severity;
          }
        }
        raw.push({
          type,
          label,
          severity,
          match: maskSecret(value),
          index: start,
          start,
          end: start + value.length,
        });
      }
    } catch {
      /* un patrón corrupto jamás rompe el escaneo completo */
    }
  }
  // Deduplicación por solape: gana la severidad mayor (y el rango más largo).
  raw.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.end - b.start) - (a.end - a.start));
  const kept: RawFinding[] = [];
  for (const f of raw) {
    const overlaps = kept.some((k) => f.start < k.end && k.start < f.end);
    if (!overlaps) kept.push(f);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

/**
 * Escanea un texto y devuelve los hallazgos (enmascarados). Nunca lanza;
 * con entradas no-string devuelve [].
 */
export function scanText(text: unknown): Finding[] {
  try {
    return scanTextRaw(text).map(({ start: _s, end: _e, ...f }) => f);
  } catch {
    return [];
  }
}

interface WalkState {
  findings: Finding[];
  nodes: number;
  seen: WeakSet<object>;
}

const MAX_DEPTH = 10;
const MAX_NODES = 4000;

function walk(value: unknown, path: string, depth: number, state: WalkState): void {
  if (state.nodes++ > MAX_NODES || depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    for (const f of scanText(value)) state.findings.push({ ...f, path: path || undefined });
    return;
  }
  if (!value || typeof value !== "object") return;
  if (state.seen.has(value as object)) return; // ciclo
  state.seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1, state));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${k}` : k;
    // Heurística clave→valor: campo con nombre de credencial y valor "con pinta"
    // de secreto (no una referencia tipo keyRef/tokenRef, no un placeholder).
    if (
      typeof v === "string" &&
      v.length >= 8 &&
      SENSITIVE_KEY_RE.test(k) &&
      !KEY_EXCLUDE_RE.test(k) &&
      !PLACEHOLDER_VALUE_RE.test(v) &&
      scanText(v).length === 0 // si ya lo cazó un patrón, no duplicar
    ) {
      state.findings.push({
        type: "credencial_por_campo",
        label: `Posible credencial en el campo «${k}»`,
        severity: "high",
        match: maskSecret(v),
        index: 0,
        path: childPath,
      });
    }
    walk(v, childPath, depth + 1, state);
  }
}

/**
 * Escanea en profundidad un objeto/array JSON (strings anidados). Devuelve
 * hallazgos con `path`. Tolerante a ciclos, funciones y tipos exóticos.
 */
export function scanDeep(obj: unknown): Finding[] {
  const state: WalkState = { findings: [], nodes: 0, seen: new WeakSet() };
  try {
    walk(obj, "", 0, state);
  } catch {
    /* nunca lanza */
  }
  return state.findings;
}

export interface RedactOptions {
  /** Severidad mínima a redactar (por defecto "critical"). */
  minSeverity?: Severity;
  /** Si se pasa, SOLO se redactan estos tipos. */
  types?: string[];
}

/**
 * Redacta un texto sustituyendo cada hallazgo que alcance `minSeverity`
 * (por defecto solo `critical`) por «[REDACTADO:tipo]». Devuelve además
 * TODOS los hallazgos (redactados o no) para que la UI informe.
 */
export function redactText(text: string, opts?: RedactOptions): RedactTextResult {
  try {
    if (typeof text !== "string" || !text) return { text: typeof text === "string" ? text : "", findings: [], redactedCount: 0 };
    const min = opts?.minSeverity ?? "critical";
    const raw = scanTextRaw(text);
    const toRedact = raw.filter(
      (f) => severityAtLeast(f.severity, min) && (!opts?.types || opts.types.includes(f.type)),
    );
    let out = text;
    for (const f of [...toRedact].sort((a, b) => b.start - a.start)) {
      out = `${out.slice(0, f.start)}[REDACTADO:${f.type}]${out.slice(f.end)}`;
    }
    return {
      text: out,
      findings: raw.map(({ start: _s, end: _e, ...f }) => f),
      redactedCount: toRedact.length,
    };
  } catch {
    return { text: typeof text === "string" ? text : "", findings: [], redactedCount: 0 };
  }
}

function cloneRedacting(value: unknown, path: string, depth: number, opts: RedactOptions | undefined, acc: { findings: Finding[]; count: number; nodes: number; seen: WeakSet<object> }): unknown {
  if (acc.nodes++ > MAX_NODES || depth > MAX_DEPTH) return value;
  if (typeof value === "string") {
    const r = redactText(value, opts);
    for (const f of r.findings) acc.findings.push({ ...f, path: path || undefined });
    acc.count += r.redactedCount;
    return r.text;
  }
  if (!value || typeof value !== "object") return value;
  if (acc.seen.has(value as object)) return undefined; // corta ciclos en el clon
  acc.seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v, i) => cloneRedacting(v, `${path}[${i}]`, depth + 1, opts, acc));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = cloneRedacting(v, path ? `${path}.${k}` : k, depth + 1, opts, acc);
  }
  return out;
}

/**
 * Clon profundo de un objeto con sus strings redactados (umbral `minSeverity`,
 * por defecto "critical"). El objeto original NO se muta.
 */
export function redactDeep<T>(obj: T, opts?: RedactOptions): RedactDeepResult<T> {
  const acc = { findings: [] as Finding[], count: 0, nodes: 0, seen: new WeakSet<object>() };
  try {
    const value = cloneRedacting(obj, "", 0, opts, acc) as T;
    return { value, findings: acc.findings, redactedCount: acc.count };
  } catch {
    return { value: obj, findings: [], redactedCount: 0 };
  }
}

/** Resumen agregado con mensaje corto en español. */
export function summarize(findings: Finding[] | null | undefined): ScanSummary {
  const list = Array.isArray(findings) ? findings : [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of list) {
    if (f?.severity && f.severity in counts) counts[f.severity]++;
  }
  const total = list.length;
  const parts: string[] = [];
  if (counts.critical) parts.push(`${counts.critical} crítico${counts.critical === 1 ? "" : "s"}`);
  if (counts.high) parts.push(`${counts.high} alto${counts.high === 1 ? "" : "s"}`);
  if (counts.medium) parts.push(`${counts.medium} medio${counts.medium === 1 ? "" : "s"}`);
  if (counts.low) parts.push(`${counts.low} bajo${counts.low === 1 ? "" : "s"}`);
  return {
    total,
    ...counts,
    clean: total === 0,
    message: total === 0
      ? "Sin datos sensibles detectados."
      : `${total} hallazgo${total === 1 ? "" : "s"} (${parts.join(", ")}).`,
  };
}

/** Huella estable de un hallazgo (para "Ignorar" persistente en la UI). */
export function findingFingerprint(f: Finding): string {
  return `${f.type}|${f.path ?? ""}|${f.match}`;
}
