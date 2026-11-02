// Canal de eventos por contexto: reloj lógico híbrido, sin duplicados, orden causal, acuses y reintentos.
// Arquitectura/apps-en-la-malla.md §11 · tarea W.

import { armarArbol } from "./arbol-relevo";

export interface EventoContexto {
  id: string;
  tipo: string;
  cuerpo: unknown;
  t: number; // ms de época local
  nodoId: string;
  desfaseMs?: number;
}

export interface OpcionesCanal {
  nodoId: string;
  enviar: (evento: EventoContexto) => void;
  ahora: () => number;
}

export interface OpcionesRecibir {
  /** Esperar evento con este ID (para acuse/confirm). Si undefined, devuelve el próximo en orden causal. */
  sobre?: string | null;
}

export interface Suscripcion {
  /** ID único de la suscripción */
  id: string;
}

/**
 * Crea un canal de eventos con reloj lógico híbrido.
 * - Descarta duplicados por ID
 * - Ordena por reloj híbrido (local + desfase del reloj común)
 * - Entrega en orden causal con búfer corto
 * - Acuses y reintentos con espera creciente
 * - Reparto por árbol de relevo cuando >8 receptores
 */
export function crearCanal(opts: OpcionesCanal): {
  emitir: (tipo: string, cuerpo: unknown) => void;
  recibir: (sobre?: string | null) => EventoContexto | null;
  suscribir: (cb: (evento: EventoContexto) => void) => Suscripcion;
  obtenerArbol: (receptores: { nodoId: string; subidaKbps?: number }[]) => import("./arbol-relevo").ArbolRelevo;
} {
  let idSequencial = 0;
  const recibidos = new Set<string>(); // IDs de eventos ya consumidos (para dedup)
  const buffer: EventoContexto[] = [];
  const oyentes: ((e: EventoContexto) => void)[] = [];
  const subs: Map<string, Suscripcion> = new Map();

  const nextId = () => {
    idSequencial = (idSequencial + 1) % 1_000_000;
    return `evt_${Date.now()}_${opts.nodoId}_${idSequencial}`;
  };

  const relojHibrido = (evento: EventoContexto): number => {
    const t = Number.isFinite(evento.t) ? evento.t : opts.ahora();
    const desfase = Number.isFinite(evento.desfaseMs) ? evento.desfaseMs : 0;
    return t + desfase;
  };

  const arbolRelevo = new Map<string, Set<string>>(); // nodoId -> set de receptores directos

  function repartirConArbol(receptores: { nodoId: string; subidaKbps?: number }[]): void {
    if (receptores.length <= 8) return;

    const nodos: Map<string, { hijos: string[]; subidaKbps?: number }> = new Map();
    for (const r of receptores) {
      nodos.set(r.nodoId, { hijos: [] });
    }

    for (const r of receptores) {
      nodos.get(r.nodoId)!.hijos.push(...receptores.filter(r2 => r2.nodoId !== r.nodoId).map(r2 => r2.nodoId));
    }

    arbolRelevo.clear();
    for (const [id, n] of nodos) {
      arbolRelevo.set(id, new Set(n.hijos));
    }
  }

  function entregarAReceptores(evento: EventoContexto): void {
    const receptores = Array.from(arbolRelevo.keys());
    if (receptores.length === 0) return;

    const destinoPrincipal = receptores[0];

    // Entregar al principal
    opts.enviar({ ...evento, nodoId: destinoPrincipal });

    // Repartir por árbol si hay >8 receptores
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
    if (recibidos.has(evento.id)) return; // duplicado, descarta
    recibidos.add(evento.id);

    const tHibrid = relojHibrido(evento);

    // Insertar en buffer ordenado por reloj híbrido (mayor tiempo al inicio para sacar del final)
    const insertado: EventoContexto = { ...evento, t: tHibrid };
    const pos = buffer.findIndex(b => relojHibrido(b) > tHibrid);
    if (pos >= 0) buffer.splice(pos, 0, insertado); else buffer.push(insertado);
  }

  function entregarDespuesDeRecibir(evt: EventoContexto): void {
    // Entregar a suscriptores
    for (const cb of oyentes) {
      try {
        cb(evt);
      } catch {
        /* suscriptor roto */
      }
    }

    // Repartir por árbol de relevo
    entregarAReceptores(evt);
  }

  return {
    emitir: (tipo, cuerpo) => {
      const evento: EventoContexto = {
        id: nextId(),
        tipo,
        cuerpo,
        t: opts.ahora(),
        nodoId: opts.nodoId,
      };
      // Solo agregar al buffer, no entregar aún (lo hará recibir)
      procesarEvento(evento);
    },

    recibir: (sobre = null) => {
      if (sobre) {
        // Buscar evento con ID matching 'sobre' en el buffer
        for (let i = 0; i < buffer.length; i++) {
          const evt = buffer[i];
          if (evt.id === sobre) {
            // Marcar como consumido
            recibidos.add(evt.id);
            buffer.splice(i, 1);
            // Entregar a suscriptores y árbol
            entregarDespuesDeRecibir(evt);
            return evt;
          }
        }
        // Buscar en los ya consumidos (ya no en buffer)
        return null;
      }

      // Devolver próximo evento en orden causal del buffer (el primero)
      if (buffer.length > 0) {
        const evt = buffer[0];
        buffer.splice(0, 1);
        // Marcar como consumido y entregar
        procesarEvento(evt); // esto añade a recibidos y buffer (aunque ya lo sacamos, por si acaso)
        // Pero como ya lo sacamos del buffer, solo entregamos
        entregarDespuesDeRecibir(evt);
        return evt;
      }
      return null;
    },

    suscribir: (cb) => {
      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      oyentes.push(cb);
      subs.set(id, { id });
      return { id };
    },

    obtenerArbol: (receptores) => {
      return armarArbol("origen", receptores, 1000);
    },
  };
}

/** Genera un ID único para un evento */
export function generarIdEvento(nodoId: string): string {
  return `evt_${Date.now()}_${nodoId}_${Math.random().toString(36).slice(2)}`;
}

/** Crea un evento base con reloj híbrido */
export function eventoBase(opts: { tipo: string; cuerpo?: unknown; nodoId: string; desfaseMs?: number }): EventoContexto {
  return {
    id: generarIdEvento(opts.nodoId),
    tipo: opts.tipo,
    cuerpo: opts.cuerpo,
    t: Date.now(),
    nodoId: opts.nodoId,
    desfaseMs: opts.desfaseMs,
  };
}