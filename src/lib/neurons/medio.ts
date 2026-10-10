"use client";

/*
 * medio — DESDE DÓNDE se está usando una neurona (2026-10-09 · «una neurona por dispositivo»).
 * ════════════════════════════════════════════════════════════════════════════════════════
 * Una neurona es un APARATO. Un MEDIO es cada forma de abrir StarSeed OS en ese aparato:
 * Chrome en Vercel, Chrome en localhost:9002, la app instalada (PWA), la app nativa (Tauri),
 * el navegador integrado de Claude… Cada medio guarda su propio almacenamiento, así que aquí
 * vive su id PROPIO (`starseed.medio.id.v1`, nunca se sincroniza: es de este origen) y su
 * descripción legible. La neurona guarda la lista de sus medios en `capabilities.medios` y la
 * presencia en vivo dice cuáles están abiertos ahora.
 *
 * Nunca lanza; en el servidor devuelve un medio vacío.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

/** Clave del id de ESTE medio. Fuera de SYNCED_KEYS a propósito: cada origen tiene el suyo. */
export const CLAVE_MEDIO = "starseed.medio.id.v1";

export type TipoMedio = "app-nativa" | "app-instalada" | "local" | "navegador-claude" | "navegador";

/** Lo que una neurona recuerda de cada uno de sus medios (en `capabilities.medios[id]`). */
export interface RegistroMedio {
  tipo: TipoMedio;
  /** «Chrome 154 · localhost:9002», «App nativa StarSeed OS», «Safari 18 · app instalada»… */
  etiqueta: string;
  navegador?: string;
  /** Host del origen (sin ruta ni consulta). */
  origen?: string;
  /** Última vez que este medio subió la ficha (ISO). */
  visto: string;
}

export interface DescripcionMedio extends Omit<RegistroMedio, "visto"> {
  id: string;
}

function nuevoId(): string {
  try {
    return `m-${crypto.randomUUID()}`;
  } catch {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Id de ESTE medio (lo crea la primera vez). Vacío en el servidor. */
export function idMedio(): string {
  if (typeof window === "undefined") return "";
  try {
    const actual = safeGet(CLAVE_MEDIO);
    if (actual && actual.trim()) return actual;
    const id = nuevoId();
    safeSet(CLAVE_MEDIO, id);
    return id;
  } catch {
    return "";
  }
}

/** «Chrome 154», «Safari 18», «Edge 131», «Firefox 140»… a partir del userAgent. */
export function navegadorDe(ua: string): string {
  const edge = ua.match(/Edg\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;
  const ff = ua.match(/(?:Firefox|FxiOS)\/(\d+)/);
  if (ff) return `Firefox ${ff[1]}`;
  const crios = ua.match(/CriOS\/(\d+)/);
  if (crios) return `Chrome ${crios[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const safari = ua.match(/Version\/(\d+)(?:\.\d+)*.*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  if (/AppleWebKit/.test(ua)) return "WebKit";
  return "";
}

export interface EntornoMedio {
  ua: string;
  host: string;
  tauri: boolean;
  standalone: boolean;
}

/** Clasifica el medio (puro, para poder probarlo). */
export function clasificarMedio(e: EntornoMedio): Omit<DescripcionMedio, "id"> {
  const nav = navegadorDe(e.ua);
  const host = e.host;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (e.tauri) return { tipo: "app-nativa", etiqueta: "App nativa StarSeed OS", navegador: nav || undefined, origen: host || undefined };
  if (/Electron\//.test(e.ua) && /Claude/i.test(e.ua)) {
    return { tipo: "navegador-claude", etiqueta: `Navegador de Claude${local ? ` · ${host}` : ""}`, navegador: nav || undefined, origen: host || undefined };
  }
  if (/Electron\//.test(e.ua)) return { tipo: "navegador-claude", etiqueta: `Navegador integrado${host ? ` · ${host}` : ""}`, navegador: nav || undefined, origen: host || undefined };
  if (e.standalone) return { tipo: "app-instalada", etiqueta: `${nav || "Navegador"} · app instalada`, navegador: nav || undefined, origen: host || undefined };
  if (local) return { tipo: "local", etiqueta: `${nav || "Navegador"} · ${host}`, navegador: nav || undefined, origen: host };
  return { tipo: "navegador", etiqueta: `${nav || "Navegador"}${host ? ` · ${host}` : ""}`, navegador: nav || undefined, origen: host || undefined };
}

/** Descripción de ESTE medio. */
export function describirMedio(): DescripcionMedio {
  if (typeof window === "undefined") return { id: "", tipo: "navegador", etiqueta: "" };
  let standalone = false;
  try {
    standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    /* */
  }
  const w = window as unknown as Record<string, unknown>;
  const base = clasificarMedio({
    ua: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
    host: window.location?.host ?? "",
    tauri: "__TAURI__" in w || "__TAURI_INTERNALS__" in w,
    standalone,
  });
  return { id: idMedio(), ...base };
}

/** Máximo de medios que se recuerdan por neurona (los más recientes). */
export const MAX_MEDIOS = 12;
/** Un medio que no se ve en 60 días se olvida de la ficha. */
export const OLVIDO_MEDIO_MS = 60 * 86_400_000;

/**
 * Fusiona la lista de medios de una neurona: lo remoto (otros medios) + este medio al día.
 * Puro. Olvida los medios de más de 60 días y se queda con los `MAX_MEDIOS` más recientes.
 */
export function fusionarMedios(
  remotos: Record<string, RegistroMedio> | null | undefined,
  propios: Record<string, RegistroMedio>,
  ahora: number = Date.now(),
): Record<string, RegistroMedio> {
  const todos: Record<string, RegistroMedio> = {};
  for (const fuente of [remotos ?? {}, propios]) {
    for (const [id, r] of Object.entries(fuente)) {
      if (!id || !r || typeof r !== "object" || typeof r.visto !== "string") continue;
      const previo = todos[id];
      if (!previo || Date.parse(r.visto) >= Date.parse(previo.visto)) todos[id] = r;
    }
  }
  return Object.fromEntries(
    Object.entries(todos)
      .filter(([, r]) => {
        const t = Date.parse(r.visto);
        return Number.isFinite(t) && ahora - t < OLVIDO_MEDIO_MS;
      })
      .sort((a, b) => Date.parse(b[1].visto) - Date.parse(a[1].visto))
      .slice(0, MAX_MEDIOS),
  );
}
