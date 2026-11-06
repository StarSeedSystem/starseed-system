// Traspaso privado Biblioteca → compositor /publish.
// El objeto del ítem NO viaja en la URL (historial, logs del servidor ni
// cabeceras): se guarda una sola vez en sessionStorage y la URL solo lleva el
// aviso `attach=1`. Mismo patrón que /crear en sharing/share-targets.ts.
// Módulo puro + ayudantes SSR-safe: nunca lanza.

export interface PublishHandoffRef {
  title: string;
  url?: string;
  route?: string;
  note?: string;
}

export const PUBLISH_HANDOFF_KEY = "starseed.library.publish.v1";
export const PUBLISH_HANDOFF_FLAG = "1";

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normaliza y valida la referencia: exige al menos url o route. */
export function normalizarRefPublish(input: unknown): PublishHandoffRef | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const title = texto(raw.title);
  const url = texto(raw.url);
  const route = texto(raw.route);
  const note = texto(raw.note);
  if (!url && !route) return null;
  return {
    title: title || url || route,
    ...(url ? { url } : {}),
    ...(route ? { route } : {}),
    ...(note ? { note } : {}),
  };
}

/** Serializa la referencia ya normalizada (JSON compacto). */
export function serializarRefPublish(ref: PublishHandoffRef): string {
  return JSON.stringify(ref);
}

/** Lee JSON y devuelve la referencia válida, o null si no lo es. */
export function parsearRefPublish(raw: string | null | undefined): PublishHandoffRef | null {
  if (!raw) return null;
  try {
    return normalizarRefPublish(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Deja la referencia preparada en la pestaña y devuelve la ruta del compositor. */
export function guardarRefPublish(input: unknown): string {
  const ref = normalizarRefPublish(input);
  try {
    if (ref && typeof window !== "undefined" && "sessionStorage" in window) {
      window.sessionStorage.setItem(PUBLISH_HANDOFF_KEY, serializarRefPublish(ref));
    }
  } catch {
    /* cuota o modo privado: el compositor abre sin adjunto */
  }
  return `/publish?attach=${PUBLISH_HANDOFF_FLAG}`;
}

/** Lee (y limpia) la referencia pendiente. Sin nada devuelve null. */
export function tomarRefPublish(limpiar = true): PublishHandoffRef | null {
  try {
    if (typeof window === "undefined" || !("sessionStorage" in window)) return null;
    const raw = window.sessionStorage.getItem(PUBLISH_HANDOFF_KEY);
    if (!raw) return null;
    if (limpiar) window.sessionStorage.removeItem(PUBLISH_HANDOFF_KEY);
    return parsearRefPublish(raw);
  } catch {
    return null;
  }
}
