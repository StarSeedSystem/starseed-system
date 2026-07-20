/**
 * openvoice-discovery.ts — DESCUBRIMIENTO AUTOMÁTICO de recursos OpenVoice en
 * Hugging Face (Adenda 79 · petición de Alex: "que automáticamente busque en
 * Hugging Face recursos de spaces, modelos y datasets que ofrezcan APIs para la
 * última versión de OpenVoice, gratis, para las versiones donde no se instala").
 *
 * QUÉ HACE
 *  1) Busca Spaces públicos de OpenVoice con la API pública de HF (CORS abierto),
 *     los clasifica por CONTRATO real (sondeando /config + /info) en dos familias:
 *       · "v2-design"  — el contrato del Space oficial OpenVoiceV2 (Gradio 3,
 *         fn_index con [texto, estilo en_default/es_default/…, referencia, agree]).
 *       · "v1-predict" — OpenVoice con ESTILOS DE EMOCIÓN (Gradio 4, api /predict:
 *         [texto, emoción default/cheerful/sad/…, referencia, tau]).
 *     y guarda la lista ordenada en localStorage (TTL 12 h).
 *  2) Memoria de salud por endpoint: un endpoint que falla la inferencia se
 *     aparta 6 h y la síntesis pasa AUTOMÁTICAMENTE al siguiente. Si todos caen,
 *     se devuelven igualmente (siempre hay una oportunidad de resurrección).
 *  3) Versionado para la Librería del OS: sondea el sha del repo de MODELOS
 *     oficial (myshell-ai/OpenVoiceV2) y expone la info para que la red de la
 *     Librería (Hugging Bay) muestre versión y "buscar actualización" — la
 *     versión INSTALADA (daemon nativo) se actualiza con su autosync de 7 días.
 *
 * Estado real conocido (2026-07-20, verificado en vivo desde la sandbox):
 *  · myshell-ai/OpenVoiceV2 y sus duplicados corren en cpu-basic y su inferencia
 *    falla aguas arriba (success:false en ~2 s) — contract-correct, se
 *    reactivarán solos cuando MyShell/los duplicados restauren GPU/build.
 *  · naveenk-ai/openvoice_voicecloning_win (v1-predict) FUNCIONA HOY: clonación
 *    real con estilos de emoción ("Voice cloning completed successfully").
 *
 * SSR-safe, cero dependencias, nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type OpenVoiceAdapterKind = "v2-design" | "v1-predict";

export interface OpenVoiceEndpoint {
  /** id estable ("owner/space" de HF). */
  id: string;
  /** URL base del Space (https://<sub>.hf.space, sin barra final). */
  base: string;
  /** Familia de contrato (elige el protocolo y el mapeo de parámetros). */
  kind: OpenVoiceAdapterKind;
  /** Versión mayor de Gradio (3 = cola WS, 4 = cola SSE). */
  gradio: 3 | 4;
  /** fn_index a usar (v2-design) o el de /predict (v1-predict). */
  fnIndex: number;
  /** Estilos de emoción soportados (v1-predict). */
  emotions?: string[];
  /** Anotación de origen: integrado o descubierto en vivo. */
  origin: "builtin" | "discovered";
}

export interface OpenVoiceDiscoverySnapshot {
  at: number;
  endpoints: OpenVoiceEndpoint[];
  /** sha del repo oficial de modelos (versión de la "última OpenVoice"). */
  modelSha?: string;
  modelUpdatedAt?: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const LS_SNAPSHOT = "starseed.aurora.openvoice.discovery.v1";
const LS_HEALTH = "starseed.aurora.openvoice.health.v1";
const SNAPSHOT_TTL_MS = 12 * 60 * 60_000; // 12 h
const BAD_ENDPOINT_MS = 6 * 60 * 60_000; // 6 h apartado tras fallo de inferencia
const PROBE_TIMEOUT_MS = 9_000;
const MAX_PROBES = 8; // Spaces a sondear por descubrimiento (los más relevantes)

/** Repo oficial de MODELOS (versión canónica de la última OpenVoice). */
export const OPENVOICE_MODEL_REPO = "myshell-ai/OpenVoiceV2";

/** Emociones del contrato v1-predict (verificadas en vivo). */
export const OPENVOICE_V1_EMOTIONS = [
  "default",
  "whispering",
  "cheerful",
  "terrified",
  "angry",
  "sad",
  "friendly",
] as const;

/**
 * Endpoints INTEGRADOS (semilla del descubrimiento; verificados a mano).
 * El descubrimiento vivo puede añadir más por encima de estos.
 */
export const OPENVOICE_BUILTIN_ENDPOINTS: OpenVoiceEndpoint[] = [
  {
    id: "myshell-ai/OpenVoiceV2",
    base: "https://myshell-ai-openvoicev2.hf.space",
    kind: "v2-design",
    gradio: 3,
    fnIndex: 1,
    origin: "builtin",
  },
  {
    id: "AaronLikesModels/OpenVoiceV2",
    base: "https://aaronlikesmodels-openvoicev2.hf.space",
    kind: "v2-design",
    gradio: 3,
    fnIndex: 1,
    origin: "builtin",
  },
  {
    id: "naveenk-ai/openvoice_voicecloning_win",
    base: "https://naveenk-ai-openvoice-voicecloning-win.hf.space",
    kind: "v1-predict",
    gradio: 4,
    fnIndex: 0,
    emotions: [...OPENVOICE_V1_EMOTIONS],
    origin: "builtin",
  },
];

// ── Utilidades ───────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

/** "owner/Space Name" → subdominio hf.space ("owner-space-name"). */
export function spaceIdToHost(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchJson(url: string, timeoutMs = PROBE_TIMEOUT_MS, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ── Clasificación de contrato (a partir de /info del Space) ──────────────────

interface InfoParam {
  label?: string;
  python_type?: { type?: string };
  component?: string;
}
interface InfoEndpoint {
  parameters?: InfoParam[];
}

/** ¿Es la firma [texto, estilo en_default/…, referencia audio, agree]? (contrato V2) */
export function looksLikeV2Design(ep: InfoEndpoint | undefined): boolean {
  const p = ep?.parameters;
  if (!Array.isArray(p) || p.length !== 4) return false;
  const styles = String(p[1]?.python_type?.type ?? "") + String((p[1] as { type?: { description?: string } })?.type?.description ?? "");
  return /en_default/.test(styles) && /Audio/i.test(String(p[2]?.component ?? ""));
}

/** ¿Es la firma [texto, emoción(default/cheerful/…), referencia, tau]? (V1 con emociones) */
export function looksLikeV1Predict(ep: InfoEndpoint | undefined): boolean {
  const p = ep?.parameters;
  if (!Array.isArray(p) || p.length < 3 || p.length > 5) return false;
  const styles = String(p[1]?.python_type?.type ?? "");
  return /cheerful/.test(styles) && /sad/.test(styles);
}

/** Extrae la lista de emociones del literal del parámetro (best-effort). */
export function emotionsFromLiteral(t: string): string[] {
  const out: string[] = [];
  const re = /'([a-z_ ]{2,24})'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = m[1].trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.length ? out : [...OPENVOICE_V1_EMOTIONS];
}

/**
 * Sondea UN Space y lo clasifica. Devuelve null si no expone un contrato
 * OpenVoice reconocible (o no responde).
 */
export async function probeSpaceContract(
  id: string,
  signal?: AbortSignal,
): Promise<OpenVoiceEndpoint | null> {
  const base = `https://${spaceIdToHost(id)}.hf.space`;
  // /config nos da la versión de Gradio y los api_name por dependencia.
  const cfg = (await fetchJson(`${base}/config`, PROBE_TIMEOUT_MS, signal)) as
    | { version?: string; dependencies?: { api_name?: string | null }[] }
    | null;
  if (!cfg || !cfg.version) return null;
  const major = Number(String(cfg.version).split(".")[0]);
  const info = (await fetchJson(`${base}/info`, PROBE_TIMEOUT_MS, signal)) as
    | { named_endpoints?: Record<string, InfoEndpoint>; unnamed_endpoints?: Record<string, InfoEndpoint> }
    | null;
  if (!info) return null;

  // v1-predict (named /predict) — preferencia: es el que hoy FUNCIONA.
  const predict = info.named_endpoints?.["/predict"];
  if (predict && looksLikeV1Predict(predict)) {
    let fnIndex = 0;
    (cfg.dependencies || []).forEach((d, i) => {
      if (d?.api_name === "predict") fnIndex = i;
    });
    const litSrc = String(predict.parameters?.[1]?.python_type?.type ?? "");
    return {
      id,
      base,
      kind: "v1-predict",
      gradio: major >= 4 ? 4 : 3,
      fnIndex,
      emotions: emotionsFromLiteral(litSrc),
      origin: "discovered",
    };
  }

  // v2-design (unnamed, firma del oficial).
  const unnamed = info.unnamed_endpoints || {};
  for (const k of Object.keys(unnamed)) {
    if (looksLikeV2Design(unnamed[k])) {
      return {
        id,
        base,
        kind: "v2-design",
        gradio: major >= 4 ? 4 : 3,
        fnIndex: Number(k) || 1,
        origin: "discovered",
      };
    }
  }
  return null;
}

// ── Descubrimiento en HF (Spaces + versión del repo de modelos) ─────────────

interface HfSpaceListing {
  id?: string;
  likes?: number;
  sdk?: string;
  private?: boolean;
}

/**
 * Busca Spaces candidatos en la API pública de HF. También registra la versión
 * (sha) del repo oficial de modelos para la Librería. Nunca lanza.
 */
export async function discoverOpenVoiceEndpoints(opts: {
  force?: boolean;
  signal?: AbortSignal;
} = {}): Promise<OpenVoiceDiscoverySnapshot> {
  const cached = readSnapshot();
  if (!opts.force && cached && now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const found = new Map<string, HfSpaceListing>();
  for (const q of ["openvoice", "OpenVoiceV2", "openvoice v2"]) {
    const list = (await fetchJson(
      `https://huggingface.co/api/spaces?search=${encodeURIComponent(q)}&limit=60`,
      PROBE_TIMEOUT_MS,
      opts.signal,
    )) as HfSpaceListing[] | null;
    for (const s of Array.isArray(list) ? list : []) {
      if (s?.id && s.sdk !== "docker" && !s.private) found.set(s.id, s);
    }
  }

  // Orden de sondeo: los integrados primero (contrato ya conocido → gratis),
  // luego los más "gustados" (proxy de calidad/estabilidad).
  const builtinIds = new Set(OPENVOICE_BUILTIN_ENDPOINTS.map((e) => e.id));
  const toProbe = [...found.values()]
    .filter((s) => !builtinIds.has(String(s.id)))
    .sort((a, b) => (b.likes || 0) - (a.likes || 0))
    .slice(0, MAX_PROBES)
    .map((s) => String(s.id));

  const discovered: OpenVoiceEndpoint[] = [];
  // Sondeo secuencial suave (no martillear HF); cada sonda ya tiene timeout corto.
  for (const id of toProbe) {
    const ep = await probeSpaceContract(id, opts.signal).catch(() => null);
    if (ep) discovered.push(ep);
  }

  // Versión del repo oficial de MODELOS (para la Librería / actualizaciones).
  const model = (await fetchJson(
    `https://huggingface.co/api/models/${OPENVOICE_MODEL_REPO}`,
    PROBE_TIMEOUT_MS,
    opts.signal,
  )) as { sha?: string; lastModified?: string } | null;

  const snapshot: OpenVoiceDiscoverySnapshot = {
    at: now(),
    endpoints: [...OPENVOICE_BUILTIN_ENDPOINTS, ...discovered],
    modelSha: model?.sha,
    modelUpdatedAt: model?.lastModified,
  };
  writeSnapshot(snapshot);
  return snapshot;
}

/** Refresco en segundo plano si el snapshot caducó (fire-and-forget). */
let discoveryInFlight = false;
export function ensureDiscoveryFresh(): void {
  try {
    if (typeof window === "undefined" || discoveryInFlight) return;
    const cached = readSnapshot();
    if (cached && now() - cached.at < SNAPSHOT_TTL_MS) return;
    discoveryInFlight = true;
    void discoverOpenVoiceEndpoints({ force: true })
      .catch(() => null)
      .finally(() => {
        discoveryInFlight = false;
      });
  } catch {
    /* nunca rompe al llamador */
  }
}

// ── Persistencia ─────────────────────────────────────────────────────────────

function readSnapshot(): OpenVoiceDiscoverySnapshot | null {
  try {
    const raw = safeGet(LS_SNAPSHOT);
    if (!raw) return null;
    const j = JSON.parse(raw) as OpenVoiceDiscoverySnapshot;
    if (!j || !Array.isArray(j.endpoints)) return null;
    return j;
  } catch {
    return null;
  }
}

function writeSnapshot(s: OpenVoiceDiscoverySnapshot): void {
  try {
    safeSet(LS_SNAPSHOT, JSON.stringify(s));
  } catch {
    /* */
  }
}

interface HealthMap {
  [id: string]: { badUntil?: number; lastOkAt?: number };
}

function readHealth(): HealthMap {
  try {
    const raw = safeGet(LS_HEALTH);
    return raw ? ((JSON.parse(raw) as HealthMap) || {}) : {};
  } catch {
    return {};
  }
}

function writeHealth(h: HealthMap): void {
  try {
    safeSet(LS_HEALTH, JSON.stringify(h));
  } catch {
    /* */
  }
}

/**
 * Registra el resultado REAL de una síntesis contra un endpoint. Un fallo de
 * inferencia (space-error/no-audio) lo aparta BAD_ENDPOINT_MS; un éxito lo
 * rehabilita al instante.
 */
export function markOpenVoiceEndpointResult(id: string, ok: boolean, badMinutes?: number): void {
  const h = readHealth();
  if (ok) h[id] = { lastOkAt: now() };
  else {
    const ms = badMinutes && badMinutes > 0 ? badMinutes * 60_000 : BAD_ENDPOINT_MS;
    h[id] = { ...(h[id] || {}), badUntil: now() + ms };
  }
  writeHealth(h);
}

/** ¿Está este endpoint apartado por fallo reciente? */
export function isOpenVoiceEndpointBad(id: string): boolean {
  const e = readHealth()[id];
  return !!(e?.badUntil && e.badUntil > now());
}

// ── Selección ────────────────────────────────────────────────────────────────

/**
 * Lista ORDENADA de endpoints a intentar AHORA (sin red; usa el snapshot):
 *  1º los sanos/desconocidos con contrato v2-design (la última versión),
 *  2º los sanos/desconocidos v1-predict (funcionan hoy, con emociones),
 *  3º si TODOS están apartados, devuelve todos igualmente (resurrección).
 * Los endpoints con éxito RECIENTE se anteponen dentro de su familia.
 */
export function orderedOpenVoiceEndpoints(): OpenVoiceEndpoint[] {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : OPENVOICE_BUILTIN_ENDPOINTS;
  const health = readHealth();
  const score = (e: OpenVoiceEndpoint): number => {
    const h = health[e.id];
    let s = 0;
    if (e.kind === "v2-design") s += 20; // preferimos la última versión…
    if (h?.lastOkAt && now() - h.lastOkAt < 24 * 60 * 60_000) s += 40; // …pero lo que FUNCIONA manda
    if (e.origin === "builtin") s += 5;
    return s;
  };
  const alive = eps.filter((e) => !isOpenVoiceEndpointBad(e.id));
  const pool = alive.length ? alive : eps;
  return [...pool].sort((a, b) => score(b) - score(a));
}

/** Info para la UI (chip del panel de voz / Librería). Sin red. */
export function getOpenVoiceDiscoveryInfo(): {
  endpoints: OpenVoiceEndpoint[];
  healthy: number;
  modelSha?: string;
  modelUpdatedAt?: string;
  discoveredAt?: number;
} {
  const snap = readSnapshot();
  const eps = snap?.endpoints?.length ? snap.endpoints : OPENVOICE_BUILTIN_ENDPOINTS;
  return {
    endpoints: eps,
    healthy: eps.filter((e) => !isOpenVoiceEndpointBad(e.id)).length,
    modelSha: snap?.modelSha,
    modelUpdatedAt: snap?.modelUpdatedAt,
    discoveredAt: snap?.at,
  };
}
