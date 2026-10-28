/**
 * Estado del Mausbot de Astraura desde los medios de Astraura (contrato
 * `architecture/mausbot-astraura.md` §2 y §6): la orbe sigue el mismo bus que la
 * orbe cuántica, un bot/agente que actúa lo pone a trabajar y el orgullo le dura
 * un rato; el silencio le da siesta y sueño. Lógica TEMPORAL PURA, separada del
 * bus real, para poder probarla con relojes falsos. Sin `node:*`.
 */
import { onQuantumOrbState, type QuantumOrbVoiceState } from "@/lib/aurora/quantum-orb-bus";
import { estadoDesdeOrbe, type EstadoMausbot } from "./expresiones";

/** El estado vivo del Mausbot en un instante dado. */
export interface EstadoVivoMausbot {
  orbe: EstadoMausbot;
  trabajando: boolean;
  orgulloHasta: number;
  ultimaActividad: number;
}
/** Acción de un bot/agente: empezó («inicio») o acabó («fin»). */
export type AccionAgente = "inicio" | "fin";
/** Lo que puede pasarle al Mausbot. */
export type EventoEstadoMausbot =
  | { tipo: "orbe"; voz: QuantumOrbVoiceState }
  | { tipo: "accion"; accion: AccionAgente }
  | { tipo: "tic" };

/** Tiempo sin nada tras el cual se da la siesta. */
export const MS_SOMNOLIENCIA = 120_000;
/** Tiempo sin nada tras el cual se duerme del todo. */
export const MS_DORMIDO = 600_000;
/** Cuánto dura el orgullo al terminar una acción. */
export const MS_ORGULLO = 1_500;
/** Cada cuánto mira el reloj la suscripción (pocas y gruesas, sin sondeos en bucle). */
export const TIC_ESTADO_MS = 15_000;

/** Aplica un evento al estado vivo, con la hora falsa o real del instante. */
export function reducirEstado(v: EstadoVivoMausbot, ev: EventoEstadoMausbot, ahora: number): EstadoVivoMausbot {
  if (ev.tipo === "orbe") {
    return { orbe: estadoDesdeOrbe(ev.voz), trabajando: v.trabajando, orgulloHasta: v.orgulloHasta, ultimaActividad: ahora };
  }
  if (ev.tipo === "accion") {
    if (ev.accion === "inicio") return { ...v, trabajando: true, ultimaActividad: ahora };
    return { ...v, trabajando: false, orgulloHasta: ahora + MS_ORGULLO, ultimaActividad: ahora };
  }
  return v;
}

/**
 * La expresión que toca en este instante: durante la acción manda «working»,
 * al acabar «proud» su rato, tras el silencio la siesta y el sueño, y bajo todo
 * eso la expresión que pidió la orbe.
 */
export function expresionAhora(v: EstadoVivoMausbot, ahora: number): EstadoMausbot {
  if (v.trabajando) return "working";
  if (ahora < v.orgulloHasta) return "proud";
  const silencio = ahora - v.ultimaActividad;
  if (silencio >= MS_DORMIDO) return "sleeping";
  if (silencio >= MS_SOMNOLIENCIA) return "drowsy";
  return v.orbe;
}

// ── Bus de acciones de agente (`onAccionAgente`) ─────────────────────────────

type OyenteAccion = (accion: AccionAgente) => void;
const OYENTES = new Set<OyenteAccion>();

/** Suscribe a las acciones de los bots y agentes; devuelve la función de baja. */
export const onAccionAgente = (cb: OyenteAccion): (() => void) => {
  OYENTES.add(cb);
  return () => { OYENTES.delete(cb); };
};
/** Publica que un bot/agente empezó o acabó una acción. Nunca lanza. */
export const emitirAccionAgente = (accion: AccionAgente): void => {
  for (const cb of Array.from(OYENTES)) { try { cb(accion); } catch { /* un oyente roto no tira el bus */ } }
};

/** Suscribe la expresión del Mausbot: orbe + acciones + siesta por silencio. */
export function suscribirEstadoMausbot(cb: (estado: EstadoMausbot) => void): () => void {
  const inicio = Date.now();
  let vivo: EstadoVivoMausbot = { orbe: "idle", trabajando: false, orgulloHasta: 0, ultimaActividad: inicio };
  let ultimo: EstadoMausbot | "" = "";
  const aviso = () => {
    const estado = expresionAhora(vivo, Date.now());
    if (estado !== ultimo) { ultimo = estado; cb(estado); }
  };
  const aplicar = (ev: EventoEstadoMausbot) => {
    vivo = reducirEstado(vivo, ev, Date.now());
    aviso();
  };
  aviso();
  const quitarOrbe = onQuantumOrbState((voz) => aplicar({ tipo: "orbe", voz }));
  const quitarAccion = onAccionAgente((accion) => aplicar({ tipo: "accion", accion }));
  /** El orgullo se descolga a tiempo, sin esperar el tic grueso. */
  const descolgarOrgullo = setTimeout(aviso, MS_ORGULLO + 20);
  const tic = setInterval(aviso, TIC_ESTADO_MS);
  return () => {
    quitarOrbe();
    quitarAccion();
    clearTimeout(descolgarOrgullo);
    clearInterval(tic);
  };
}
