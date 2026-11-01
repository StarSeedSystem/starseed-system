// eventos-contexto — canal de eventos de un contexto (architecture/apps-en-la-malla.md §11 · tarea W).
// Puro: transporte y hora común inyectados (`enviar`, `RelojComun.ahora`); `paso` hace correr el
// tiempo: acuses con reintentos crecientes y búfer corto ante huecos causales.

import { armarArbol, type ArbolRelevo, type ReceptorRelevo } from "./arbol-relevo";

/** Reloj lógico híbrido: milisegundos físicos comunes más contador para el mismo milisegundo. */
export interface InstanteHlc { fisico: number; logico: number }

export interface EventoContexto {
  id: string; tipo: string; cuerpo: unknown; origen: string; seq: number;
  /** Reloj híbrido de la emisión: orden total entre todos los eventos. */
  reloj: InstanteHlc;
  /** Cuántos eventos de cada nodo llevaba vistos el emisor (los propios: `seq − 1`). */
  causal: Record<string, number>;
}

export type MensajeCanal =
  | { clase: "evento"; evento: EventoContexto }
  | { clase: "acuse"; de: string; para: string; id: string };

export interface OpcionesCanal {
  nodoId: string;
  /** `enviar`: transporte inyectado (directo o por árbol de relevo); `ahora`: hora común (`RelojComun.ahora`). */
  enviar: (m: MensajeCanal) => void;
  ahora: () => number;
  /** `esperaMs`: búfer corto ante un hueco causal; `reintentoMs`, `topeReintentoMs` y `maxReintentos`: acuses. */
  esperaMs?: number;
  reintentoMs?: number;
  topeReintentoMs?: number;
  maxReintentos?: number;
}

export interface PendienteAcuse { evento: EventoContexto; esperas: number; proximo: number }
export interface EstadoCanal { entregados: EventoContexto[]; enEspera: EventoContexto[]; sinAcuse: PendienteAcuse[] }
export const TOPE_DIRECTO = 8;

/** Orden determinista por reloj híbrido; a igual reloj, por origen y por id. */
export const compararEventos = (a: EventoContexto, b: EventoContexto): number =>
  a.reloj.fisico - b.reloj.fisico || a.reloj.logico - b.reloj.logico ||
    (a.origen < b.origen ? -1 : a.origen > b.origen ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Nuestro tic: con la hora avanzada, el físico sube y el lógico se apaga; si no, sube el lógico. */
export function ticDeHlc(ultimo: InstanteHlc, ahoraMs: number): InstanteHlc {
  const f = Math.floor(ahoraMs);
  return f > ultimo.fisico ? { fisico: f, logico: 0 } : { fisico: ultimo.fisico, logico: ultimo.logico + 1 };
}

/** Al llegar un reloj ajeno: se adopta el mayor de los tres instantes y el empate se rompe lógicamente. */
export function integrarHlc(ultimo: InstanteHlc, ajeno: InstanteHlc, ahoraMs: number): InstanteHlc {
  const fisico = Math.max(ultimo.fisico, ajeno.fisico, Math.floor(ahoraMs));
  const propio = fisico === ultimo.fisico;
  const suyo = fisico === ajeno.fisico;
  const logico = propio && suyo ? Math.max(ultimo.logico, ajeno.logico) + 1
    : propio ? ultimo.logico + 1 : suyo ? ajeno.logico + 1 : 0;
  return { fisico, logico };
}

/** Reparto: hasta `TOPE_DIRECTO` receptores por enlace directo; a partir del siguiente, por árbol. */
export function reparto(origen: string, receptores: ReceptorRelevo[], kbpsFlujo = 0):
{ modo: "directo"; destinos: string[] } | { modo: "arbol"; arbol: ArbolRelevo } {
  if (receptores.length <= TOPE_DIRECTO) return { modo: "directo", destinos: receptores.map((r) => r.nodoId) };
  return { modo: "arbol", arbol: armarArbol(origen, receptores, kbpsFlujo) };
}

export function crearCanal(op: OpcionesCanal) {
  const esperaMs = op.esperaMs ?? 250, base = Math.max(1, op.reintentoMs ?? 150),
    tope = Math.max(base, op.topeReintentoMs ?? 2000), maxReintentos = Math.max(0, op.maxReintentos ?? 5);
  let ultimo: InstanteHlc = { fisico: 0, logico: 0 }, emitidos = 0;
  const vistos = new Set<string>(), vistasPorNodo = new Map<string, number>(),
    entregados: EventoContexto[] = [], pendientes = new Map<string, PendienteAcuse>();
  const enEspera: (EventoContexto & { recibidoEn: number })[] = [];

  // El orden causal lo cumple un evento cuando cada nodo de su vector ya entregó lo pedido; los listos salen ordenados por reloj híbrido.
  const soltar = (e: EventoContexto) => { enEspera.splice(enEspera.indexOf(e), 1); entregados.push(e); };
  const causales = (e: EventoContexto) =>
    Object.entries(e.causal).every(([n, s]) => (vistasPorNodo.get(n) ?? 0) >= s);
  const entregarListos = () => enEspera.filter(causales).sort(compararEventos).forEach(soltar);

  const emitir = (tipo: string, cuerpo: unknown): EventoContexto => {
    const causal: Record<string, number> = { [op.nodoId]: emitidos };
    for (const [n, s] of vistasPorNodo) if (n !== op.nodoId) causal[n] = s;
    ultimo = ticDeHlc(ultimo, op.ahora());
    const evento: EventoContexto = {
      id: `${op.nodoId}:${++emitidos}`, tipo, cuerpo, origen: op.nodoId, reloj: { ...ultimo }, seq: emitidos, causal,
    };
    vistos.add(evento.id); entregados.push(evento);
    // En espera del acuse de quien recibe; `paso` lo reenviará con espera creciente.
    if (maxReintentos > 0) pendientes.set(evento.id, { evento, esperas: 0, proximo: op.ahora() + base });
    op.enviar({ clase: "evento", evento });
    return evento;
  };

  const recibir = (m: MensajeCanal): void => {
    if (m.clase === "acuse") { pendientes.delete(m.id); return; }
    const e = m.evento;
    if (vistos.has(e.id)) return; // duplicado por id: ya está aquí
    vistos.add(e.id);
    vistasPorNodo.set(e.origen, (vistasPorNodo.get(e.origen) ?? 0) + 1);
    ultimo = integrarHlc(ultimo, e.reloj, op.ahora());
    op.enviar({ clase: "acuse", de: op.nodoId, para: e.origen, id: e.id });
    enEspera.push({ ...e, recibidoEn: op.ahora() }); entregarListos();
  };

  const paso = (): void => {
    const t = op.ahora();
    for (const p of [...pendientes.values()]) {
      if (t < p.proximo) continue;
      // Sin acuse tras agotar los reintentos: se suelta y queda en `sinAcuse`.
      if (p.esperas >= maxReintentos) { pendientes.delete(p.evento.id); continue; }
      p.esperas += 1; p.proximo = t + Math.min(tope, base * 2 ** p.esperas);
      op.enviar({ clase: "evento", evento: p.evento });
    }
    // El hueco causal que agota el búfer corto se entrega igualmente, ordenado por reloj híbrido.
    enEspera.filter((e) => t - e.recibidoEn >= esperaMs).sort(compararEventos).forEach(soltar);
  };

  return { emitir, recibir, paso, estado: (): EstadoCanal => ({ entregados, enEspera, sinAcuse: [...pendientes.values()] }) };
}
