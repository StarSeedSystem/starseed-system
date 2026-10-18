"use client";

/**
 * Bots/dots de Astraura · Cliente de la COMPUTADORA del bot (BOT1011K). Contrato: architecture/astraura-bots.md §7.
 *
 * Habla con `/api/bots/computadora/{estado,encender,apagar,ejecutar}`; esa ruta del servidor la trae BOT1011L.
 * Mientras no exista o responda 404, todo devuelve el «próximamente» honesto: nada se finge encendido ni ejecutado.
 * Nunca envía claves: sin cabecera de autorización (solo la cookie de sesión del mismo origen) y una orden con forma
 * de clave o de ruta del disco no sale del navegador. `ejecutar` falla cerrada: sin los permisos del bot, la terminal
 * se da por apagada (`PERMISOS_COMPUTADORA_DEFECTO`) y la orden no se envía.
 * PRECONDICIÓN de `ejecutar`: la acción `computadora.ejecutar` ya pasó por `validarAccion` + `decidirAccion` y por el
 * bucle (`avanzar` de `bucle.ts`) en fase `actuando`; aquí no se vuelve a decidir el permiso del bot, solo el de la orden.
 */
import { tieneSecreto } from "../acciones";
import {
  PERMISOS_COMPUTADORA_DEFECTO, esMedioComputadora, normalizarPermisos, permisoParaOrden,
  type MedioComputadora, type PermisosComputadora,
} from "../computadora";

export const RUTA_COMPUTADORA = "/api/bots/computadora";
export const MOTIVO_SIN_COMPUTADORA = "próximamente: falta la computadora del bot (BOT1011L, visto bueno de Alex)";
export const MAX_SALIDA = 20_000;

export type ResultadoComputadora<T> = { ok: true; datos: T } | { ok: false; motivo: string };
export interface EstadoComputadora { encendida: boolean; medio: MedioComputadora | null; permisos: PermisosComputadora }
export interface SalidaOrden { salida: string; codigo: number | null }
export type FetchComputadora = (url: string, init: RequestInit) => Promise<Response>;
export interface OpcionesComputadora {
  /** Inyectable en pruebas; por defecto el `fetch` del navegador. */
  fetch?: FetchComputadora;
  /** Permisos vigentes de la computadora del bot (los de `estadoComputadora`). Sin ellos, todo apagado. */
  permisos?: PermisosComputadora;
}

type Objeto = Record<string, unknown>;
const ID_BOT = /^[A-Za-z0-9_.:-]{1,80}$/;
const fallo = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo: motivo.slice(0, 500) });
const esObjeto = (x: unknown): x is Objeto => typeof x === "object" && x !== null && !Array.isArray(x);

/** Una llamada a la ruta del servidor: 404 = la computadora todavía no existe. Nunca lanza. */
async function llamar(tramo: string, cuerpo: Objeto | null, op: OpcionesComputadora): Promise<ResultadoComputadora<Objeto>> {
  const f: FetchComputadora | null = op.fetch ?? (typeof fetch === "function" ? (u, i) => fetch(u, i) : null);
  if (!f) return fallo("No hay conexión con el servidor del OS en este contexto.");
  const init: RequestInit = cuerpo
    ? { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }
    : { method: "GET", credentials: "same-origin" };
  let res: Response;
  try {
    res = await f(`${RUTA_COMPUTADORA}/${tramo}`, init);
  } catch {
    return fallo("No pude hablar con el servidor del OS (sin conexión).");
  }
  if (res.status === 404) return fallo(MOTIVO_SIN_COMPUTADORA);
  let json: unknown = null;
  try { json = await res.json(); } catch { json = null; }
  const motivo = esObjeto(json) && typeof json.motivo === "string" ? json.motivo : null;
  if (!res.ok) return fallo(motivo ?? `La computadora del bot respondió con un error (${res.status}).`);
  if (!esObjeto(json)) return fallo("La computadora del bot dio una respuesta que no entiendo.");
  if (json.ok === false) return fallo(motivo ?? "La computadora del bot no lo hizo.");
  return { ok: true, datos: json };
}

/** Lo que diga el servidor se lee con desconfianza: un medio desconocido es `null` y los permisos, apagados. */
function aEstado(o: Objeto): EstadoComputadora {
  return { encendida: o.encendida === true, medio: esMedioComputadora(o.medio) ? o.medio : null, permisos: normalizarPermisos(o.permisos) };
}

async function conEstado(tramo: string, botId: string, op: OpcionesComputadora): Promise<ResultadoComputadora<EstadoComputadora>> {
  if (!ID_BOT.test(botId)) return fallo("Ese identificador de bot no es válido.");
  const r = tramo === "estado"
    ? await llamar(`estado?botId=${encodeURIComponent(botId)}`, null, op)
    : await llamar(tramo, { botId }, op);
  return r.ok ? { ok: true, datos: aEstado(r.datos) } : r;
}

/** Estado de la computadora del bot (encendida, medio y permisos). */
export function estadoComputadora(botId: string, op: OpcionesComputadora = {}) {
  return conEstado("estado", botId, op);
}

/** Pide encender la computadora del bot; el servidor elige el medio (`elegirComputadora`). */
export function encender(botId: string, op: OpcionesComputadora = {}) {
  return conEstado("encender", botId, op);
}

/** Pide apagar la computadora del bot. */
export function apagar(botId: string, op: OpcionesComputadora = {}) {
  return conEstado("apagar", botId, op);
}

/** Ejecuta UNA orden en la computadora aislada del bot (nunca en el aparato de la persona). */
export async function ejecutar(botId: string, orden: string, op: OpcionesComputadora = {}): Promise<ResultadoComputadora<SalidaOrden>> {
  if (!ID_BOT.test(botId)) return fallo("Ese identificador de bot no es válido.");
  if (tieneSecreto(orden)) return fallo("La orden lleva algo con forma de clave o de ruta del disco: no sale de tu aparato.");
  const decision = permisoParaOrden(op.permisos ?? PERMISOS_COMPUTADORA_DEFECTO, orden);
  if (!decision.permitido) return fallo(decision.motivo);
  const r = await llamar("ejecutar", { botId, orden }, op);
  if (!r.ok) return r;
  const { salida, codigo } = r.datos;
  return {
    ok: true,
    datos: {
      salida: typeof salida === "string" ? salida.slice(0, MAX_SALIDA) : "",
      codigo: typeof codigo === "number" && Number.isInteger(codigo) ? codigo : null,
    },
  };
}
