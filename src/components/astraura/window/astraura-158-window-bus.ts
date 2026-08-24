/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Bus de la VENTANA UNIVERSAL de Astraura 1.58-bit (Ola 5 · Adenda 157)
 * ---------------------------------------------------------------------------
 * Módulo PURO: sin `"use client"`, sin JSX, sin hooks — solo tipos, constantes
 * y funciones. Así lo puede importar tanto código de cliente (orbe, Exocórtex,
 * las pestañas del Studio 1.58, la propia ventana) como el Server Component de
 * `/agent/astraura/[kind]/[id]` (que solo necesita la lista de `kind` válidos
 * para validar la ruta — un módulo `"use client"` no es seguro de importar ahí).
 *
 * SOP: `architecture/astraura-158-ola5-orquestacion.md` §1.
 *
 * Tres formas de abrir la MISMA ventana (`Astraura158Window`), todas descritas
 * en el SOP:
 *   1. superpuesta   → `openAstraura158Window({kind, id, tab?, target?})`
 *   2. página completa → `astraura158WindowHref(kind, id, tab?)`
 *   3. ventana del escritorio del OS → la reutiliza quien la monte (este bus
 *      no conoce el gestor de ventanas del escritorio).
 *
 * SSR-safe: toda función que toca `window` comprueba `typeof window ===
 * "undefined"` primero. Nunca lanza.
 */

/** Las 7 entidades vivas que tienen ventana propia (SOP §1). Única fuente de verdad del tipo. */
export const ASTRAURA_158_ENTITY_KINDS = [
  "proceso",
  "agente",
  "personalidad",
  "cerebro",
  "proyecto",
  "creacion",
  "rama",
] as const;

export type Astraura158EntityKind = (typeof ASTRAURA_158_ENTITY_KINDS)[number];

/** ¿Es `v` un `kind` válido de la ventana universal? (valida params de ruta / eventos externos). */
export function isAstraura158EntityKind(v: unknown): v is Astraura158EntityKind {
  return typeof v === "string" && (ASTRAURA_158_ENTITY_KINDS as readonly string[]).includes(v);
}

/** Pestañas internas de la ventana universal: Resumen · Ramas & Logs · Ajustes · Hablar en Vivo. */
export const ASTRAURA_158_WINDOW_TABS = ["resumen", "ramas", "ajustes", "vivo"] as const;

export type Astraura158WindowTab = (typeof ASTRAURA_158_WINDOW_TABS)[number];

/** ¿Es `v` una pestaña válida de la ventana universal? */
export function isAstraura158WindowTab(v: unknown): v is Astraura158WindowTab {
  return typeof v === "string" && (ASTRAURA_158_WINDOW_TABS as readonly string[]).includes(v);
}

/**
 * Destino del backend. Tipo-solo, importado del cliente de gestión (misma
 * unión que `Astraura158Target`): un `import type` se borra al compilar, así
 * que no crea ninguna dependencia real hacia ese módulo `"use client"` — sigue
 * siendo seguro importar este bus desde un Server Component.
 */
import type { Astraura158Target } from "@/lib/astraura/astraura-158-client";

/** Nombre del evento del bus (una sola constante, para que nadie lo escriba a mano dos veces distinto). */
export const ASTRAURA_158_WINDOW_OPEN_EVENT = "starseed:astraura158-open-window";

export interface Astraura158WindowDetail {
  kind: Astraura158EntityKind;
  id: string;
  /** Pestaña con la que abrir (por defecto "resumen"). */
  tab?: Astraura158WindowTab;
  /** Destino del backend (por defecto "local"). */
  target?: Astraura158Target;
}

/**
 * Despacha la apertura de la ventana universal para una entidad. Lo puede
 * llamar cualquier superficie del OS (orbe, Exocórtex, notificaciones,
 * pestañas del Studio 1.58) sin acoplarse al componente que la monta.
 * SSR-safe, nunca lanza.
 */
export function openAstraura158Window(detail: Astraura158WindowDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<Astraura158WindowDetail>(ASTRAURA_158_WINDOW_OPEN_EVENT, { detail }));
  } catch {
    /* defensivo */
  }
}

/**
 * Suscribe un callback a las aperturas de la ventana universal. Devuelve la
 * función de baja. SSR-safe (no-op en servidor).
 */
export function subscribeAstraura158Window(cb: (detail: Astraura158WindowDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onOpen = (e: Event) => {
    const d = (e as CustomEvent<Astraura158WindowDetail>).detail;
    if (d && isAstraura158EntityKind(d.kind) && typeof d.id === "string" && d.id) cb(d);
  };
  window.addEventListener(ASTRAURA_158_WINDOW_OPEN_EVENT, onOpen);
  return () => window.removeEventListener(ASTRAURA_158_WINDOW_OPEN_EVENT, onOpen);
}

/**
 * URL de la página completa de una entidad — enlazable y compartible.
 * `/agent/astraura/<kind>/<id>?tab=<tab>` (sin `tab` si no se pide uno).
 */
export function astraura158WindowHref(kind: Astraura158EntityKind, id: string, tab?: Astraura158WindowTab): string {
  const base = `/agent/astraura/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}
