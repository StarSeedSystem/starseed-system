/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Reglas de correo como DATOS (Ola 1025R · tarea I)
 * ------------------------------------------------------------
 * Patrón de producto inspirado en el README público de Inbox Zero, reescrito
 * desde cero (AGPL con términos adicionales: no se copia código ni texto).
 * Una regla de correo NO es código: es un dato {cuando, hacer} que cualquier
 * módulo puede validar y aplicar. De lenguaje natural a regla lo traducirá
 * Astraura en otra tarea; aquí solo se valida su salida.
 *
 * R2 del contrato 1025: la lista de acciones es CERRADA y ninguna de sus
 * acciones envía, responde sola, borra ni reenvía. Solo proponen.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { HiloLite } from "./seguimiento-respuestas";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export const ACCIONES_REGLA = [
  "etiquetar",
  "mover",
  "destacar",
  "esperar-respuesta",
  "sugerir-borrador",
] as const;

export type AccionRegla = (typeof ACCIONES_REGLA)[number];

export interface CondicionesRegla {
  de?: string;
  dominio?: string;
  asuntoContiene?: string;
  tieneAdjunto?: boolean;
  etiqueta?: string;
  antiguedadHorasMin?: number;
}

export interface ReglaCorreo {
  id: string;
  texto: string;
  cuando: CondicionesRegla;
  hacer: AccionRegla;
  parametro?: string;
}

export interface PropuestaRegla {
  reglaId: string;
  hacer: AccionRegla;
  parametro?: string;
}

/* ────────────────────────────── Helpers ────────────────────────────────── */

/** Dominio de una dirección (`a@b.c` → `b.c`), en minúsculas; "" si no hay @. */
export function dominioDe(direccion: string): string {
  const i = direccion.lastIndexOf("@");
  return i < 0 ? "" : direccion.slice(i + 1).trim().toLowerCase();
}

const LARGO_TEXTO = 280;
const LARGO_CADENA = 120;
const CLAVES_REGLA = new Set(["id", "texto", "cuando", "hacer", "parametro"]);
const CLAVES_CUANDO = new Set([
  "de",
  "dominio",
  "asuntoContiene",
  "tieneAdjunto",
  "etiqueta",
  "antiguedadHorasMin",
]);

function esTextoValido(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function condicionValida(cuando: unknown): cuando is CondicionesRegla {
  if (!cuando || typeof cuando !== "object" || Array.isArray(cuando)) return false;
  const claves = Object.keys(cuando);
  if (claves.length === 0) return false; // sin condición dispararía contra todo el correo
  if (claves.some((k) => !CLAVES_CUANDO.has(k))) return false;
  const c = cuando as Record<string, unknown>;
  if (c.de !== undefined && !esTextoValido(c.de, LARGO_CADENA)) return false;
  if (c.dominio !== undefined && !esTextoValido(c.dominio, LARGO_CADENA)) return false;
  if (c.asuntoContiene !== undefined && !esTextoValido(c.asuntoContiene, LARGO_CADENA)) return false;
  if (c.etiqueta !== undefined && !esTextoValido(c.etiqueta, LARGO_CADENA)) return false;
  if (c.tieneAdjunto !== undefined && typeof c.tieneAdjunto !== "boolean") return false;
  if (
    c.antiguedadHorasMin !== undefined &&
    (typeof c.antiguedadHorasMin !== "number" ||
      !Number.isFinite(c.antiguedadHorasMin) ||
      c.antiguedadHorasMin < 0)
  )
    return false;
  return true;
}

export function validarRegla(x: unknown): ReglaCorreo | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const claves = Object.keys(x as Record<string, unknown>);
  if (claves.some((k) => !CLAVES_REGLA.has(k))) return null;
  const r = x as Record<string, unknown>;
  if (!esTextoValido(r.id, LARGO_CADENA)) return null;
  if (!esTextoValido(r.texto, LARGO_TEXTO)) return null;
  if (typeof r.hacer !== "string") return null;
  if (!(ACCIONES_REGLA as readonly string[]).includes(r.hacer)) return null;
  if (r.parametro !== undefined && !esTextoValido(r.parametro, LARGO_CADENA)) return null;
  if (!condicionValida(r.cuando)) return null;
  return {
    id: (r.id as string).trim(),
    texto: (r.texto as string).trim(),
    cuando: r.cuando as CondicionesRegla,
    hacer: r.hacer as AccionRegla,
    ...(r.parametro !== undefined ? { parametro: (r.parametro as string).trim() } : {}),
  };
}

/** ¿La condición `cuando` se cumple para este hilo? (todas las condiciones presentes deben cumplirse) */
export function cumpleRegla(cuando: CondicionesRegla, hilo: HiloLite): boolean {
  if (cuando.de !== undefined && hilo.ultimoDe.trim().toLowerCase() !== cuando.de.trim().toLowerCase())
    return false;
  if (cuando.dominio !== undefined && dominioDe(hilo.ultimoDe) !== cuando.dominio.trim().toLowerCase())
    return false;
  if (
    cuando.asuntoContiene !== undefined &&
    !hilo.asunto.toLowerCase().includes(cuando.asuntoContiene.toLowerCase())
  )
    return false;
  if (cuando.tieneAdjunto !== undefined && hilo.tieneAdjunto !== cuando.tieneAdjunto) return false;
  if (
    cuando.etiqueta !== undefined &&
    !hilo.etiquetas.some((e) => e.toLowerCase() === cuando.etiqueta!.trim().toLowerCase())
  )
    return false;
  if (cuando.antiguedadHorasMin !== undefined) {
    const horas = (Date.now() - new Date(hilo.ultimoEn).getTime()) / 3_600_000;
    if (!Number.isFinite(horas) || horas < cuando.antiguedadHorasMin) return false;
  }
  return true;
}

/** Aplica las reglas a un hilo: acciones propuestas, en orden y sin repetir. */
export function aplicarReglas(reglas: ReglaCorreo[], hilo: HiloLite): PropuestaRegla[] {
  const propuestas: PropuestaRegla[] = [];
  const vistas = new Set<string>();
  for (const regla of reglas) {
    if (!cumpleRegla(regla.cuando, hilo)) continue;
    const clave = `${regla.hacer}\u0000${regla.parametro ?? ""}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    propuestas.push({
      reglaId: regla.id,
      hacer: regla.hacer,
      ...(regla.parametro !== undefined ? { parametro: regla.parametro } : {}),
    });
  }
  return propuestas;
}
