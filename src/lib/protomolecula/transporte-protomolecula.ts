/**
 * transporte-protomolecula — enlaza una sesión de molécula por la malla P2P (2026-10-30).
 * Contrato: `architecture/protomolecula.md` §6 (F3) · canal de aplicación «protomolecula». Red INYECTADA: puro.
 * Confirmaciones como `ElementoSala` (`elementoDeOperacion`) y gestos de 60 Hz EFÍMEROS (P0, nunca guardados);
 * presencia (quién mueve qué, P0). El instante `t` sale del reloj común (`reloj-comun.ts`), que enseña su
 * precisión y NO inventa una sin muestras. Latencia por ping/pong con p50/p95; con < 3 muestras: «sin medir».
 */
import type { Cambio, EstadoValores, Molecula, Operacion, ParametroRef, Sesion } from "./tipos";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { EstadoReloj, RelojComun } from "@/lib/estaciones/reloj-comun";

export const CANAL_APLICACION = "protomolecula";
export const MIN_MUESTRAS_LATENCIA = 3;
const MAX_MUESTRAS = 32;
const MAX_PING_PENDIENTES = 8;

export type MensajeProtomolecula =
  | { t: "op"; elementos: ElementoSala[]; de: string }
  | { t: "gesto"; de: string; id: string; ref: ParametroRef; valor: number }
  | { t: "presencia"; de: string; quien: string; mueve?: string }
  | { t: "ping"; de: string; id: string }
  | { t: "pong"; id: string; para: string };

export type MuestraLatencia = { p50Ms: number | null; p95Ms: number | null; muestras: number; texto: string };
export type PresenciaAparato = { id: string; quien: string; mueve?: string; at: number };
export type EstadoSesionEnlace = {
  transporte: Sesion["transporte"]; texto: string; latencia: MuestraLatencia; reloj: EstadoReloj; presencia: PresenciaAparato[];
};
export type DepsEnlaceSesion = {
  sesion: Pick<Sesion, "transporte">;
  /** Puerta de salida real: en producción `enviarMensaje(destino, CANAL_APLICACION, texto)`. */
  enviar(texto: string): void;
  recibir(cb: (texto: string) => void): () => void;
  reloj: RelojComun;
  /** Molécula de este lado; si aún no está abierta, solo se avisa y no se aplica nada. */
  molecula?: () => Molecula | null;
};
export interface EnlaceSesion {
  tComun(): number;
  confirmar(op: Operacion, cambio: Cambio): void;
  gesto(ref: ParametroRef, valor: number): void;
  presencia(quien: string, mueve?: string): void;
  medir(): void;
  latencia(): MuestraLatencia;
  estado(): EstadoSesionEnlace;
  alConfirmar(cb: (m: { elementos: ElementoSala[]; de: string }) => void): () => void;
  alGesto(cb: (g: { de: string; ref: ParametroRef; valor: number }) => void): () => void;
  alPresencia(cb: (p: PresenciaAparato) => void): () => void;
  alMolecula(cb: (m: Molecula) => void): () => void;
}

export function medirLatencia(muestras: number[], min = MIN_MUESTRAS_LATENCIA): MuestraLatencia {
  const finitas = muestras.filter((m) => Number.isFinite(m) && m >= 0);
  if (finitas.length < min) return { p50Ms: null, p95Ms: null, muestras: finitas.length, texto: "sin medir" };
  const s = [...finitas].sort((a, b) => a - b);
  const p = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
  return { p50Ms: p(0.5), p95Ms: p(0.95), muestras: s.length, texto: `${p(0.5)} ms` };
}

const ETIQUETA_TRANSPORTE: Record<Sesion["transporte"], string> = {
  "servidor-publico": "relé cifrado del servidor",
  "servidor-privado": "servidor privado",
  "malla-p2p": "malla P2P",
  local: "solo en este aparato",
};

/** Lo que la interfaz enseña: por qué enlace va la sesión («local» = sin compañero aún). */
export function etiquetaEnlace(transporte: Sesion["transporte"], lat: MuestraLatencia): string {
  return transporte === "local" ? "solo en este aparato" : `${ETIQUETA_TRANSPORTE[transporte]} · ${lat.texto}`;
}

const esValor = (v: unknown): v is EstadoValores[string] => typeof v === "number" || typeof v === "boolean" || typeof v === "string";

/** Funde los elementos recibidos en la molécula local. `moleculaDesdeElementos` aún no recompone
 * `valores` (pendiente en `sesion-sincronia.ts`): se hace aquí con el mismo convenio de claves
 * `atomoId::parametroId` que fija `elementoDeOperacion`. */
export function aplicarElementos(base: Molecula, elementos: ElementoSala[]): Molecula {
  const m = moleculaDesdeElementos(base, elementos);
  const valores: EstadoValores = { ...m.valores };
  for (const e of elementos) {
    if (e.tipo !== "parametro" || e.borrado) continue;
    if (esValor(e.datos?.valor)) valores[e.id] = e.datos.valor;
  }
  return { ...m, valores, actualizadaEn: Math.max(m.actualizadaEn, base.actualizadaEn) };
}

const TIPOS_MENSAJE: string[] = ["op", "gesto", "presencia", "ping", "pong"];

/** Guarda barato antes de tocar nada: todo lo que llega de la malla viene de fuera. */
export function esMensajeProtomolecula(x: unknown): x is MensajeProtomolecula {
  const t = (x as { t?: unknown } | null | undefined)?.t;
  return typeof t === "string" && TIPOS_MENSAJE.includes(t);
}

/** Crea un extremo de la sesión: `enviar` va hacia el otro lado y `recibir` trae lo suyo. */
export function crearEnlaceSesion(d: DepsEnlaceSesion): EnlaceSesion {
  const de = d.reloj.id;
  let secuencia = 0;
  const pendientes = new Map<string, number>();
  const latencias: number[] = [];
  const presencia = new Map<string, PresenciaAparato>();
  const oyentes = {
    ops: new Set<(m: { elementos: ElementoSala[]; de: string }) => void>(),
    gestos: new Set<(g: { de: string; ref: ParametroRef; valor: number }) => void>(),
    presencia: new Set<(p: PresenciaAparato) => void>(),
    moleculas: new Set<(m: Molecula) => void>(),
  };
  const mandar = (m: MensajeProtomolecula): void => {
    try { d.enviar(JSON.stringify(m)); } catch { /* el canal de abajo sostiene la cola; nada que guardar */ }
  };
  const juntar = (elementos: ElementoSala[], deOrigen: string): void => {
    for (const cb of oyentes.ops) cb({ elementos, de: deOrigen });
    const base = d.molecula?.();
    if (base) { const m = aplicarElementos(base, elementos); for (const cb of oyentes.moleculas) cb(m); }
  };
  d.recibir((texto) => {
    let m: unknown;
    try { m = JSON.parse(texto); } catch { return; }
    if (!esMensajeProtomolecula(m) || ("de" in m && m.de === de)) return; // eco propio: descartado
    if (m.t === "op") return juntar(m.elementos, m.de);
    // P0 efímero: el gesto solo se avisa, NUNCA se guarda en la molécula.
    if (m.t === "gesto") { for (const cb of oyentes.gestos) cb({ de: m.de, ref: m.ref, valor: m.valor }); return; }
    if (m.t === "presencia") {
      const p: PresenciaAparato = { id: m.de, quien: m.quien, at: d.reloj.ahora(), ...(m.mueve ? { mueve: m.mueve } : {}) };
      presencia.set(m.de, p);
      for (const cb of oyentes.presencia) cb(p);
      return;
    }
    if (m.t === "ping") return mandar({ t: "pong", id: m.id, para: m.de });
    const t0 = pendientes.get(m.id);
    if (t0 === undefined) return;
    pendientes.delete(m.id);
    latencias.push(Math.max(0, Math.round(d.reloj.horaLocal() - t0)));
    if (latencias.length > MAX_MUESTRAS) latencias.shift();
  });
  return {
    tComun: () => d.reloj.ahora(),
    confirmar(op, cambio) { mandar({ t: "op", elementos: [elementoDeOperacion(op, cambio)], de }); },
    gesto(ref, valor) { mandar({ t: "gesto", de, id: `${de}-g${++secuencia}`, ref, valor }); },
    presencia(quien, mueve) { mandar({ t: "presencia", de, quien, ...(mueve ? { mueve } : {}) }); },
    medir() {
      const id = `${de}-p${++secuencia}`;
      pendientes.set(id, d.reloj.horaLocal());
      if (pendientes.size > MAX_PING_PENDIENTES) pendientes.delete(pendientes.keys().next().value as string);
      mandar({ t: "ping", de, id });
    },
    latencia: () => medirLatencia(latencias),
    estado(): EstadoSesionEnlace {
      const lat = medirLatencia(latencias);
      return {
        transporte: d.sesion.transporte,
        texto: etiquetaEnlace(d.sesion.transporte, lat),
        latencia: lat,
        reloj: d.reloj.estado(),
        presencia: [...presencia.values()],
      };
    },
    alConfirmar: (cb) => (oyentes.ops.add(cb), () => oyentes.ops.delete(cb)),
    alGesto: (cb) => (oyentes.gestos.add(cb), () => oyentes.gestos.delete(cb)),
    alPresencia: (cb) => (oyentes.presencia.add(cb), () => oyentes.presencia.delete(cb)),
    alMolecula: (cb) => (oyentes.moleculas.add(cb), () => oyentes.moleculas.delete(cb)),
  };
}
