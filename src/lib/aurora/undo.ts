"use client";

/**
 * StarSeed OS — Aurora · Revertir cambios ("Aurora siempre responde", jul-2026)
 * ----------------------------------------------------------------------------
 * Descriptor DE DATOS (serializable, sin funciones) para que una acción/tool de
 * Aurora declare que es reversible, y un ejecutor genérico que la deshace a
 * petición del usuario (menú contextual de un mensaje → "Revertir cambios").
 * Solo cubre los casos donde deshacer es seguro e inequívoco (widget añadido,
 * ajuste cambiado, ítem guardado en la Biblioteca); el resto de acciones
 * (navegar, conversar, lanzar un agente/skill…) NO son reversibles y así se
 * dice con honestidad en vez de fingir un undo.
 *
 * Aditivo y defensivo: nada aquí se ejecuta sola; solo se dispara cuando el
 * usuario pulsa "Revertir cambios" sobre un mensaje concreto. Mismo formato de
 * almacenamiento que `src/lib/aurora/actions.ts` (dashboards/widgets) y
 * `src/lib/library-store.ts` (recursos guardados) — no introduce un store nuevo.
 * Ver architecture/astraura-inteligencia.md §17.4.
 */

/** Un cambio reversible que una acción/tool puede declarar en su resultado. */
export type AuroraUndoInfo =
  | { kind: "widget"; dashboardId: string; widgetId: string; label: string }
  | { kind: "setting"; key: string; previousValue: unknown; label: string }
  | { kind: "library-item"; id: string; label: string };

function isClient(): boolean {
  return typeof window !== "undefined";
}

const LS_WIDGETS = "starseed_widgets";
const LS_AURORA_SETTINGS = "starseed_settings";
const DASH_CHANNEL = "starseed-dashboard";

function lsRead<T>(key: string, dflt: T): T {
  if (!isClient()) return dflt;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : dflt;
  } catch {
    return dflt;
  }
}

function broadcastDashboard(): void {
  if (!isClient() || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(DASH_CHANNEL);
    ch.postMessage({ type: "data:changed", scope: "widgets", at: Date.now() });
    ch.close();
  } catch {
    /* noop */
  }
}

/** Quita un widget concreto (por id) de un dashboard concreto. */
function undoWidget(dashboardId: string, widgetId: string): { ok: boolean; message: string } {
  if (!isClient()) return { ok: false, message: "Solo se puede revertir desde el navegador." };
  try {
    const all = lsRead<Record<string, Array<{ id: string }>>>(LS_WIDGETS, {});
    const list = Array.isArray(all[dashboardId]) ? all[dashboardId] : [];
    const next = list.filter((w) => w?.id !== widgetId);
    if (next.length === list.length) {
      return { ok: false, message: "Ese widget ya no está en el tablero (puede que lo hayas quitado tú)." };
    }
    all[dashboardId] = next;
    localStorage.setItem(LS_WIDGETS, JSON.stringify(all));
    broadcastDashboard();
    return { ok: true, message: "Quité el widget que había añadido." };
  } catch {
    return { ok: false, message: "No pude quitar el widget." };
  }
}

/** Restaura el valor previo de un ajuste (o lo borra si antes no existía). */
function undoSetting(key: string, previousValue: unknown): { ok: boolean; message: string } {
  if (!isClient()) return { ok: false, message: "Solo se puede revertir desde el navegador." };
  try {
    let bag: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(LS_AURORA_SETTINGS);
      if (raw) bag = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      bag = {};
    }
    if (previousValue === undefined) delete bag[key];
    else bag[key] = previousValue;
    localStorage.setItem(LS_AURORA_SETTINGS, JSON.stringify(bag));
    try {
      window.dispatchEvent(new CustomEvent("starseed:setting-changed", { detail: { key, value: previousValue, at: Date.now() } }));
    } catch {
      /* noop */
    }
    return { ok: true, message: `Devolví «${key}» a su valor anterior.` };
  } catch {
    return { ok: false, message: "No pude restaurar el ajuste." };
  }
}

/** Quita un ítem guardado en la Biblioteca por id (mismo store que `library-store.ts`). */
async function undoLibraryItem(id: string): Promise<{ ok: boolean; message: string }> {
  if (!isClient()) return { ok: false, message: "Solo se puede revertir desde el navegador." };
  try {
    const mod = await import("@/lib/library-store");
    mod.removeSaved(id);
    return { ok: true, message: "Quité lo que había guardado en tu Biblioteca." };
  } catch {
    return { ok: false, message: "No pude quitarlo de la Biblioteca." };
  }
}

/** Ejecuta un `AuroraUndoInfo`. NUNCA lanza: devuelve un resultado honesto. */
export async function executeUndo(undo: AuroraUndoInfo): Promise<{ ok: boolean; message: string }> {
  try {
    switch (undo.kind) {
      case "widget":
        return undoWidget(undo.dashboardId, undo.widgetId);
      case "setting":
        return undoSetting(undo.key, undo.previousValue);
      case "library-item":
        return await undoLibraryItem(undo.id);
      default:
        return { ok: false, message: "No sé revertir este tipo de cambio." };
    }
  } catch {
    return { ok: false, message: "No pude revertir este cambio." };
  }
}

export default executeUndo;
