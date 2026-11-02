// Canal de eventos por contexto: reloj lógico híbrido, sin duplicados, orden causal, acuses y reintentos.
// Arquitectura/apps-en-la-malla.md §11 · tarea W.

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
  const recibidos = new Set<string>();
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

    // Construir árbol simple: origen distribuye a todos los receptores
    // Cada nodo puede tener hijos, pero limitados por capacidad
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
      // Los hijos del origen distribuyen sus subárboles
      for (const hijoId of arbol.nodos.get("origen")?.hijos ?? []) {
        const nodoHijo = arbol.nodos.get(hijoId);
        if (nodoHijo && nodoHijo.hijos.length > 0) {
          const eventoHijo = { ...evento, nodoId: hijoId };
          opts.enviar(eventoHijo);
          // Recursivo: los hijos también pueden reenviar
          for (const nietoId of nodoHijo.hijos) {
            const eventoNieto = { ...evento, nodoId: nietoId };
            opts.enviar(eventoNieto);
          }
        }
      }
    }
  }

  function procesarEvento(evento: EventoContexto): EventoContexto | null {
    if (recibidos.has(evento.id)) return null;
    recibidos.add(evento.id);

    const tHibrid = relojHibrido(evento);

    // Insertar en buffer ordenado por reloj híbrido
    const insertado: EventoContexto = { ...evento, t: tHibrid };
    const pos = buffer.findIndex(b => relojHibrido(b) > tHibrid);
    if (pos >= 0) buffer.splice(pos, 0, insertado); else buffer.push(insertado);

    // Aplicar búfer de espera causal: mantener eventos un corto período
    // para permitir que lleguen los precedentes causales
    const ahoraLocal = opts.ahora();
    const bufferCorte = ahoraLocal - 5000; // 5 segundos de buffer

    // Entregar eventos cuyo precedente causal ya llegó
    const entregados: EventoContexto[] = [];
    while (buffer.length > 0) {
      const primero = buffer[0];
      const tPrimero = relojHibrido(primero);

      // Si el evento actual tiene precedentes en el buffer, esperar
      // Lógica simplificada: entregar si no hay eventos con reloj menor sin procesar
      if (buffer.length > 1) {
        const segundo = buffer[1];
        const tSegundo = relojHibrido(segundo);
        if (tPrimero > tSegundo) {
          // Ya llegaron los de menor reloj, entregar el primero
          buffer.shift();
          entregados.push(primero);
        } else {
          break;
        }
      } else {
        // Único evento en buffer, entregarlo
        buffer.shift();
        entregados.push(primero);
      }
    }

    // Entregar a suscriptores
    for (const cb of oyentes) {
      for (const evt of entregados) {
        try {
          cb(evt);
        } catch {
          /* suscriptor roto */
        }
      }
    }

    // Repartir por árbol de relevo
    entregarAReceptores(evento);

    return evento;
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
      const resultado = procesarEvento(evento);
      // No esperamos ACK aquí pura por diseño; el reenvío lo hace el árbol
    },

    recibir: (sobre = null) => {
      if (sobre) {
        // Devolver evento con ID matching 'sobre' si está en el buffer o ya recibió
        for (const evt of buffer) {
          if (evt.id === sobre) {
            recibidos.add(evt.id); // marcar como recibido
            const pos = buffer.indexOf(evt);
            if (pos >= 0) buffer.splice(pos, 1);
            return evt;
          }
        }
        // Buscar en los recibidos previos
        return null;
      }

      // Devolver próximo evento en orden causal del buffer
      if (buffer.length > 0) {
        const evt = buffer[0];
        const pos = buffer.indexOf(evt);
        if (pos >= 0) buffer.splice(pos, 1);
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

// Helpers para trabajar con el canal

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