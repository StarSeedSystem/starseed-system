import { Grafo4D, Nodo, Evento, anadirNodo, aplicarEvento } from './modelo';

export interface VentanaTiempo {
  t0: number;
  t1: number;
  contiene: (t: number) => boolean;
  duracion: () => number;
}

export function crearVentana(t0: number, t1: number): VentanaTiempo {
  if (t1 < t0) {
    throw new Error('t1 debe ser mayor o igual que t0');
  }
  return {
    t0,
    t1,
    contiene: (t: number) => t >= t0 && t <= t1,
    duracion: () => t1 - t0,
  };
}

export function filtrarPorVentana(eventos: Evento[], ventana: VentanaTiempo): Evento[] {
  return eventos.filter((e) => ventana.contiene(e.t));
}

export function grafoEnInstante(
  grafoInicial: Grafo4D,
  eventos: Evento[],
  instante: number
): Grafo4D {
  const grafo: Grafo4D = {
    nodos: new Map(grafoInicial.nodos),
    aristas: [...grafoInicial.aristas],
    ramas: new Map(grafoInicial.ramas),
  };

  const eventosOrdenados = [...eventos].sort((a, b) => a.t - b.t);

  for (const evento of eventosOrdenados) {
    if (evento.t > instante) break;
    if (!evento.es_arista) {
      aplicarEvento(grafo, evento);
    }
  }

  return grafo;
}

export type ReproductorEstado = 'pausado' | 'reproduciendo';

export interface Reproductor {
  estado: ReproductorEstado;
  velocidad: number;
  enVivo: boolean;
  tiempoActual: number;
}

export type ReproductorAccion =
  | { tipo: 'PLAY' }
  | { tipo: 'PAUSE' }
  | { tipo: 'SET_VELOCIDAD'; velocidad: number }
  | { tipo: 'TOGGLE_EN_VIVO' }
  | { tipo: 'SET_TIEMPO'; tiempo: number }
  | { tipo: 'RESET' };

export function crearReproductor(parcial?: Partial<Reproductor>): Reproductor {
  return {
    estado: 'pausado',
    velocidad: 1,
    enVivo: false,
    tiempoActual: 0,
    ...parcial,
  };
}

export function reducirReproductor(reproductor: Reproductor, accion: ReproductorAccion): Reproductor {
  switch (accion.tipo) {
    case 'PLAY':
      return { ...reproductor, estado: 'reproduciendo' };
    case 'PAUSE':
      return { ...reproductor, estado: 'pausado' };
    case 'SET_VELOCIDAD':
      return {
        ...reproductor,
        velocidad: Math.max(0.25, Math.min(64, accion.velocidad)),
      };
    case 'TOGGLE_EN_VIVO':
      return { ...reproductor, enVivo: !reproductor.enVivo };
    case 'SET_TIEMPO':
      return { ...reproductor, tiempoActual: Math.max(0, accion.tiempo) };
    case 'RESET':
      return crearReproductor();
    default:
      return reproductor;
  }
}

export interface BrilloConfig {
  umbralInactividadMs: number;
  factorEnfriamiento: number;
  brilloMinimo: number;
}

export function crearBrilloConfig(parcial?: Partial<BrilloConfig>): BrilloConfig {
  return {
    umbralInactividadMs: 1000 * 60 * 60 * 24,
    factorEnfriamiento: 0.95,
    brilloMinimo: 0.05,
    ...parcial,
  };
}

export function enfriarNodos(
  nodos: Map<string, Nodo>,
  ahora: number,
  config?: BrilloConfig
): Map<string, Nodo> {
  const cfg = config ?? crearBrilloConfig();
  const resultado = new Map<string, Nodo>();

  for (const [id, nodo] of nodos.entries()) {
    const inactividad = ahora - nodo.t_actividad;
    if (inactividad > cfg.umbralInactividadMs) {
      const ciclos = Math.floor(inactividad / cfg.umbralInactividadMs);
      let nuevoPeso = nodo.peso * Math.pow(cfg.factorEnfriamiento, ciclos);
      nuevoPeso = Math.max(cfg.brilloMinimo, nuevoPeso);
      resultado.set(id, { ...nodo, peso: nuevoPeso });
    } else {
      resultado.set(id, { ...nodo });
    }
  }

  return resultado;
}