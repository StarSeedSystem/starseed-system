"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — NOTIFICACIONES DE ACTUALIZACIONES E INSTALACIONES IMPORTANTES
 * ---------------------------------------------------------------------------
 * "Desde cada configuración se debe notar que hay una actualización": este
 * módulo reúne los AVISOS que el sistema quiere mostrar en cada dispositivo/
 * contexto, para que el usuario sepa cuándo:
 *   · update-app       → hay una versión nueva del sistema (reábrela/instálala).
 *   · install-suggestion → Aurora sugiere instalar algo según su dispositivo/
 *                          contexto (visión, IA local, conectar una fuente gratis…).
 *   · important        → un cambio importante declarado a mano (p.ej. rediseño,
 *                        migración, novedad destacada de la ola).
 *
 * Gratis-primero y honesto: NO descarga nada; solo AVISA y enlaza a la acción
 * real (una ruta interna del OS o un enlace externo para conseguir una clave).
 *
 * Persistencia: `starseed.updates.seen.v1` guarda qué avisos ya vio el usuario
 * (viaja con la cuenta vía SYNCED_KEYS → el "visto" se respeta entre dispositivos).
 * SSR-safe y defensivo: nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { computeSuggestions, type Suggestion } from "@/ai/astraura/autonomy";

/* ─────────────────────── Constantes de release ─────────────────────── */

/**
 * Release actual del OS. Cámbiala en cada despliegue con novedad relevante:
 * si NO coincide con la última vista por el usuario, se genera el aviso
 * "hay una actualización importante del sistema".
 */
export const CURRENT_RELEASE = "2026-07-04-astraura-2";

/** Clave de "avisos ya vistos" (viaja con la cuenta vía SYNCED_KEYS). */
export const SEEN_KEY = "starseed.updates.seen.v1";

/** Evento que emitimos cuando hay algo nuevo que mostrar (para la campanita). */
export const UPDATES_EVENT = "starseed:updates";

/* ─────────────────────── Tipos ─────────────────────── */

export type NotificationKind = "update-app" | "install-suggestion" | "important";

export interface UpdateNotification {
  /** Id estable del aviso (se usa para marcar "visto"). */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** Acción: ruta interna (link) o URL externa (`external:true`). */
  href?: string;
  external?: boolean;
  /** Prioridad 1-10 (mayor = más arriba y peso en el contador). */
  priority: number;
}

/**
 * Avisos "important" declarados a mano para la ola actual. Se muestran hasta que
 * el usuario los marca vistos. Añade aquí novedades destacadas de cada release.
 * Se les prefija el id con la release para que un nuevo despliegue los reofrezca.
 */
const IMPORTANT_NOTICES: Omit<UpdateNotification, "id" | "kind">[] = [
  {
    title: "Tu Biblioteca ya viene con defaults listos",
    detail:
      "Aurora ahora arranca con IA gratis (Pollinations), materiales cristalinos y animaciones activados por defecto. Puedes cambiarlo todo en la Biblioteca.",
    href: "/library",
    priority: 5,
  },
];

/* ─────────────────────── Estado "visto" (SSR-safe) ─────────────────────── */

interface SeenState {
  /** Última release que el usuario reconoció como vista. */
  release: string;
  /** id de aviso → timestamp en que lo marcó visto. */
  ids: Record<string, number>;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readSeen(): SeenState {
  if (!isClient()) return { release: "", ids: {} };
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p !== "object") return { release: "", ids: {} };
    return {
      release: typeof p.release === "string" ? p.release : "",
      ids: p.ids && typeof p.ids === "object" && !Array.isArray(p.ids) ? p.ids : {},
    };
  } catch {
    return { release: "", ids: {} };
  }
}

function writeSeen(s: SeenState): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  } catch { /* cuota / modo privado: degradamos en silencio */ }
}

function emitUpdates(): void {
  if (!isClient()) return;
  try { window.dispatchEvent(new Event(UPDATES_EVENT)); } catch { /* noop */ }
}

/* ─────────────────────── Marcado de vistos ─────────────────────── */

/** ¿Ya vio el usuario este aviso? (los update-app se comparan por release). */
function isSeen(id: string): boolean {
  return id in readSeen().ids;
}

/** Marca un aviso como visto. Si es el de actualización, fija la release vista. */
export function markSeen(id: string): void {
  if (!isClient() || !id) return;
  const s = readSeen();
  s.ids[id] = Date.now();
  if (id === updateAppId()) s.release = CURRENT_RELEASE;
  writeSeen(s);
  emitUpdates();
}

/** Marca TODOS los avisos pendientes como vistos (y reconoce la release actual). */
export async function markAllSeen(): Promise<void> {
  if (!isClient()) return;
  const pending = await getPendingNotifications();
  const s = readSeen();
  const now = Date.now();
  for (const n of pending) s.ids[n.id] = now;
  s.release = CURRENT_RELEASE;
  writeSeen(s);
  emitUpdates();
}

/* ─────────────────────── Cálculo de avisos ─────────────────────── */

/** Id del aviso de actualización de la release ACTUAL (estable por release). */
function updateAppId(): string {
  return `update-app::${CURRENT_RELEASE}`;
}

/** Convierte una sugerencia de autonomía en aviso de "instalar/conectar". */
function suggestionToNotification(s: Suggestion): UpdateNotification {
  // Id estable por (kind + href) para que "visto" no se pierda entre recomputados,
  // pero re-aparezca si cambia el contexto (otra sugerencia distinta).
  const id = `suggestion::${s.kind}::${s.href ?? "no-href"}`;
  return {
    id,
    kind: "install-suggestion",
    title: s.title,
    detail: s.detail,
    href: s.href,
    external: s.external,
    priority: Math.max(1, Math.min(10, s.priority)),
  };
}

/**
 * Devuelve los avisos PENDIENTES (no vistos) para el contexto dado, ordenados
 * por prioridad. Combina:
 *   (a) actualización del sistema (si CURRENT_RELEASE ≠ última vista);
 *   (b) sugerencias de instalación según dispositivo/contexto (autonomy);
 *   (c) avisos "important" declarados.
 * `context` = ruta/área actual (se pasa a computeSuggestions para afinar).
 * Defensivo: si algo falla, devuelve lo que sí pudo calcular.
 */
export async function getPendingNotifications(context?: string): Promise<UpdateNotification[]> {
  if (!isClient()) return [];
  const out: UpdateNotification[] = [];
  const seen = readSeen();

  // (a) Actualización del sistema: hay versión nueva si la release vista difiere.
  if (seen.release !== CURRENT_RELEASE) {
    const id = updateAppId();
    if (!isSeen(id)) {
      out.push({
        id,
        kind: "update-app",
        title: "Hay una actualización del sistema",
        detail:
          "StarSeed OS se ha actualizado. Si tienes la app instalada, ciérrala y reábrela para cargar la versión nueva; en el navegador basta con recargar.",
        priority: 10,
      });
    }
  }

  // (b) Sugerencias de instalación según dispositivo/contexto.
  try {
    const suggestions = await computeSuggestions(context);
    for (const s of suggestions) {
      const n = suggestionToNotification(s);
      if (!isSeen(n.id)) out.push(n);
    }
  } catch { /* sin sugerencias: seguimos con el resto */ }

  // (c) Avisos "important" declarados (prefijados por release para reofrecerlos).
  for (let i = 0; i < IMPORTANT_NOTICES.length; i++) {
    const base = IMPORTANT_NOTICES[i];
    const id = `important::${CURRENT_RELEASE}::${i}`;
    if (!isSeen(id)) out.push({ id, kind: "important", ...base });
  }

  // Dedupe por id (una sugerencia podría coincidir con un important) + orden.
  const byId = new Map<string, UpdateNotification>();
  for (const n of out) if (!byId.has(n.id)) byId.set(n.id, n);
  return Array.from(byId.values()).sort((a, b) => b.priority - a.priority);
}

/** Nº de avisos pendientes (para la campanita). Defensivo. */
export async function getPendingCount(context?: string): Promise<number> {
  return (await getPendingNotifications(context)).length;
}

/* ─────────────────────── Vigilancia de nueva versión (SW) ─────────────────────── */

let watching = false;

/**
 * Arranca la escucha de "nueva versión disponible" del service worker y emite
 * `starseed:updates` cuando la detecta, para que la campanita se entere sin
 * recargar. Se engancha a las señales estándar del SW:
 *   · `controllerchange` (un SW nuevo tomó control),
 *   · `updatefound` + statechange "installed" con controlador previo,
 *   · mensajes del SW (por si register-sw/el SW emiten un postMessage propio).
 *
 * register-sw.tsx no expone hoy un callback propio, así que nos suscribimos
 * directamente a `navigator.serviceWorker` (no interfiere con su lógica). Si en
 * el futuro register-sw emite un evento/callback, se puede enlazar aquí también.
 * Idempotente, defensivo, SSR-safe. Devuelve una función para desuscribir.
 */
export function startUpdateWatch(): () => void {
  if (!isClient() || watching) return () => {};
  if (!("serviceWorker" in navigator)) return () => {};
  watching = true;

  const ping = () => emitUpdates();

  const onControllerChange = () => ping();
  const onMessage = (e: MessageEvent) => {
    // Aceptamos varias señales que un SW podría enviar como "hay versión nueva".
    const d = e?.data;
    const signal =
      d === "UPDATE_AVAILABLE" ||
      d === "NEW_VERSION" ||
      (d && typeof d === "object" && (d.type === "UPDATE_AVAILABLE" || d.type === "NEW_VERSION"));
    if (signal) ping();
  };

  try { navigator.serviceWorker.addEventListener("controllerchange", onControllerChange); } catch { /* */ }
  try { navigator.serviceWorker.addEventListener("message", onMessage); } catch { /* */ }

  // También comprobamos el registro por si aparece un SW en espera (updatefound).
  try {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      try {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) ping();
          });
        });
      } catch { /* */ }
    }).catch(() => { /* */ });
  } catch { /* */ }

  return () => {
    watching = false;
    try { navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange); } catch { /* */ }
    try { navigator.serviceWorker.removeEventListener("message", onMessage); } catch { /* */ }
  };
}

/**
 * Señal manual de "hay versión nueva": la puede llamar register-sw (o cualquier
 * parte del OS) cuando detecte una actualización, para forzar el aviso sin
 * esperar al service worker. Solo emite el evento; el aviso se recalcula solo.
 */
export function notifyUpdateAvailable(): void {
  emitUpdates();
}
