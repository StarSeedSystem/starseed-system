/**
 * Protomolécula · VÍNCULOS DE CONTROL. MIDI (CC, nota, pitch), gamepad, HID, OSC y sensores → un
 * parámetro, con curva (lineal/log/exp), invertir, zona muerta y suavizado, más la máquina de
 * estados del modo «aprender». Módulo PURO: quien lee el hardware (Web MIDI, Gamepad API…) llama
 * a `procesar` con el valor bruto; aquí no hay dispositivos ni reloj.
 *
 * Curva: zona muerta → forma → invertir. «log» responde rápido al principio, «exp» lento al
 * principio (ambas van de 0 a 1). Los mandos absolutos respetan el `paso` del parámetro.
 * Los sensores (también los de salud) NO se aprenden moviéndolos: se eligen de una lista, con el
 * consentimiento de `permisos.ts`.
 */
import type { Autor, Operacion, Origen, Parametro, ParametroRef, ValorParametro } from "./tipos";

export type FuenteControl =
  | { tipo: "midi"; mensaje: "cc" | "nota" | "pitch"; canal: number; numero?: number; dispositivo?: string }
  | { tipo: "gamepad"; control: "eje" | "boton"; numero: number; indice?: number }
  | { tipo: "hid"; dispositivo: string; byte: number }
  | { tipo: "osc"; direccion: string }
  | { tipo: "sensor"; sensorId: string; eje?: string };
export type ModoVinculo = "absoluto" | "relativo" | "alternar" | "disparo";
export interface Curva {
  forma: "lineal" | "log" | "exp";
  invertir: boolean;
  /** 0–0.5. En ejes con centro (palancas, pitch) es alrededor del centro; si no, en los extremos. */
  zonaMuerta: number;
  /** 0 = sin suavizar, 0.99 = muy lento. */
  suavizado: number;
  /** Rango bruto si no es el de la fuente (p. ej. pulso 40–180). */
  entradaMin?: number;
  entradaMax?: number;
}
export interface Vinculo { id: string; fuente: FuenteControl; objetivo: ParametroRef; modo: ModoVinculo; curva: Curva; activo: boolean; creadoPor: string }
export const CURVA_LINEAL: Curva = { forma: "lineal", invertir: false, zonaMuerta: 0, suavizado: 0 };

export function claveFuente(f: FuenteControl): string {
  switch (f.tipo) {
    case "midi": return `midi:${f.dispositivo ?? "*"}:${f.mensaje}:${f.canal}:${f.numero ?? 0}`;
    case "gamepad": return `gamepad:${f.indice ?? 0}:${f.control}:${f.numero}`;
    case "hid": return `hid:${f.dispositivo}:${f.byte}`;
    case "osc": return `osc:${f.direccion}`;
    case "sensor": return `sensor:${f.sensorId}:${f.eje ?? ""}`;
  }
}
export const origenDe = (f: FuenteControl): Origen => f.tipo;
export const esDiscreto = (f: FuenteControl): boolean => (f.tipo === "midi" && f.mensaje === "nota") || (f.tipo === "gamepad" && f.control === "boton");
export const esBipolar = (f: FuenteControl): boolean => (f.tipo === "midi" && f.mensaje === "pitch") || (f.tipo === "gamepad" && f.control === "eje");

export function rangoEntrada(f: FuenteControl): [number, number] {
  if (f.tipo === "midi") return [0, f.mensaje === "pitch" ? 16383 : 127];
  if (f.tipo === "gamepad") return f.control === "eje" ? [-1, 1] : [0, 1];
  return f.tipo === "hid" ? [0, 255] : [0, 1];
}

/** Valor bruto → 0..1 (acotado). */
export function normalizar01(f: FuenteControl, bruto: number, c: Curva = CURVA_LINEAL): number {
  const [a, b] = rangoEntrada(f);
  const lo = c.entradaMin ?? a, hi = c.entradaMax ?? b;
  return hi === lo || !Number.isFinite(bruto) ? 0 : Math.min(1, Math.max(0, (bruto - lo) / (hi - lo)));
}

/** Zona muerta → forma → invertir. Pura: el suavizado vive en el estado. */
export function aplicarCurva(x: number, c: Curva, bipolar: boolean): number {
  const z = Math.min(0.5, Math.max(0, c.zonaMuerta));
  let y = x;
  if (bipolar) {
    const k = x * 2 - 1;
    y = ((Math.abs(k) < z ? 0 : (Math.sign(k) * (Math.abs(k) - z)) / (1 - z)) + 1) / 2;
  } else y = x <= z ? 0 : x >= 1 - z ? 1 : (x - z) / (1 - 2 * z);
  y = c.forma === "log" ? Math.log10(1 + 9 * y) : c.forma === "exp" ? (10 ** y - 1) / 9 : y;
  return c.invertir ? 1 - y : y;
}

export interface EstadoVinculo { suave: number | null; ultimo: ValorParametro | null; arriba: boolean }
export const estadoInicial = (): EstadoVinculo => ({ suave: null, ultimo: null, arriba: false });
export interface ContextoVinculo { autor: Autor; ahora: number; id: string }

/** Encoders relativos de MIDI: 1–63 suma, 65–127 resta (complemento a dos con centro en 64). */
const deltaRelativo = (f: FuenteControl, b: number): number => (f.tipo === "midi" ? (b === 64 || b === 0 ? 0 : b < 64 ? b : b - 128) : b);

export function procesar(v: Vinculo, p: Parametro, e: EstadoVinculo, bruto: number, ctx: ContextoVinculo): { operacion: Operacion | null; estado: EstadoVinculo } {
  const hacer = (accion: Operacion["accion"], estado: EstadoVinculo) => ({
    operacion: { id: ctx.id, objetivo: v.objetivo, accion, autor: ctx.autor, origen: origenDe(v.fuente), t: ctx.ahora, fuente: claveFuente(v.fuente) } as Operacion,
    estado,
  });
  if (!v.activo) return { operacion: null, estado: e };
  if (v.modo === "relativo") {
    const d = deltaRelativo(v.fuente, bruto) * (v.curva.invertir ? -1 : 1);
    return d === 0 ? { operacion: null, estado: e } : hacer({ tipo: "relativa", cantidad: d, modo: "pasos" }, e);
  }
  const y = aplicarCurva(normalizar01(v.fuente, bruto, v.curva), v.curva, esBipolar(v.fuente));
  if (v.modo === "alternar" || v.modo === "disparo") {
    const arriba = y >= 0.5;
    const subida = arriba && !e.arriba;
    const estado = { ...e, arriba };
    return subida ? hacer(v.modo === "alternar" ? { tipo: "alternar" } : { tipo: "disparo" }, estado) : { operacion: null, estado };
  }
  const s = Math.min(0.99, Math.max(0, v.curva.suavizado));
  const suave = e.suave === null ? y : e.suave + (1 - s) * (y - e.suave);
  const lo = p.min ?? 0, hi = p.max ?? 1;
  let valor: ValorParametro;
  if (p.tipo === "booleano") valor = suave >= 0.5;
  else if (p.tipo === "opcion") valor = (p.opciones ?? [""])[Math.min((p.opciones?.length ?? 1) - 1, Math.floor(suave * (p.opciones?.length ?? 1)))];
  else {
    valor = lo + suave * (hi - lo);
    if (p.paso) valor = Math.round(((valor as number) - lo) / p.paso) * p.paso + lo;
    valor = Math.round((valor as number) * 1e9) / 1e9;
  }
  const estado = { ...e, suave, ultimo: valor };
  const cambio = typeof valor === "number" && typeof e.ultimo === "number" ? Math.abs(valor - e.ultimo) >= (p.paso ? p.paso / 2 : (hi - lo) / 1000) : valor !== e.ultimo;
  return e.ultimo === null || cambio ? hacer({ tipo: "exacta", valor }, estado) : { operacion: null, estado: { ...e, suave } };
}

/* ── Modo «aprender»: toca el parámetro, mueve el mando, confirma. ── */
export interface Muestra { fuente: FuenteControl; n: number; min: number; max: number }
export type EstadoAprender =
  | { fase: "inactivo" }
  | { fase: "escuchando"; objetivo: ParametroRef; caduca: number; vistos: Record<string, Muestra> }
  | { fase: "detectado"; objetivo: ParametroRef; fuente: FuenteControl }
  | { fase: "cancelado"; motivo: "usuario" | "caducado" };
export type EventoAprender =
  | { tipo: "empezar"; objetivo: ParametroRef; ahora: number; esperaMs?: number }
  | { tipo: "entrada"; fuente: FuenteControl; bruto: number; ahora: number }
  | { tipo: "tic"; ahora: number }
  | { tipo: "confirmar" }
  | { tipo: "cancelar" };
/** Un mando continuo se da por detectado tras 3 mensajes que se muevan al menos el 15 %; un botón, a la primera pulsación. */
export const MOVIMIENTO_MINIMO = 0.15;
export const MENSAJES_MINIMOS = 3;

export function siguienteAprender(e: EstadoAprender, ev: EventoAprender): EstadoAprender {
  if (ev.tipo === "empezar") return { fase: "escuchando", objetivo: ev.objetivo, caduca: ev.ahora + (ev.esperaMs ?? 15000), vistos: {} };
  if (ev.tipo === "cancelar") return e.fase === "inactivo" ? e : { fase: "cancelado", motivo: "usuario" };
  if (ev.tipo === "confirmar") return e.fase === "detectado" ? { fase: "inactivo" } : e;
  if (e.fase !== "escuchando") return e;
  if (ev.ahora > e.caduca) return { fase: "cancelado", motivo: "caducado" };
  if (ev.tipo === "tic" || ev.fuente.tipo === "sensor") return e;
  const x = normalizar01(ev.fuente, ev.bruto), k = claveFuente(ev.fuente), antes = e.vistos[k];
  if (esDiscreto(ev.fuente)) return x > 0 ? { fase: "detectado", objetivo: e.objetivo, fuente: ev.fuente } : e;
  const m: Muestra = antes ? { ...antes, n: antes.n + 1, min: Math.min(antes.min, x), max: Math.max(antes.max, x) } : { fuente: ev.fuente, n: 1, min: x, max: x };
  return m.n >= MENSAJES_MINIMOS && m.max - m.min >= MOVIMIENTO_MINIMO
    ? { fase: "detectado", objetivo: e.objetivo, fuente: ev.fuente }
    : { ...e, vistos: { ...e.vistos, [k]: m } };
}

/** El vínculo que sale de un aprendizaje confirmado; el modo depende del tipo de parámetro. */
export function vinculoAprendido(e: Extract<EstadoAprender, { fase: "detectado" }>, p: Parametro, id: string, creadoPor: string): Vinculo {
  const modo: ModoVinculo = p.tipo === "disparo" ? "disparo" : p.tipo === "booleano" || esDiscreto(e.fuente) ? "alternar" : "absoluto";
  return { id, fuente: e.fuente, objetivo: e.objetivo, modo, curva: { ...CURVA_LINEAL }, activo: true, creadoPor };
}
