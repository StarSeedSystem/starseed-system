/**
 * transporte-protomolecula — el canal de sesión P2P de la Protomolécula (2026-10-28).
 * Contrato: `architecture/protomolecula.md` §6 (F3). El transporte real queda
 * INYECTADO (`enviar`/`recibir` sobre el canal de aplicación «protomolecula» de
 * `malla/transporte-universal.ts`), de modo que el módulo no conoce la red y
 * las pruebas corren con dos enlaces falsos. Confirmación: `elementoDeOperacion`
 * (P1, se guarda y se fusiona). Gesto: P0, solo el último valor cada ≥ 16 ms y
 * NUNCA se guarda; por LoRa solo confirmaciones. Presencia: P0, quién mueve qué.
 * La `t` de toda operación sale del reloj común, que enseña su precisión y no
 * inventa una sin muestras (`reloj-comun.ts`). La fusión sigue la regla
 * determinista de `salas/sincronia-sala.ts`: gana el `t` mayor; empate, el
 * dispositivo menor. Latencia: ping/pong, p50/p95 con suficientes muestras.
 */
import type { Cambio, EstadoValores, Operacion, Sesion, ValorParametro } from "./tipos";
import { elementoDeOperacion } from "./sesion-sincronia";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { EstadoReloj, RelojComun } from "@/lib/estaciones/reloj-comun";
import type { TipoEnlace } from "@/lib/malla/eleccion-enlace";

export const CANAL_PROTO = "protomolecula"; // canal de aplicación (lo conecta la tarea que abre la sesión)
export const DESCRIPCION_SIN_ENLACE = "Solo en este aparato";
export const GESTO_MS = 16; // goteo de gestos: solo el último valor cada ≥ 16 ms
export const MIN_MUESTRAS = 5; // con menos muestras el medidor dice «sin medir»
const MUESTRAS_MAX = 40;

type Ref = { atomoId: string; parametroId: string };

export type MensajeSesion =
  | { k: "op"; de: string; t: number; op: Operacion; el: ElementoSala }
  | { k: "gesto"; de: string; t: number; ref: Ref; valor: ValorParametro }
  | { k: "presencia"; de: string; t: number; quien: string; mueve: Ref | null }
  | { k: "ping"; de: string; t0: number }
  | { k: "pong"; para: string; t0: number; t1: number };

export type Latencia = { modo: "sin-medir"; muestras: 0 } | { modo: "medida"; p50Ms: number; p95Ms: number; muestras: number };

/** p50/p95 honestos: por debajo del mínimo de muestras no se cifra nada. */
export function resumenLatencia(muestras: number[], min = MIN_MUESTRAS): Latencia {
  const v = muestras.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length < min) return { modo: "sin-medir", muestras: 0 };
  const en = (q: number) => v[Math.max(0, Math.min(v.length, Math.round(q * v.length))) - 1];
  return { modo: "medida", p50Ms: en(0.5), p95Ms: en(0.95), muestras: v.length };
}

export interface EstadoEnlace {
  transporte: Sesion["transporte"];
  /** null = no hay enlace a nadie: DESCRIPCION_SIN_ENLACE. */
  enlace: { tipo: TipoEnlace; etiqueta: string } | null;
  reloj: { modo: EstadoReloj["modo"]; precisionMs: number | null };
  latencia: Latencia;
}

export interface OpcionesEnlace {
  sesion: Sesion;
  /** Id de ESTE aparato: los ecos propios no vuelven a entrar. */
  idAparato: string;
  reloj: Pick<RelojComun, "ahora" | "estado">;
  /** Manda un mensaje de sesión por el canal real (malla, relé, LoRa…). */
  enviar: (m: MensajeSesion) => boolean | Promise<boolean>;
  /** Engancha la recepción (alRecibirMensaje); entrega cada cuerpo entrante. */
  recibir: (cb: (m: unknown) => void) => () => void;
  /** ¿Hay enlace vivo ahora mismo? Sin él, la sesión es local. */
  conectado?: boolean;
  tipoEnlace?: TipoEnlace;
  etiquetaEnlace?: string;
}

export interface EnlaceSesion {
  /** Confirma una operación: viaja y se fusiona con regla determinista. */
  confirmar(op: Operacion, cambio: Cambio): Promise<boolean>;
  /** Gesto efímero (arrastrar un fader): P0, no se guarda en ningún estado. */
  gesto(ref: Ref, valor: ValorParametro): Promise<boolean>;
  /** Presencia: quién mueve qué (P0). */
  presencia(quien: string, mueve: Ref | null): Promise<boolean>;
  ping(): void;
  alConfirmacion(cb: (op: Operacion, valor: ValorParametro, de: string) => void): () => void;
  alGesto(cb: (ref: Ref, valor: ValorParametro, de: string) => void): () => void;
  alPresencia(cb: (quien: string, mueve: Ref | null, de: string) => void): () => void;
  /** Estado de valores fusionado (confirmaciones, nunca gestos). */
  valores(): EstadoValores;
  estado(): EstadoEnlace;
}

/** Cómo se dice por qué enlace va la sesión, en la interfaz. */
export const describirEnlace = (e: EstadoEnlace): string =>
  e.enlace ? `Vía ${e.enlace.etiqueta}` : DESCRIPCION_SIN_ENLACE;

/** Regla determinista de `salas/sincronia-sala.ts`: gana `t` mayor; empate, dispositivo menor. */
const gana = (nueva: { t: number; por: string }, vieja: { t: number; por: string }): boolean =>
  nueva.t > vieja.t || (nueva.t === vieja.t && nueva.por < vieja.por);

export function crearEnlaceSesion(op: OpcionesEnlace): EnlaceSesion {
  const mapa = new Map<string, { t: number; por: string; valor: ValorParametro }>();
  const enOps = new Set<(op: Operacion, valor: ValorParametro, de: string) => void>();
  const enGestos = new Set<(ref: Ref, valor: ValorParametro, de: string) => void>();
  const enPresencia = new Set<(quien: string, mueve: Ref | null, de: string) => void>();
  const rtts: number[] = [];
  let ultimoGesto = -Number.MAX_SAFE_INTEGER;
  const indicar = (clave: string, e: { t: number; por: string; valor: ValorParametro }): void => {
    if (mapa.has(clave) && !gana(e, mapa.get(clave) as { t: number; por: string })) return;
    mapa.set(clave, e);
  };
  const salida = async (m: MensajeSesion): Promise<boolean> => {
    try {
      return await op.enviar(m);
    } catch {
      return false;
    }
  };
  const tratar = (m: unknown): void => {
    if (!m || typeof m !== "object") return;
    const msg = m as MensajeSesion;
    if (typeof msg.k !== "string" || ("de" in msg && msg.de === op.idAparato)) return;
    if (msg.k === "op") {
      indicar(msg.el.id, { t: msg.el.actualizadoEn, por: msg.el.porDispositivo, valor: msg.el.datos.valor as ValorParametro });
      for (const f of enOps) f(msg.op, msg.el.datos.valor as ValorParametro, msg.de);
    } else if (msg.k === "gesto") {
      for (const f of enGestos) f(msg.ref, msg.valor, msg.de); // P0: NUNCA entra al mapa
    } else if (msg.k === "presencia") {
      for (const f of enPresencia) f(msg.quien, msg.mueve ?? null, msg.de);
    } else if (msg.k === "ping") {
      void salida({ k: "pong", para: msg.de, t0: msg.t0, t1: op.reloj.ahora() });
    } else if (msg.k === "pong" && msg.para === op.idAparato) {
      rtts.push(op.reloj.ahora() - msg.t0);
      if (rtts.length > MUESTRAS_MAX) rtts.shift();
    }
  };
  const soltar = op.recibir(tratar);

  return {
    async confirmar(o, cambio) {
      const t = op.reloj.ahora(); // la `t` de toda operación sale del reloj común
      const opConT: Operacion = { ...o, t };
      const el = elementoDeOperacion(opConT, cambio);
      indicar(el.id, { t, por: op.idAparato, valor: cambio.despues });
      return salida({ k: "op", de: op.idAparato, t, op: opConT, el });
    },
    async gesto(ref, valor) {
      if (op.tipoEnlace === "lora") return false;
      const t = op.reloj.ahora();
      if (t - ultimoGesto < GESTO_MS) return true; // goteo
      ultimoGesto = t;
      return salida({ k: "gesto", de: op.idAparato, t, ref, valor });
    },
    async presencia(quien, mueve) {
      return salida({ k: "presencia", de: op.idAparato, t: op.reloj.ahora(), quien, mueve });
    },
    ping() {
      void salida({ k: "ping", de: op.idAparato, t0: op.reloj.ahora() });
    },
    alConfirmacion(cb) { enOps.add(cb); return () => { enOps.delete(cb); }; },
    alGesto(cb) { enGestos.add(cb); return () => { enGestos.delete(cb); }; },
    alPresencia(cb) { enPresencia.add(cb); return () => { enPresencia.delete(cb); }; },
    valores(): EstadoValores {
      const out: EstadoValores = {};
      for (const [k, e] of mapa) out[k] = e.valor;
      return out;
    },
    estado(): EstadoEnlace {
      const r = op.reloj.estado();
      return {
        transporte: op.sesion.transporte,
        enlace: op.conectado ? { tipo: op.tipoEnlace ?? "cuenta", etiqueta: op.etiquetaEnlace ?? "Malla P2P" } : null,
        reloj: { modo: r.modo, precisionMs: r.precisionMs },
        latencia: resumenLatencia(rtts),
      };
    },
    detener: () => soltar(),
  };
}
