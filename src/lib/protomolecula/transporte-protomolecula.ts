/**
 * transporte-protomolecula — enlace de sesión P2P (PM1010F3B, contrato §6 y §11.1).
 * PURO: red, reloj y recepción INYECTADOS (cableado: `malla/transporte-universal.ts`
 * `enviarMensaje`/`alRecibirMensaje` sobre el canal «protomolecula»). Gesto efímero P0
 * nunca se guarda; confirmación = `Operacion` + `ElementoSala` (elementoDeOperacion).
 * El `t` sale del reloj común de estaciones (precisión solo con muestras).
 */
import type { Cambio, Operacion, Sesion } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import { elementoDeOperacion } from "./sesion-sincronia";

export const CANAL_PROTO = "protomolecula";
/** Mínimo de muestras ida y vuelta para dar p50/p95; con menos, «sin medir» (§6.3). */
export const MIN_MUESTRAS_LATENCIA = 5;
const MAX_MUESTRAS = 128;

export interface RelojComun {
  /** Hora común (ms), con el desfase estimado ya aplicado. */
  ahora(): number;
  /** Sin muestras, `precisionMs` es null: no se inventa precisión. */
  estado(): EstadoReloj;
}

type MensajeProto =
  | { v: 1; t: "op"; op: Operacion; cambio: Cambio; elemento: ElementoSala }
  | { v: 1; t: "gesto"; elemento: ElementoSala }
  | { v: 1; t: "presencia"; de: string; mueve: string[] }
  | { v: 1; t: "ping"; id: string; t0: number }
  | { v: 1; t: "pong"; id: string; t0: number; t1: number };

export interface DependenciasEnlace {
  sesion: Sesion;
  /** Envía un texto por el enlace que sea (malla, relé…). Inyectado. */
  enviar: (texto: string) => boolean;
  /** Suscripción a lo que llega por el mismo camino. */
  recibir: (cb: (texto: string) => void) => () => void;
  reloj: RelojComun;
  dispositivo: string;
  /** Etiqueta en claro del enlace; sin enlace: «solo en este aparato». */
  etiquetaEnlace: string;
  alOperacion?: (op: Operacion, cambio: Cambio, elemento: ElementoSala) => void;
  alGesto?: (elemento: ElementoSala) => void;
  alPresencia?: (de: string, mueve: string[]) => void;
}

export interface LatenciaEnlace {
  enlace: string;
  /** Mediana y percentil 95 de ida y vuelta (ms); null con muestras de menos. */
  p50Ms: number | null;
  p95Ms: number | null;
  muestras: number;
}

export interface EnlaceSesion {
  /** Manda una confirmación completa, siempre convertida a elemento P1. */
  confirmar(op: Operacion, cambio: Cambio): boolean;
  /** Manda un gesto efímero (P0): se enseña, no se guarda. */
  gesto(elemento: ElementoSala): boolean;
  /** Presencia: qué claves está moviendo este dispositivo. */
  presencia(mueve: string[]): boolean;
  /** Lanza una ronda de latencia por ping/pong. */
  ping(): boolean;
  latencia(): LatenciaEnlace;
  describirLatencia(): string;
  precisionReloj(): string;
  /** Confirmaciones recibidas (los gestos jamás entran aquí). */
  elementosRecibidos(): ElementoSala[];
  cerrar(): void;
}

/** El `t` de una operación SIEMPRE sale del reloj común, nunca del reloj local. */
export function estamparOperacion(op: Operacion, reloj: RelojComun): Operacion {
  return { ...op, t: reloj.ahora() };
}

export function crearEnlaceSesion(deps: DependenciasEnlace): EnlaceSesion {
  const muestrasRtt: number[] = [];
  const recibidos = new Map<string, ElementoSala>();
  let ronda = 0;
  let vivo = true;

  const mandar = (m: MensajeProto): boolean => {
    if (!vivo) return false;
    try {
      return deps.enviar(JSON.stringify(m));
    } catch {
      return false;
    }
  };

  const guardarSiMejor = (e: ElementoSala): void => {
    const previa = recibidos.get(e.id);
    if (!previa || e.actualizadoEn >= previa.actualizadoEn) recibidos.set(e.id, e);
  };

  const alLlegar = (texto: string): void => {
    if (!vivo || typeof texto !== "string") return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!m || typeof m !== "object" || m.v !== 1) return;
    if (m.t === "op") {
      const op = m.op as Operacion | undefined;
      const cambio = m.cambio as Cambio | undefined;
      const el = m.elemento as ElementoSala | undefined;
      if (!op || !cambio || !el || typeof el.id !== "string" || el.tipo !== "parametro") return;
      guardarSiMejor(el);
      deps.alOperacion?.(op, cambio, el);
    } else if (m.t === "gesto") {
      // efímero: se enseña y se suelta; jamás entra en los elementos guardados
      const el = m.elemento as ElementoSala | undefined;
      if (el && typeof el.id === "string") deps.alGesto?.(el);
    } else if (m.t === "presencia") {
      if (typeof m.de !== "string" || !Array.isArray(m.mueve)) return;
      deps.alPresencia?.(m.de, m.mueve.filter((x) => typeof x === "string") as string[]);
    } else if (m.t === "ping") {
      if (typeof m.id === "string" && typeof m.t0 === "number") {
        mandar({ v: 1, t: "pong", id: m.id, t0: m.t0, t1: deps.reloj.ahora() });
      }
    } else if (m.t === "pong") {
      if (typeof m.id !== "string" || typeof m.t0 !== "number") return;
      const rtt = deps.reloj.ahora() - m.t0;
      if (Number.isFinite(rtt) && rtt >= 0) {
        muestrasRtt.push(rtt);
        if (muestrasRtt.length > MAX_MUESTRAS) muestrasRtt.shift();
      }
    }
  };
  const dejarDeRecibir = deps.recibir(alLlegar);

  const percentiles = (): [number, number] => {
    const orden = [...muestrasRtt].sort((a, b) => a - b);
    return [orden[Math.floor(orden.length / 2)], orden[Math.floor(orden.length * 0.95)] ?? orden[orden.length - 1]];
  };

  return {
    confirmar(op, cambio) {
      return mandar({ v: 1, t: "op", op, cambio, elemento: elementoDeOperacion(op, cambio) });
    },
    gesto(elemento) {
      return mandar({ v: 1, t: "gesto", elemento });
    },
    presencia(mueve) {
      return mandar({ v: 1, t: "presencia", de: deps.dispositivo, mueve });
    },
    ping() {
      ronda += 1;
      return mandar({ v: 1, t: "ping", id: `${deps.dispositivo}:${ronda}`, t0: deps.reloj.ahora() });
    },
    latencia() {
      const l = muestrasRtt.length;
      if (l < MIN_MUESTRAS_LATENCIA) return { enlace: deps.etiquetaEnlace, p50Ms: null, p95Ms: null, muestras: l };
      const [p50, p95] = percentiles();
      return { enlace: deps.etiquetaEnlace, p50Ms: p50, p95Ms: p95, muestras: l };
    },
    describirLatencia() {
      const l = muestrasRtt.length;
      if (l < MIN_MUESTRAS_LATENCIA) return `sin medir — hacen falta ${MIN_MUESTRAS_LATENCIA} muestras y hay ${l}`;
      const [p50, p95] = percentiles();
      return `${Math.round(p50)} ms (p95 ${Math.round(p95)} ms) por ${deps.etiquetaEnlace}`;
    },
    precisionReloj() {
      const e = deps.reloj.estado();
      if (e.precisionMs == null) return `reloj común sin muestras de ${e.muestras} → precisión desconocida`;
      const cota = e.cotaMs == null ? "s/c" : `±${e.cotaMs} ms`;
      return `reloj común ±${e.precisionMs} ms (cota ${cota}, ${e.muestras} muestras)`;
    },
    elementosRecibidos() {
      return Array.from(recibidos.values());
    },
    cerrar() {
      vivo = false;
      dejarDeRecibir();
    },
  };
}
