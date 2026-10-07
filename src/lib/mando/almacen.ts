import { validarTarea, type EventoMando, type MensajeChat, type TareaOla } from "./protocolo";
export type TipoAlmacen = "local" | "supabase" | "memoria";
export type ProgresoMando = Record<string, { estado: string; avance?: number }>;
export type OrdenMando = { tipo: "encolar" | "aprobar" | "frenar"; datos: unknown };
export type ResultadoOrden = { ok: boolean; motivo?: string };
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
  tareas?: TareaOla[]; progreso?: ProgresoMando;
  eventos?: EventoMando[]; chat?: MensajeChat[];
  medidores?: unknown;
}
export interface LectoresLocales {
  tareas?: () => TareaOla[] | Promise<TareaOla[]>;
  progreso?: () => ProgresoMando | Promise<ProgresoMando>;
  eventos?: (desde?: string, limite?: number) => EventoMando[] | Promise<EventoMando[]>;
  chat?: (canal: string, limite?: number) => MensajeChat[] | Promise<MensajeChat[]>;
  medidores?: () => unknown | Promise<unknown>;
  orden?: (orden: OrdenMando) => ResultadoOrden | Promise<ResultadoOrden>;
}
const TIPOS_ORDEN: readonly string[] = ["encolar", "aprobar", "frenar"];
function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
function revisarOrden(orden: unknown): ResultadoOrden & { tarea?: TareaOla } {
  if (!esRegistro(orden) || typeof orden.tipo !== "string" || !TIPOS_ORDEN.includes(orden.tipo)) {
    return { ok: false, motivo: "tipo de orden inválido" };
  }
  if (!esRegistro(orden.datos)) return { ok: false, motivo: "datos de orden inválidos" };
  if (orden.tipo !== "encolar") return { ok: true };
  const validacion = validarTarea(orden.datos);
  if (!validacion.ok || !validacion.valor) {
    return { ok: false, motivo: validacion.errores.join("; ") };
  }
  return { ok: true, tarea: validacion.valor };
}
function ultimos<T>(valores: T[], limite?: number): T[] {
  if (limite === undefined) return [...valores];
  if (!Number.isFinite(limite)) return [];
  const cantidad = Math.max(0, Math.trunc(limite));
  return cantidad === 0 ? [] : valores.slice(-cantidad);
}
function inicio(desde?: string): number {
  if (desde === undefined || desde.trim() === "") return Number.NEGATIVE_INFINITY;
  const numero = Number(desde);
  if (Number.isFinite(numero)) return numero;
  const fecha = Date.parse(desde);
  return Number.isFinite(fecha) ? fecha : Number.NEGATIVE_INFINITY;
}
export function crearAlmacenMemoria(inicial: EstadoMandoInicial = {}): AlmacenMando {
  const estado = {
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
    async leerEventos(desde, limite) {
      return ultimos(estado.eventos.filter((evento) => evento.t >= inicio(desde)), limite);
    },
    async leerChat(canal, limite) {
      return ultimos(estado.chat.filter((mensaje) => mensaje.canal === canal), limite);
    },
    async leerMedidores() { return estado.medidores; },
    async encolarOrden(orden) {
      const resultado = revisarOrden(orden);
      if (resultado.ok && resultado.tarea) estado.tareas.push(resultado.tarea);
      return resultado.ok ? { ok: true } : { ok: false, motivo: resultado.motivo };
    },
  };
}

async function seguro<T>(lector: (() => T | Promise<T>) | undefined, vacio: T): Promise<T> {
  if (!lector) return vacio;
  try { return await lector(); } catch { return vacio; }
}

export function crearAlmacenLocal(lectores: LectoresLocales): AlmacenMando {
  return {
    tipo: "local",
    ambitoId: "local",
    leerTareas: () => seguro(lectores.tareas, []),
    leerProgreso: () => seguro(lectores.progreso, {}),
    leerEventos: (desde, limite) => seguro(lectores.eventos?.bind(null, desde, limite), []),
    leerChat: (canal, limite) => seguro(lectores.chat?.bind(null, canal, limite), []),
    leerMedidores: () => seguro(lectores.medidores, null),
    async encolarOrden(orden) {
      const resultado = revisarOrden(orden);
      if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
      if (!lectores.orden) return { ok: false, motivo: "sin lector de órdenes" };
      return seguro(
        () => lectores.orden?.(orden) ?? { ok: false, motivo: "sin lector de órdenes" },
        { ok: false, motivo: "lector de órdenes falló" },
      );
    },
  };
}

export function elegirAlmacen(
  opciones: { banderaTodos: boolean; esLocal: boolean; ambitoId?: string },
): "local" | "supabase" {
  if (!opciones.banderaTodos) return "local";
  if (opciones.esLocal && (!opciones.ambitoId || opciones.ambitoId === "local")) return "local";
  return "supabase";
}
