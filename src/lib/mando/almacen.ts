// Almacén del Mando (contrato §7): mismas tarjetas, Mac o Supabase, detrás de STARSEED_MANDO_TODOS=1.
import { validarTarea, type TareaOla, type EventoMando, type MensajeChat } from "./protocolo";

export type TipoAlmacen = "local" | "supabase" | "memoria";
export type ProgresoMando = Record<string, { estado: string; avance?: number }>;
export type OrdenMando = { tipo: "encolar" | "aprobar" | "frenar"; datos: unknown };
export type ResultadoOrden = { ok: boolean; motivo?: string };
const TIPOS_ORDEN = ["encolar", "aprobar", "frenar"] as const;

export interface AlmacenMando {
  tipo: TipoAlmacen;
  ambitoId: string;
  leerTareas(): Promise<TareaOla[]>;
  leerProgreso(): Promise<ProgresoMando>;
  leerEventos(desde?: string, limite?: number): Promise<EventoMando[]>;
  leerChat(canal: string, limite?: number): Promise<MensajeChat[]>;
  leerMedidores(): Promise<unknown | null>;
  encolarOrden(orden: OrdenMando): Promise<ResultadoOrden>;
}

export interface EstadoMandoInicial {
  tareas?: TareaOla[];
  progreso?: ProgresoMando;
  eventos?: EventoMando[];
  chat?: MensajeChat[];
  medidores?: unknown;
}

function validarOrden(orden: OrdenMando): ResultadoOrden {
  if (!orden || !TIPOS_ORDEN.includes(orden.tipo)) {
    return { ok: false, motivo: "tipo de orden inválido" };
  }
  if (typeof orden.datos !== "object" || orden.datos === null) {
    return { ok: false, motivo: "datos de orden inválidos" };
  }
  if (orden.tipo === "encolar") {
    const r = validarTarea(orden.datos);
    if (!r.ok) return { ok: false, motivo: r.errores.join("; ") };
  }
  return { ok: true };
}

const LIMITE_EVENTOS = 500;

export function crearAlmacenMemoria(inicial: EstadoMandoInicial = {}): AlmacenMando {
  const estado: Required<EstadoMandoInicial> = {
    tareas: [...(inicial.tareas ?? [])],
    progreso: { ...(inicial.progreso ?? {}) },
    eventos: [...(inicial.eventos ?? [])],
    chat: [...(inicial.chat ?? [])],
    medidores: inicial.medidores ?? null,
  };
  return {
    tipo: "memoria",
    ambitoId: "memoria",
    async leerTareas() { return [...estado.tareas]; },
    async leerProgreso() { return { ...estado.progreso }; },
    async leerEventos(desde?: string, limite?: number) {
      const t0 = desde !== undefined ? Number(desde) : Number.NEGATIVE_INFINITY;
      const hasta = Number.isFinite(t0) ? t0 : Number.NEGATIVE_INFINITY;
      let evs = estado.eventos.filter((e) => e.t >= hasta);
      const n = limite !== undefined && limite >= 0 ? Math.min(limite, LIMITE_EVENTOS) : LIMITE_EVENTOS;
      return evs.slice(-n);
    },
    async leerChat(canal: string, limite?: number) {
      const ms = estado.chat.filter((m) => m.canal === canal);
      return limite !== undefined && limite >= 0 ? ms.slice(-limite) : ms;
    },
    async leerMedidores() { return estado.medidores; },
    async encolarOrden(orden: OrdenMando) { return validarOrden(orden); },
  };
}

/** Lectores del Mando de la máquina, inyectados: nada se importa de disco aquí. */
export interface LectoresLocales {
  tareas?: () => TareaOla[] | Promise<TareaOla[]>;
  progreso?: () => ProgresoMando | Promise<ProgresoMando>;
  eventos?: (desde?: string, limite?: number) => EventoMando[] | Promise<EventoMando[]>;
  chat?: (canal: string, limite?: number) => MensajeChat[] | Promise<MensajeChat[]>;
  medidores?: () => unknown | Promise<unknown>;
  orden?: (orden: OrdenMando) => ResultadoOrden | Promise<ResultadoOrden>;
}

// Sin lector o lector roto: vacío, nunca lanza.
async function seguro<T>(fn: (() => T | Promise<T>) | undefined, vacio: T): Promise<T> {
  if (!fn) return vacio;
  try { return await fn(); } catch { return vacio; }
}

export function crearAlmacenLocal(lectores: LectoresLocales): AlmacenMando {
  return {
    tipo: "local",
    ambitoId: "local",
    leerTareas: () => seguro(lectores.tareas, []),
    leerProgreso: () => seguro(lectores.progreso, {}),
    leerEventos: (d?: string, n?: number) => seguro(lectores.eventos?.bind(null, d, n), []),
    leerChat: (c: string, n?: number) => seguro(lectores.chat?.bind(null, c, n), []),
    leerMedidores: () => seguro(lectores.medidores, null),
    encolarOrden: async (orden: OrdenMando) => {
      const v = validarOrden(orden);
      if (!v.ok) return v;
      if (!lectores.orden) return { ok: false, motivo: "sin lector de órdenes" };
      try { return await lectores.orden(orden); } catch { return { ok: false, motivo: "lector de órdenes falló" }; }
    },
  };
}

/** §1.10 / §7: sin bandera todo es local; con ella, local solo para la máquina propia. */
export function elegirAlmacen(opciones: {
  banderaTodos: boolean;
  esLocal: boolean;
  ambitoId?: string;
}): "local" | "supabase" {
  if (!opciones.banderaTodos) return "local";
  if (opciones.esLocal && (!opciones.ambitoId || opciones.ambitoId === "local")) return "local";
  return "supabase";
}
