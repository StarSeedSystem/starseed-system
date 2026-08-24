/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT · categorización y lista unificada de avisos (Ola 4 · Adenda 156)
 * ---------------------------------------------------------------------------
 * SOP: `architecture/astraura-158-ola4-runtime-y-pestanas.md` §2.
 *
 * Capa PURA (sin DOM, sin red, testeable con Vitest en entorno `node`) que usa
 * la pestaña de notificaciones del Studio 1.58 para:
 *   · derivar una CATEGORÍA de cada evento/notificación (`categoryForEvent`)
 *     con una heurística tolerante sobre `kind`/`source`/`category`/texto.
 *     Los distintos backends del 1.58 (puente nuevo vs `/api/notifications`
 *     clásico) no siempre mandan los mismos campos, así que la heurística
 *     nunca exige ninguno en concreto y nunca lanza: sin coincidencias cae a
 *     `"general"` (visible solo bajo el filtro «Todas»).
 *   · fusionar eventos del puente (`fetchAstraura158Events`, que ya trae
 *     imaginación/enjambre/director/aprendizaje) y notificaciones clásicas
 *     (`fetchAstraura158Notifications`) en una sola lista sin duplicados
 *     (`mergeS158Feed`), con los campos que la pestaña necesita ya
 *     normalizados: nivel, origen/proceso, `generated_by` («modelo real» vs
 *     «plantilla»), acción disponible («Conceder» / «Autorizar y Aplicar») y
 *     los pasos de `data.steps` para el árbol de procesos ramificados.
 *
 * `kind`, `category`, `actions`, `steps`, `generated_by`, `branch_id` no
 * están tipados en `Astraura158Event` (el puente los manda dentro de `data`,
 * forma libre) ni siempre en `Astraura158Notification`: se leen a través de
 * `looseExtra()` sin asumir su forma, igual que ya hace `imaginacion-tab.tsx`
 * con `generated_by` en las ramas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import type { Astraura158Event, Astraura158Notification } from "@/lib/astraura/astraura-158-client";

/* ───────────────── preferencia «dónde avisar» (Ola 4) ───────────────── */

/**
 * `"tab"` (defecto): las notificaciones de la IA solo se ven en su propia
 * pestaña. `"tab+os"` (opt-in explícito): además, toasts + centro de
 * notificaciones del OS, como antes de la Ola 4. Vive aquí (módulo puro, sin
 * React ni `notifyFromApp`) para poder testearse sin arrastrar esas
 * dependencias; `astraura-158-feed.ts` re-exporta ambas funciones porque es
 * quien las CONSUME (respeta el modo en cada sondeo).
 */
export type Astraura158NotifyMode = "tab" | "tab+os";
export const ASTRAURA_158_NOTIFY_MODE_KEY = "starseed.astraura158.notify.v1";

/** Preferencia actual. Nunca lanza; cualquier valor ausente/desconocido cae a `"tab"`. */
export function getAstraura158NotifyMode(): Astraura158NotifyMode {
  return safeGet(ASTRAURA_158_NOTIFY_MODE_KEY) === "tab+os" ? "tab+os" : "tab";
}

/** Fija la preferencia (persistente vía `safeSet`, nunca lanza). */
export function setAstraura158NotifyMode(mode: Astraura158NotifyMode): void {
  safeSet(ASTRAURA_158_NOTIFY_MODE_KEY, mode === "tab+os" ? "tab+os" : "tab");
}

/* ───────────────────────────── categorías ───────────────────────────────── */

export type S158Category = "autorizacion" | "imaginacion" | "sensores" | "hardware" | "red" | "aprendizaje" | "general";

/** Etiqueta en español de cada categoría (pastillas de filtro + badges). */
export const S158_CATEGORY_LABEL: Record<S158Category, string> = {
  autorizacion: "Solicitudes de autorización",
  imaginacion: "Imaginación & Sueños",
  sensores: "Sensores & Clima",
  hardware: "Hardware & M1",
  red: "Red & Almacenamiento",
  aprendizaje: "Aprendizaje",
  general: "General",
};

/** Orden de las pastillas de filtro. «general» no tiene pastilla propia: solo vive bajo «Todas». */
export const S158_FILTER_CATEGORIES: S158Category[] = ["autorizacion", "imaginacion", "sensores", "hardware", "red", "aprendizaje"];

/** Señales que puede usar la heurística. Todas opcionales: tolera cualquier forma de origen. */
export interface S158CategorySignal {
  kind?: string | null;
  source?: string | null;
  process?: string | null;
  category?: string | null;
  title?: string | null;
  message?: string | null;
}

// Nota bilingüe y de identificadores: `kind`/`source`/`process` suelen venir
// en inglés, tal cual el backend Python los nombra —snake_case incluido—
// (`imagination`, `swarm`, `director`, `learning`, `dream`, `auth_orchestrator`,
// `background_learner`, `storage_routing`… confirmado en
// `scripts/verify_real_ola3.py`: «imagination 6 · swarm 11 · learning 1 ·
// director 6»), mientras que `title`/`message` suelen venir en español (la UI
// del 1.58 es toda en español). Los patrones buscan la RAÍZ como substring
// plano (sin `\b`) para cazar ambos idiomas y CUALQUIER forma —plurales,
// conjugaciones, snake_case— sin exigir la forma exacta: nótese que `\b` en
// JS NO trata `_` como separador (es un carácter de palabra), así que un
// límite de apertura habría fallado igualmente con «background_learner». Las
// raíces cortas y de verdad colisionables (`red`, `ram`, `lan`, `gps`) llevan
// límites `\b...\b` en ambos lados para no disparar con «redactar»/«trama»;
// `rama`/`branch` llevan solo el de apertura (`\brama`) porque, sin él,
// disparan con «programa» (la contiene a mitad de palabra) — un falso
// positivo real y no un simple caso raro.
const CATEGORY_RX: Record<Exclude<S158Category, "general">, RegExp> = {
  // Peticiones del orquestador de autorizaciones / permisos / accesos.
  // `permis` cubre a la vez «permiso(s)» (ES) y «permission» (EN): comparten raíz.
  // (Sin «embargo» suelto: es un conector español larguísimamente más común
  // como «sin embargo» que como el `requests_embargoed` del orquestador.)
  autorizacion: /autoriz|orquestad|orchestrat|permis|approval|\bgrant\b|solicitud de (acceso|autorizaci[oó]n)|requiere autorizaci[oó]n|pol[ií]tica de acceso/i,
  // Aprendizaje de fondo (background_learner): conceptos consolidados, entrenamiento, habilidades.
  aprendizaje: /aprendiza|learn|entrenamient|training|dataset|concepto.?(aprendid|consolidad)|concept.?consolidat|skill|habilidad aprendida|fine.?tun|epoch/i,
  // Sensorium y clima.
  sensores: /sensor|clima|weather|meteorol|ubicaci[oó]n|\bgps\b|temperatura|humedad|presi[oó]n atmosf|luz ambiente|proximidad|br[uú]jula|aceler[oó]metro|micr[oó]fono|c[aá]mara|sensorium/i,
  // Telemetría de hardware / Apple Silicon.
  hardware: /hardware|\bm1\b|\bcpu|\bgpu|\bnpu|\bram\b|bater[ií]a|battery|t[eé]rmic|disco (duro|ssd)|\bssd|nvme|neural engine|n[uú]cleos|silicio|benchmark|telemetr[ií]a/i,
  // Red/malla y enrutamiento de almacenamiento.
  red: /\bred(es)?\b|network|wifi|\blan\b|malla|mesh|almacenamiento|storage|dispositivo|sincroniz|synchroniz|\bsync|respaldo|backup|nube|cloud|ancho de banda|bandwidth|t[uú]nel|tunnel|medio enrutado/i,
  // Imaginación intuitiva, sueños, enjambre, director: el subsistema creativo/autónomo.
  // `\brama`/`\bbranch` con límite de apertura: sin él, «rama» dispara con
  // «programa» (contiene «rama» a mitad de palabra) — un falso positivo real.
  imaginacion: /imagina|sue[ñn]o|dream|\brama|\bbranch|propuesta|proposal|hip[oó]tesis|s[ií]ntesis|synthesis|enjambre|swarm|director|creativ/i,
};

const CATEGORY_PRIORITY: Exclude<S158Category, "general">[] = ["autorizacion", "aprendizaje", "sensores", "hardware", "red", "imaginacion"];

/**
 * Deriva la categoría de un evento/notificación a partir de `kind`, `source`,
 * `category` y el texto (título+mensaje). Pura y tolerante: nunca lanza, y
 * cualquier entrada vacía/`null`/`undefined` cae honestamente a `"general"`.
 *
 * Prioridad autorización > aprendizaje > sensores > hardware > red >
 * imaginación: así «propuesta de imaginación que requiere autorización» cae
 * en autorización y no se la traga el cajón, más amplio, de imaginación.
 */
export function categoryForEvent(e: S158CategorySignal | null | undefined): S158Category {
  if (!e) return "general";
  const blob = [e.kind, e.source, e.process, e.category, e.title, e.message]
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .join(" · ")
    .toLowerCase();
  if (!blob) return "general";
  for (const cat of CATEGORY_PRIORITY) {
    if (CATEGORY_RX[cat].test(blob)) return cat;
  }
  return "general";
}

/** Cuenta items por categoría (para los contadores de las pastillas). */
export function countByCategory(items: { category: S158Category }[]): Record<S158Category, number> {
  const out = { autorizacion: 0, imaginacion: 0, sensores: 0, hardware: 0, red: 0, aprendizaje: 0, general: 0 } as Record<S158Category, number>;
  for (const it of items) out[it.category] += 1;
  return out;
}

/* ───────────────────────────── lista unificada ──────────────────────────── */

export interface S158Step { label: string; ms: number; status: string }

/** Etiqueta del botón de acción: «Conceder» cuando la acción es `grant`, si no «Autorizar y Aplicar». */
export type S158ActionLabel = "Conceder" | "Autorizar y Aplicar";

export interface S158FeedItem {
  id: string;
  origin: "event" | "notification";
  /** Epoch ms; 0 si no se pudo determinar. */
  ts: number;
  level: string;
  /** Origen/proceso a mostrar (source · process · category del backend). */
  source: string;
  title: string;
  message: string;
  category: S158Category;
  read: boolean;
  status: string;
  generatedBy: "llm" | "template" | "";
  branchId: string;
  /** `null` = sin acción disponible (ya aplicada/descartada o sin `actions`/`action_type`). */
  actionLabel: S158ActionLabel | null;
  steps: S158Step[];
  raw: Astraura158Event | Astraura158Notification;
}

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Campos libres de un evento/notificación: su propio nivel + `data` (si lo trae), fusionados. */
function looseExtra(raw: unknown): Record<string, unknown> {
  const top = record(raw);
  const nested = record(top.data);
  return Object.keys(nested).length ? { ...top, ...nested } : top;
}

function tsOf(v?: number | null): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e12 ? n : n * 1000; // segundos → ms
}

/** ¿Trae una acción concedible/aplicable? `actions[]` (id `grant`/`apply`) o `action_type` sueltos. */
function actionLabelOf(extra: Record<string, unknown>, actionType: string, status: string): S158ActionLabel | null {
  if (/applied|done|discarded|rejected/i.test(status)) return null;
  const actionsRaw = extra.actions;
  if (Array.isArray(actionsRaw)) {
    for (const a of actionsRaw) {
      const id = str(record(a).id ?? record(a).action_type ?? record(a).type).toLowerCase();
      if (id === "grant") return "Conceder";
      if (id === "apply") return "Autorizar y Aplicar";
    }
  }
  const type = (actionType || str(extra.action_type)).toLowerCase();
  if (!type) return null;
  return type === "grant" ? "Conceder" : "Autorizar y Aplicar";
}

/** Pasos del árbol de ramificación (`data.steps`), si el evento los trae. Nunca lanza. */
function stepsOf(extra: Record<string, unknown>): S158Step[] {
  const raw = extra.steps;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map((s) => {
    const o = record(s);
    const label = str(o.label ?? o.name ?? o.title ?? o.step) || "paso";
    const ms = Number(o.ms ?? o.duration_ms ?? o.elapsed_ms ?? o.duration ?? 0);
    return { label, ms: Number.isFinite(ms) ? ms : 0, status: str(o.status ?? o.state) };
  });
}

function itemFromEvent(e: Astraura158Event): S158FeedItem {
  const extra = looseExtra(e);
  const status = str(extra.status);
  const signal: S158CategorySignal = {
    kind: str(extra.kind) || null,
    source: e.source ?? (str(extra.source) || null),
    process: e.process ?? (str(extra.process) || null),
    category: str(extra.category) || null,
    title: e.title ?? null,
    message: e.message ?? null,
  };
  return {
    id: e.id,
    origin: "event",
    ts: tsOf(e.ts ?? e.timestamp),
    level: String(e.level ?? e.severity ?? "info").toLowerCase(),
    source: e.source ?? e.process ?? "backend",
    title: e.title ?? "",
    message: e.message ?? "",
    category: categoryForEvent(signal),
    read: !!e.read || !!e.acked,
    status,
    generatedBy: extra.generated_by === "llm" ? "llm" : extra.generated_by === "template" ? "template" : "",
    branchId: str(extra.branch_id),
    actionLabel: actionLabelOf(extra, "", status),
    steps: stepsOf(extra),
    raw: e,
  };
}

function itemFromNotification(n: Astraura158Notification): S158FeedItem {
  const extra = looseExtra(n);
  const status = n.status ?? str(extra.status);
  const signal: S158CategorySignal = {
    kind: str(extra.kind) || null,
    source: str(extra.source) || null,
    process: str(extra.process) || null,
    category: n.category ?? null,
    title: n.title ?? null,
    message: n.message ?? null,
  };
  return {
    id: n.id,
    origin: "notification",
    ts: tsOf(n.timestamp),
    level: String(n.severity ?? "info").toLowerCase(),
    source: n.category ?? "backend",
    title: n.title ?? "",
    message: n.message ?? "",
    category: categoryForEvent(signal),
    read: !!n.read,
    status,
    generatedBy: extra.generated_by === "llm" ? "llm" : extra.generated_by === "template" ? "template" : "",
    branchId: n.branch_id ?? "",
    actionLabel: actionLabelOf(extra, n.action_type ?? "", status),
    steps: stepsOf(extra),
    raw: n,
  };
}

/**
 * Fusiona eventos del puente + notificaciones clásicas en una sola lista sin
 * duplicados (mismo id → gana el EVENTO, forma más rica) y ordenada por
 * fecha descendente. Pura: no toca red ni almacenamiento, nunca lanza.
 */
export function mergeS158Feed(events: Astraura158Event[], notifications: Astraura158Notification[]): S158FeedItem[] {
  const byId = new Map<string, S158FeedItem>();
  for (const n of notifications) { if (n?.id) byId.set(n.id, itemFromNotification(n)); }
  for (const e of events) { if (e?.id) byId.set(e.id, itemFromEvent(e)); }
  return Array.from(byId.values()).sort((a, b) => b.ts - a.ts);
}
