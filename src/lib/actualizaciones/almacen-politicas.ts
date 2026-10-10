/**
 * Dónde se guarda la política de actualización de cada sistema (perfil, página, grupo, el OS…).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Clave `starseed.actualizaciones.politicas.v1` en localStorage: el motor de sincronización de
 * cuenta (`realtime-sync`) sube los ajustes `starseed.*` a la cuenta, así que llega a las demás
 * neuronas. Cuando se aplique la migración `os_politicas_actualizacion`, las de una ENTIDAD (que
 * comparten sus miembros) irán además a la base de datos (tarea abierta en la SOP).
 *
 * También guarda qué neurona es la canaria/«esta neurona» elegida por la persona.
 * SSR-safe y sin `node:*`. Nunca lanza.
 */

import { politicaPorDefecto, sanearPolitica, type PoliticaSistema, type TipoEntidad } from "./politica";

export const CLAVE_POLITICAS = "starseed.actualizaciones.politicas.v1";
export const CLAVE_NEURONA_ELEGIDA = "starseed.actualizaciones.neurona-elegida.v1";
export const EVENTO_POLITICAS = "starseed:actualizaciones-politicas";

/** Id estable de un sistema: «os», «perfil:<uid>», «pagina:<slug>», «grupo:<slug>»… */
export function idSistema(tipo: TipoEntidad, id?: string | null): string {
  return tipo === "os" ? "os" : `${tipo}:${String(id ?? "").trim() || "?"}`;
}

interface Guardada {
  tipo: TipoEntidad;
  politica: PoliticaSistema;
  actualizadaEn: string;
}

function leerTodo(): Record<string, Guardada> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(CLAVE_POLITICAS);
    const p = raw ? (JSON.parse(raw) as unknown) : null;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, Guardada>) : {};
  } catch {
    return {};
  }
}

/** La política de un sistema; sin nada guardado, la de su tipo por defecto. */
export function leerPoliticaSistema(sistemaId: string, tipo: TipoEntidad): PoliticaSistema {
  const g = leerTodo()[sistemaId];
  return g ? sanearPolitica(g.politica) : politicaPorDefecto(tipo);
}

/** ¿La persona ya eligió una política para este sistema (o es la de fábrica)? */
export function tienePoliticaPropia(sistemaId: string): boolean {
  return !!leerTodo()[sistemaId];
}

export function guardarPoliticaSistema(sistemaId: string, tipo: TipoEntidad, politica: PoliticaSistema): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const todo = leerTodo();
    todo[sistemaId] = { tipo, politica: sanearPolitica(politica), actualizadaEn: new Date().toISOString() };
    localStorage.setItem(CLAVE_POLITICAS, JSON.stringify(todo));
    try {
      window.dispatchEvent(new CustomEvent(EVENTO_POLITICAS, { detail: { sistemaId } }));
    } catch {
      /* sin window */
    }
    return true;
  } catch {
    return false;
  }
}

export function leerNeuronaElegida(): string | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(CLAVE_NEURONA_ELEGIDA) : null;
    return v && /^[\w:.-]{1,120}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function guardarNeuronaElegida(id: string | null): void {
  try {
    if (id) localStorage.setItem(CLAVE_NEURONA_ELEGIDA, id);
    else localStorage.removeItem(CLAVE_NEURONA_ELEGIDA);
  } catch {
    /* modo privado */
  }
}
