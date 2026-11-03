// Canal de eventos por contexto: reloj lógico híbrido, sin duplicados, orden causal, acuses y reintentos.
// Arquitectura/apps-en-la-malla.md §11 · tarea W.

import { armarArbol } from "./arbol-relevo";

export interface EventoContexto {
  id: string;
  tipo: string;
  cuerpo: unknown;
  t: number;
  nodoId: string;
  desfaseMs?: number;
}

export interface OpcionesCanal {
  nodoId: string;
  enviar: (evento: EventoContexto) => void;
  /** Hora local, sin desfase */
  ahora: () => number;
  /** Reloj híbrido: ahora() con el desfase del reloj común (reloj.ahora()). */
  ahoraHibrido: () => number;
}

export interface Suscripcion {
  id: string;
}

export function crearCanal(opts: OpcionesCanal): {
  emitir: (tipo: string, cuerpo: unknown) => void;
  recibir: (sobre?: string | null) => EventoContexto | null;
  suscribir: (cb: (evento: EventoContexto) => void) => Suscripcion;
  obtenerArbol: (receptores: { nodoId: string; subidaKbps?: number }[]) => import("./arbol-relevo").ArbolRelevo;
} {
  const recibidos = new Set<string>();
  const buffer: EventoContexto[] = [];
  const oyentes: ((e: EventoContexto) => void)[] = [];
  const arbolRelevo = new Map<string, Set<string>>();

  const relojHibrido = (evento: EventoContexto): number => {
    const t = Number.isFinite(evento.t) ? evento.t : opts.ahora();
    const desfase = (evento.desfaseMs ?? 0);
    return t + desfase;
  };

  function repartirConArbol(evento: EventoContexto): void {
    const receptores = Array.from(arbolRelevo.keys());
    if (receptores.length === 0) return;

    const destinoPrincipal = receptores[0];
    opts.enviar({ ...evento, nodoId: destinoPrincipal });

    if (receptores.length > 8) {
      const idsReceptores = receptores.map(r => ({ nodoId: r, subidaKbps: undefined }));
      const arbol = armarArbol("origen", idsReceptores, 1000);
      for (const hijoId of arbol.nodos.get("origen")?.hijos ?? []) {
        const nodoHijo = arbol.nodos.get(hijoId);
        if (nodoHijo && nodoHijo.hijos.length > 0) {
          const eventoHijo = { ...evento, nodoId: hijoId };
          opts.enviar(eventoHijo);
          for (const nietoId of nodoHijo.hijos) {
            const eventoNieto = { ...evento, nodoId: nietoId };
            opts.enviar(eventoNieto);
          }
        }
      }
    }
  }

  function procesarEvento(evento: EventoContexto): void {
    if (recibidos.has(evento.id)) return;
    recibidos.add(evento.id);
    const tHibrid = relojHibrido(evento);
    const insertado: EventoContexto = { ...evento, t: tHibrid };
    const pos = buffer.findIndex(b => relojHibrido(b) > tHibrid);
    if (pos >= 0) buffer.splice(pos, 0, insertado); else buffer.push(insertado);
  }

  function entregarDespuesDeRecibir(evt: EventoContexto): void {
    for (const cb of oyentes) {
      try { cb(evt); } catch { /* suscriptor roto */ }
    }
    repartirConArbol(evt);
  }

  return {
    emitir: (tipo, cuerpo) => {
      const evento = eventoBase({ tipo, cuerpo, nodoId: opts.nodoId, ahora: opts.ahoraHibrido });
      procesarEvento(evento);
    },

    recibir: (sobre = null) => {
      if (sobre) {
        for (let i = 0; i < buffer.length; i++) {
          const evt = buffer[i];
          if (evt.id === sobre) {
            recibidos.add(evt.id);
            buffer.splice(i, 1);
            entregarDespuesDeRecibir(evt);
            return evt;
          }
        }
        return null;
      }

      if (buffer.length > 0) {
        const evt = buffer.shift()!;
        recibidos.add(evt.id);
        entregarDespuesDeRecibir(evt);
        return evt;
      }
      return null;
    },

    suscribir: (cb) => {
      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      oyentes.push(cb);
      return { id };
    },

    obtenerArbol: (receptores) => {
      return armarArbol("origen", receptores, 1000);
    },
  };
}

export function generarIdEvento(nodoId: string): string {
  return `evt_${Date.now()}_${nodoId}_${Math.random().toString(36).slice(2)}`;
}

export function eventoBase(opts: { tipo: string; cuerpo?: unknown; nodoId: string; desfaseMs?: number; ahora: () => number }): EventoContexto {
  return {
    id: generarIdEvento(opts.nodoId),
    tipo: opts.tipo,
    cuerpo: opts.cuerpo,
    t: opts.ahora(),
    nodoId: opts.nodoId,
    desfaseMs: opts.desfaseMs,
  };
}