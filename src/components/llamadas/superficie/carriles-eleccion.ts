/**
 * Elegir a mano el carril de cada flujo (LLA1111A) — PURO.
 * ═══════════════════════════════════════════════════════
 * El motor ya lo ofrece: `MotorLlamada.carriles()` describe los carriles de cada par y `forzarCarril(flujo, carril)` fuerza
 * uno (`null` vuelve a lo automático). Aquí se decide qué enseñar en la pestaña «Medio» para la voz, el vídeo y la
 * pantalla: el carril que va ahora, «Automático» y solo los carriles que están ARRIBA ahora. Los que no están arriba se
 * nombran en una sola línea («Sin enlace ahora: …»), no como filas muertas. Si la persona forzó uno que se cayó, se
 * enseña marcado como no disponible (el motor ya vuelve a lo automático mientras tanto).
 */
import { REGLAS, type Carril, type Flujo } from "@/lib/llamadas/carriles";
import type { CarrilesParVista } from "@/lib/llamadas/tipos";

export type FlujoElegible = "voz" | "video" | "pantalla";
export const FLUJOS_ELEGIBLES: readonly FlujoElegible[] = ["voz", "video", "pantalla"];

export const NOMBRE_FLUJO: Record<FlujoElegible, string> = { voz: "Voz", video: "Vídeo", pantalla: "Pantalla" };

/** Nombre claro de cada carril (los dos de Bluetooth se distinguen: la persona puede querer uno u otro). */
export const NOMBRE_CARRIL: Record<Carril, string> = {
  webrtc: "WebRTC (IP)",
  awdl: "AWDL",
  "wifi-aware": "Wi‑Fi Aware",
  "wifi-direct": "Wi‑Fi directo",
  "lan-tcp": "Red local",
  "ble-l2cap": "Bluetooth rápido",
  "ble-gatt": "Bluetooth (GATT)",
};

export interface OpcionCarril {
  carril: Carril;
  etiqueta: string;
  arriba: boolean;
}

export interface EleccionFlujo {
  flujo: FlujoElegible;
  nombre: string;
  /** El carril que lleva el flujo ahora (null: aún ninguno). */
  actual: Carril | null;
  textoActual: string;
  /** Lo que la persona forzó (null: automático). */
  forzado: Carril | null;
  /** «auto» o el carril forzado: el valor del selector. */
  valor: "auto" | Carril;
  /** Para elegir: los carriles arriba (y el forzado aunque se haya caído, marcado). */
  opciones: OpcionCarril[];
  /** Los carriles posibles para este flujo que no están arriba ahora (una línea). */
  sinEnlace: string[];
}

/**
 * Qué carriles están arriba con ese par: los que llevan algo ahora (voz, vídeo, pantalla, señal), el del enlace de
 * datos y WebRTC si la conexión WebRTC del par está conectada.
 */
export function carrilesArriba(par: CarrilesParVista, webrtcConectado: boolean): Set<Carril> {
  const s = new Set<Carril>();
  for (const c of [par.voz, par.video, par.pantalla, par.senal, par.datos]) if (c) s.add(c);
  if (webrtcConectado) s.add("webrtc");
  return s;
}

/** Las elecciones de voz, vídeo y pantalla para ese par. */
export function eleccionesCarril(par: CarrilesParVista, webrtcConectado: boolean): EleccionFlujo[] {
  const arriba = carrilesArriba(par, webrtcConectado);
  return FLUJOS_ELEGIBLES.map((flujo) => {
    const posibles = REGLAS[flujo as Flujo].preferencia;
    const actual = par[flujo] ?? null;
    const forzado = par.forzados?.[flujo as Flujo] ?? null;
    const opciones: OpcionCarril[] = posibles.filter((c) => arriba.has(c)).map((c) => ({ carril: c, etiqueta: NOMBRE_CARRIL[c], arriba: true }));
    if (forzado && !arriba.has(forzado)) opciones.push({ carril: forzado, etiqueta: `${NOMBRE_CARRIL[forzado]} (sin enlace ahora)`, arriba: false });
    const sinEnlace = posibles.filter((c) => !arriba.has(c)).map((c) => NOMBRE_CARRIL[c]);
    return {
      flujo,
      nombre: NOMBRE_FLUJO[flujo],
      actual,
      textoActual: actual ? NOMBRE_CARRIL[actual] : "sin carril todavía",
      forzado,
      valor: forzado ?? "auto",
      opciones,
      sinEnlace: Array.from(new Set(sinEnlace)),
    };
  });
}

/** El par al que mira la elección en una llamada de dos (el primero); en grupo, el forzado vale para todos. */
export function parPrincipal(pares: readonly CarrilesParVista[] | null | undefined): CarrilesParVista | null {
  return pares && pares.length ? pares[0] : null;
}

/** Lo que la superficie necesita del motor para esto (la `MotorLlamada` lo cumple tal cual). */
export interface FuenteCarriles {
  carriles(): CarrilesParVista[];
  estado(): { participantes: ReadonlyArray<{ id: string; yo: boolean; stream?: MediaStream | null }> };
  forzarCarril(flujo: Flujo, carril: Carril | null): void;
}

/**
 * ¿WebRTC está arriba con ese par? El `conexion` del participante no sirve (se pone «conectado» también cuando la voz
 * llega por el enlace de datos): cuenta que algún flujo vaya ya por WebRTC o que su flujo WebRTC traiga una pista viva
 * y no muda (una pista negociada sin ruta llega «muted» para siempre).
 */
export function webrtcConectadoCon(fuente: FuenteCarriles, par: CarrilesParVista): boolean {
  if (par.voz === "webrtc" || par.video === "webrtc" || par.pantalla === "webrtc") return true;
  try {
    const p = fuente.estado().participantes.find((x) => !x.yo && x.id === par.parId);
    return !!p?.stream?.getTracks().some((t) => t.readyState === "live" && !t.muted);
  } catch {
    return false;
  }
}
