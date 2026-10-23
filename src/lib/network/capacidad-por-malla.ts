"use client";

import type { MeshHandle } from "@/lib/network/webrtc-mesh";

/*
 * capacidad-por-malla — Relay P2P genérico de cualquier capacidad sobre la malla (Ola 1017A).
 * Generaliza `ia-por-malla.ts` a protocolo `capacidad.*` con tipos: imagen | voz | oido |
 * palabra | transcodificar | render | buscar | construir.
 * Mensajes: pedir, trozo, fin, error, cancelar. Topes iguales a `ia-por-malla`.
 */

export const CAPACIDAD_MALLA_NS = "capacidad.";
export const CAPACIDAD_MALLA_MAX_BYTES = 16 * 1024;
const TROZO_MARGEN_BYTES = 256;

export type TipoCapacidad =
  | "imagen" | "voz" | "oido" | "palabra"
  | "transcodificar" | "render" | "buscar" | "construir";

export interface MsgCapacidadPedir {
  t: "capacidad.pedir";
  id: string;
  tipo: TipoCapacidad;
  cuerpo: Record<string, unknown>;
  sesionId?: string;
}

export interface MsgCapacidadTrozo {
  t: "capacidad.trozo";
  id: string;
  texto: string;
}

export interface MsgCapacidadFin {
  t: "capacidad.fin";
  id: string;
  resultado: unknown;
}

export interface MsgCapacidadError {
  t: "capacidad.error";
  id: string;
  estado: number;
  mensaje: string;
  reintentarEnS?: number;
  ocupado?: boolean;
}

export interface MsgCapacidadCancelar {
  t: "capacidad.cancelar";
  id: string;
}

export type CapacidadMsg =
  | MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin
  | MsgCapacidadError | MsgCapacidadCancelar;

/** Guarda que `x` es un mensaje del protocolo `capacidad.*` bien formado. */
export function esMensajeCapacidadMalla(x: unknown): x is CapacidadMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_MALLA_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (t) {
    case "capacidad.pedir":
      return typeof x.tipo === "string" && esObjeto(x.cuerpo);
    case "capacidad.trozo":
      return typeof x.texto === "string";
    case "capacidad.fin":
      return typeof x.resultado !== "undefined";
    case "capacidad.error":
      return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar":
      return true;
    default:
      return false;
  }
}

/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseCapacidadMallaMensaje(raw: string): CapacidadMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidadMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Codifica un `tipo` de capacidad para validación. Devuelve `true` si es válido. */
export function esTipoCapacidadValido(tipo: string): tipo is TipoCapacidad {
  return (
    tipo === "imagen" || tipo === "voz" || tipo === "oido" || tipo === "palabra" ||
    tipo === "transcodificar" || tipo === "render" || tipo === "buscar" || tipo === "construir"
  );
}

/** Tamaño en bytes UTF-8 de una cadena. */
export function bytesUtf8(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** ¿El JSON de este mensaje cabe en el límite del protocolo (≤ 16 KB)? */
export function cabeEnMensajeCapacidad(json: string): boolean {
  return bytesUtf8(json) <= CAPACIDAD_MALLA_MAX_BYTES;
}

/** Parte `texto` en trozos cuyo `capacidad.trozo` envuelto nunca supera el límite. */
export function partirEnTrozos(texto: string, maxBytesTexto: number = CAPACIDAD_MALLA_MAX_BYTES - TROZO_MARGEN_BYTES): string[] {
  if (!texto) return [];
  const partes: string[] = [];
  let actual = "";
  for (const ch of texto) {
    const candidato = actual + ch;
    if (actual && bytesUtf8(candidato) > maxBytesTexto) {
      partes.push(actual);
      actual = ch;
    } else {
      actual = candidato;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/** Id de petición razonablemente único. */
export function crearIdPeticion(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `am-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Resultado de `pedirCapacidad`. */
export interface ResultadoCapacidad {
  ok: boolean;
  resultado?: unknown;
  motivo?: string;
}

/**
 * pedirCapacidad — Pide una capacidad a la malla. Reúne trozos y nunca lanza.
 * `(enviar, { tipo, cuerpo, sesionId, timeoutMs })` — `enviar` es función que envía JSON por el canal.
 */
export function pedirCapacidad(
  enviar: (msg: string) => boolean,
  { tipo, cuerpo, sesionId, timeoutMs = 200_000 }: { tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string; timeoutMs?: number },
): Promise<ResultadoCapacidad> {
  const id = crearIdPeticion();
  let resultado: unknown;
  let motivo: string | undefined;
  let settled = false;

  const pedido: MsgCapacidadPedir = { t: "capacidad.pedir", id, tipo, cuerpo, sesionId };

  try {
    enviar(JSON.stringify(pedido));
  } catch (e) {
    return { ok: false, motivo: "Error al enviar la petición de capacidad." };
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, motivo: "Capacidad por la malla: timeout total." });
      }
    }, timeoutMs);

    // Listener de mensajes: en producción conectado al mesh
    // Para test, el llamador puede inyectar respuestas via FakeMesh
    const onMensaje = (data: string): void => {
      if (settled) return;
      const msg = parseCapacidadMallaMensaje(data);
      if (!msg || msg.id !== id) return;

      if (msg.t === "capacidad.trozo") {
        resultado = typeof resultado === "string" ? resultado + msg.texto : msg.texto;
      } else if (msg.t === "capacidad.fin") {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: true, resultado: msg.resultado });
      } else if (msg.t === "capacidad.error") {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, motivo: msg.mensaje });
      }
    };

    // Exponer el listener al mesh externo (patrón de `ia-por-malla`)
    // En test FakeMesh lo usa directamente
    (pedirCapacidad as any).onMensaje = onMensaje;
  });
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}
