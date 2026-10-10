"use client";

/**
 * llaves-locales — las estaciones en vivo que ESTE aparato controla (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3.3).
 *
 * Guarda, solo en este aparato (`localStorage`, nunca en la cuenta: es una credencial y la regla
 * de identidad soberana dice que las credenciales no viajan solas), la llave privada de cada
 * sesión creada aquí, su token si es privada, el id de su fila en el directorio y si este medio es
 * el reloj de referencia. Para controlarla desde otro aparato se usa el «enlace de control», que
 * la persona copia a propósito.
 */

import { exportarPrivada, importarPrivada } from "./cripto-estacion";

const CLAVE = "starseed.estaciones.vivo.v1";

export interface RegistroSesion {
  /** Llave privada exportada (JWK en base64url). */
  control: string;
  token?: string;
  /** Id de la fila en `os_estaciones` (solo las públicas que se publicaron en el directorio). */
  fila?: string;
  /** Enlace de la sesión SIN la llave de control. */
  enlace: string;
  titulo: string;
  /** Este medio es el reloj de referencia (el que la creó). */
  referencia: boolean;
  creada: number;
}

function leerTodo(): Record<string, RegistroSesion> {
  try {
    const crudo = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE) : null;
    const o = crudo ? (JSON.parse(crudo) as unknown) : null;
    return o && typeof o === "object" ? (o as Record<string, RegistroSesion>) : {};
  } catch {
    return {};
  }
}

function escribirTodo(todo: Record<string, RegistroSesion>): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    /* sin almacenamiento: la sesión sigue viva mientras la pestaña esté abierta */
  }
}

export function misSesiones(): Record<string, RegistroSesion> {
  return leerTodo();
}

export function registroDe(id: string): RegistroSesion | null {
  return leerTodo()[id] ?? null;
}

export async function guardarSesion(id: string, llave: CryptoKey, datos: Omit<RegistroSesion, "control">): Promise<void> {
  const todo = leerTodo();
  todo[id] = { ...datos, control: await exportarPrivada(llave) };
  // Como mucho 40 sesiones: se olvidan las más viejas.
  const ids = Object.keys(todo).sort((a, b) => (todo[b].creada ?? 0) - (todo[a].creada ?? 0));
  for (const viejo of ids.slice(40)) delete todo[viejo];
  escribirTodo(todo);
}

export function anotarFila(id: string, fila: string): void {
  const todo = leerTodo();
  if (!todo[id]) return;
  todo[id] = { ...todo[id], fila };
  escribirTodo(todo);
}

export async function llaveDe(id: string): Promise<CryptoKey | null> {
  const r = registroDe(id);
  return r ? importarPrivada(r.control) : null;
}

/** Guarda el control llegado por un enlace de control (este medio NO es la referencia). */
export function guardarControlImportado(id: string, control: string, datos: { enlace: string; titulo: string; token?: string }): void {
  const todo = leerTodo();
  todo[id] = { ...todo[id], ...datos, control, referencia: todo[id]?.referencia ?? false, creada: todo[id]?.creada ?? Date.now() };
  escribirTodo(todo);
}

export function olvidarSesion(id: string): void {
  const todo = leerTodo();
  delete todo[id];
  escribirTodo(todo);
}
