/**
 * transporte-protomolecula — el ENLACE en vivo de una sesión de molécula (F3 · PM1010F3B).
 * Contrato: `architecture/protomolecula.md` §6.2–§6.3; va encima del núcleo y usa los
 * nombres de `sesion-sincronia.ts` (PM1010F3A). Carga confirmaciones (gana el último),
 * gestos efímeros (P0, que NO se guardan — al soltar queda la confirmación), presencia
 * (quién mueve qué), el instante t de cada operación tomado del reloj común (que nunca
 * inventa precisión sin muestras) y un medidor de latencia honesto (p50/p95 con muestras).
 * PURO e INYECTADO: `enviar` y `recibir` los pone quien cablea; el cableado real con
 * `malla/transporte-universal.ts` es tarea sucesora. Sin enlace: «solo en este aparato».
 */
import type { Molecula, Operacion, Cambio, EstadoValores, ParametroRef, Sesion } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { RelojComun, EstadoReloj } from "@/lib/estaciones/reloj-comun";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";

export const CANAL_PROTOMOLECULA = "protomolecula";
/** La ruta por la que salió el último mensaje (la enseñará la interfaz). */
export interface EnlaceVia { id: string; tipo: string; etiqueta: string }

export type MensajeMolecula =
  | { k: "confirma"; de: string; op: Operacion; elemento: ElementoSala }
  | { k: "gesto"; de: string; ref: ParametroRef; valor: number | boolean | string; t: number }
  | { k: "presencia"; de: string; ref: ParametroRef | null; t: number }
  | { k: "ping"; de: string; id: string; t: number }
  | { k: "pong"; de: string; id: string; para: string; t: number };

export interface GestoRecibido { de: string; ref: ParametroRef; valor: number | boolean | string }
export interface QuienMueve { de: string; ref: ParametroRef | null; t: number; via: EnlaceVia | null }
export type Latencia = { medida: true; p50Ms: number; p95Ms: number; muestras: number } | { medida: false; texto: "sin medir" };

export interface OpcionesEnlace {
  sesion: Sesion;
  yo: { dispositivo: string; nombre?: string };
  enviar: (m: MensajeMolecula, via: EnlaceVia | null) => void;
  recibir: (cb: (m: MensajeMolecula, via: EnlaceVia | null) => void) => () => void;
  reloj: RelojComun;
  /** Un gesto del otro mueve el fader en vivo (efímero, sin estado). */
  alGesto?: (g: GestoRecibido, via: EnlaceVia | null) => void;
}


const MUESTRAS_MIN_LATENCIA = 3;
const idNueva = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function crearEnlaceSesion(op: OpcionesEnlace): EnlaceSesion {
  const confirmados: ElementoSala[] = [];
  const recibidos: EstadoValores = {};
  const muestrasLat: number[] = [];
  const enVuelo = new Map<string, number>();
  const moviendo = new Map<string, QuienMueve>();
  let ultimoVia: EnlaceVia | null = null;

  const atender = (m: MensajeMolecula, via: EnlaceVia | null) => {
    if (m.de === op.yo.dispositivo) return; // el eco de lo propio no cuenta
    if (via) ultimoVia = via;
    switch (m.k) {
      case "confirma": {
        const v = m.elemento.datos.valor;
        if (typeof v === "number" || typeof v === "boolean" || typeof v === "string")
          recibidos[`${m.op.objetivo.atomoId}::${m.op.objetivo.parametroId}`] = v;
        confirmados.push(m.elemento);
        if (confirmados.length > 128) confirmados.shift();
        break;
      }
      case "gesto": op.alGesto?.({ de: m.de, ref: m.ref, valor: m.valor }, via); break;
      case "presencia": // P0: quién mueve qué; no entra en las confirmaciones
        moviendo.set(m.de, { de: m.de, ref: m.ref, t: m.t, via }); break;
      case "ping": op.enviar({ k: "pong", de: op.yo.dispositivo, id: m.id, para: m.de, t: 0 }, via); break;
      case "pong": {
        const t0 = enVuelo.get(m.id);
        if (t0 !== undefined) {
          enVuelo.delete(m.id);
          muestrasLat.push(Math.max(0, op.reloj.horaLocal() - t0));
          if (muestrasLat.length > 64) muestrasLat.shift();
        }
        break;
      }
    }
  };

  const pararRecepcion = op.recibir(atender);

  return {
    anunciaOperacion(operacion, cambio, via) {
      // El instante de la operación es del reloj común, nunca del aparato local.
      const sellada: Operacion = { ...operacion, t: op.reloj.ahora() }; // y el elemento, de F3A
      const elemento = elementoDeOperacion(sellada, { ...cambio, operacion: sellada });
      op.enviar({ k: "confirma", de: op.yo.dispositivo, op: sellada, elemento }, via ?? null);
    },
    gesto(ref, valor, via) { op.enviar({ k: "gesto", de: op.yo.dispositivo, ref, valor, t: op.reloj.ahora() }, via ?? null); },
    presenciar(ref, via) { op.enviar({ k: "presencia", de: op.yo.dispositivo, ref, t: op.reloj.ahora() }, via ?? null); },
    medirPing(via) {
      const id = idNueva(), t0 = op.reloj.horaLocal();
      enVuelo.set(id, t0);
      op.enviar({ k: "ping", de: op.yo.dispositivo, id, t: t0 }, via ?? null);
      return id;
    },
    latencia() {
      if (muestrasLat.length < MUESTRAS_MIN_LATENCIA) return { medida: false, texto: "sin medir" };
      const s = [...muestrasLat].sort((a, b) => a - b);
      const en = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
      return { medida: true, p50Ms: en(0.5), p95Ms: en(0.95), muestras: s.length };
    },
    confirmaciones() { return [...confirmados]; },
    valores() { return { ...recibidos }; },
    quienMueve() { return [...moviendo.values()]; },
    moleculaFusionada(base) {
      const m = moleculaDesdeElementos(base, confirmados);
      const ultimo = confirmados.reduce((mx, e) => Math.max(mx, e.actualizadoEn), base.actualizadaEn);
      return { ...m, valores: { ...m.valores, ...recibidos }, actualizadaEn: ultimo };
    },
    estadoReloj() { return op.reloj.estado(); },
    textoEnlace() { return ultimoVia ? ultimoVia.etiqueta : "solo en este aparato"; },
    cerrar() { pararRecepcion(); },
  };
}

/** La forma del enlace, deducida de su fábrica. */
export type EnlaceSesion = ReturnType<typeof crearEnlaceSesion>;
