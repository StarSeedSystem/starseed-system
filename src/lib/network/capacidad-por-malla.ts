"use client";

/*
 * capacidad-por-malla — Relay P2P de capacidades (Ola 1017A).
 * Generaliza `ia-por-malla.ts` a `capacidad.*` con tipos: imagen | voz | oido |
 * palabra | transcodificar | render | buscar | construir.
 * Cliente `pedirCapacidad` nunca lanza: {ok:false, motivo}. En el lado que
 * sirve, `atenderPeticionVozMalla` aplica las reglas de `voz-por-malla.ts`.
 */

import {
  CONTEXTOS_VOZ_MALLA,
  esContextoVozMalla,
  licenciaAdmitida,
  elegirMotorVoz,
  motivoAccesoVoz,
  motivoPermisoVoz,
  manejarVozHablar,
  manejarOidoTranscribir,
  type PeticionVozMalla,
  type ResultadoVozMalla,
} from "@/lib/network/voz-por-malla";

export const CAPACIDAD_MALLA_NS = "capacidad.";
export const CAPACIDAD_MALLA_MAX_BYTES = 16 * 1024;
const MARGEN = 256;

export type TipoCapacidad =
  | "imagen" | "voz" | "oido" | "palabra"
  | "transcodificar" | "render" | "buscar" | "construir";

export interface MsgPedir { t: "capacidad.pedir"; id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; }
export interface MsgTrozo { t: "capacidad.trozo"; id: string; texto: string; }
export interface MsgFin { t: "capacidad.fin"; id: string; resultado: unknown; }
export interface MsgError { t: "capacidad.error"; id: string; estado: number; mensaje: string; }
export interface MsgCancelar { t: "capacidad.cancelar"; id: string; }

export type Msg = MsgPedir | MsgTrozo | MsgFin | MsgError | MsgCancelar;

export function esMensajeCapacidadMalla(x: unknown): x is Msg {
  if (!esObjeto(x)) return false;
  if (typeof x.t !== "string" || !x.t.startsWith(CAPACIDAD_MALLA_NS) || typeof x.id !== "string") return false;
  switch (x.t) {
    case "capacidad.pedir": return typeof x.tipo === "string" && esObjeto(x.cuerpo);
    case "capacidad.trozo": return typeof x.texto === "string";
    case "capacidad.fin": return typeof x.resultado !== "undefined";
    case "capacidad.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar": return true;
    default: return false;
  }
}

export function parseCapacidadMallaMensaje(raw: string): Msg | null {
  try { return esMensajeCapacidadMalla(JSON.parse(raw)) ? JSON.parse(raw) : null; } catch { return null; }
}

export function esTipoCapacidadValido(tipo: string): tipo is TipoCapacidad {
  return ["imagen","voz","oido","palabra","transcodificar","render","buscar","construir"].includes(tipo);
}

/** Petición de `voz.hablar` o `oido.transcribir` con su forma pura. */
export type PeticionCapacidadVoz = PeticionVozMalla & { tipo: "voz" | "oido" };

/**
 * Lado que SIRVE del relé para voz y oído: valida contexto, cuenta o grupo,
 * permiso sobre la voz/audio y licencia del motor antes de sintetizar o
 * transcribir. Puro: identidad, permisos, motores y reloj vienen en la petición.
 */
export function atenderPeticionVozMalla(peticion: PeticionCapacidadVoz): ResultadoVozMalla {
  if (!esContextoVozMalla(peticion.contexto)) {
    return { ok: false, motivo: `Contexto no válido: ${CONTEXTOS_VOZ_MALLA.join(", ")}.` };
  }
  const acceso = motivoAccesoVoz(peticion);
  if (acceso) return { ok: false, motivo: acceso };
  const sujeto = peticion.tipo === "voz"
    ? peticion.titularVoz ?? peticion.solicitante
    : peticion.audioDe ?? peticion.solicitante;
  const permiso = motivoPermisoVoz(peticion, sujeto);
  if (permiso) return { ok: false, motivo: permiso };
  const motor = elegirMotorVoz(peticion.motores ?? [], peticion.contexto);
  if (!motor) {
    return { ok: false, motivo: `No hay motor con licencia admitida para «${peticion.contexto}».` };
  }
  if (!licenciaAdmitida(motor.claseLicencia, peticion.contexto, motor.condicionCumplida === true)) {
    return { ok: false, motivo: `El motor «${motor.id}» no tiene licencia admitida para «${peticion.contexto}».` };
  }
  return peticion.tipo === "voz" ? manejarVozHablar(peticion) : manejarOidoTranscribir(peticion);
}

export function bytesUtf8(s: string): number { return new TextEncoder().encode(s).length; }
export function cabeEnMensajeCapacidad(json: string): boolean { return bytesUtf8(json) <= CAPACIDAD_MALLA_MAX_BYTES; }

export function partirEnTrozos(texto: string, maxBytesTexto = CAPACIDAD_MALLA_MAX_BYTES - MARGEN): string[] {
  if (!texto) return [];
  const partes: string[] = []; let actual = "";
  for (const ch of texto) {
    if (actual && bytesUtf8(actual + ch) > maxBytesTexto) { partes.push(actual); actual = ch; }
    else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}

export function crearIdPeticion(): string {
  try { return crypto.randomUUID(); } catch { return `am-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`; }
}

export interface ResultadoCapacidad { ok: boolean; resultado?: unknown; motivo?: string; }

export function pedirCapacidad(
  enviar: (msg: string) => boolean,
  { tipo, cuerpo, sesionId, timeoutMs = 200_000 }: { tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; timeoutMs?: number },
): Promise<ResultadoCapacidad> {
  const id = crearIdPeticion();
  try { enviar(JSON.stringify({ t: "capacidad.pedir", id, tipo, cuerpo, sesionId })); }
  catch { return Promise.resolve({ ok: false, motivo: "Error al enviar." }); }

  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, motivo: "Capacidad por la malla: timeout total." }), timeoutMs);
    (pedirCapacidad as any).listener = (data: string) => {
      const msg = parseCapacidadMallaMensaje(data);
      if (!msg || msg.id !== id) return;
      clearTimeout(timer);
      if (msg.t === "capacidad.fin") resolve({ ok: true, resultado: msg.resultado });
      else if (msg.t === "capacidad.error") resolve({ ok: false, motivo: msg.mensaje });
    };
  });
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
