/*
 * servir-capacidades — lado ANFITRIÓN del relé `capacidad.*` (Ola 1017A, tarea F).
 * Comprueba la sesión de préstamo (`sesion-prestamo.ts`) y los topes de
 * `capacidadPrestable` (`oferta.ts`), encola si está lleno (máx. 4), corre el
 * manejador, trocea la respuesta y permite cancelar. Anota cada préstamo (quién,
 * qué, ms, bytes). Puro: ni red, ni disco; el reloj llega inyectado en `ahora`.
 */

import {
  bytesUtf8, esMensajeCapacidadMalla, esTipoCapacidadValido, partirEnTrozos,
  parseCapacidadMallaMensaje, CAPACIDAD_MALLA_MAX_BYTES,
  type Msg, type MsgFin, type MsgTrozo, type TipoCapacidad,
} from "../network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";

export type ManejadorCapacidad = (cuerpo: Record<string, unknown>, contexto: { sesion: Sesion; cancelada: () => boolean }) => unknown;

export type EstadoPrestamo = "encolado" | "activo" | "hecho" | "cancelado" | "error";

export interface Prestamo {
  id: string; tipo: TipoCapacidad; invitado: string;
  inicioMs: number; finMs: number; ms: number; bytes: number; estado: EstadoPrestamo;
}

export interface ResultadoAtencion { mensajes: Msg[]; prestamo: Prestamo | null; }

export interface OpcionesServidor {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona; sesiones: Sesion[]; ahora: () => number; maxConcurrentes?: number;
}

const TROZO_MAX_BYTES = CAPACIDAD_MALLA_MAX_BYTES - 256;
export const MAX_COLA = 4;

/** Mínimos reales que cada capacidad exige del préstamo (no de la máquina). */
const REQUISITOS: Record<TipoCapacidad, { nucleos: number; ramMb: number; gpu?: boolean }> = {
  imagen: { nucleos: 1, ramMb: 256 }, voz: { nucleos: 1, ramMb: 256 },
  oido: { nucleos: 1, ramMb: 128 }, palabra: { nucleos: 1, ramMb: 128 },
  transcodificar: { nucleos: 2, ramMb: 512 }, render: { nucleos: 2, ramMb: 512, gpu: true },
  buscar: { nucleos: 1, ramMb: 128 }, construir: { nucleos: 2, ramMb: 512 },
};

type RegistroPrestamo = Prestamo & { cancelada: boolean; cuerpo: Record<string, unknown>; sesion: Sesion };

const rechazo = (id: string, estado: number, mensaje: string): ResultadoAtencion => ({ mensajes: [{ t: "capacidad.error", id, estado, mensaje }], prestamo: null });

export function crearServidor({ manejadores, oferta, sesiones, ahora, maxConcurrentes = 1 }: OpcionesServidor) {
  const prestamos: RegistroPrestamo[] = [];
  const resolvers = new Map<string, (r: ResultadoAtencion) => void>();
  const cola: string[] = [];
  let activos = 0;
  const buscar = (id: string): RegistroPrestamo | undefined => prestamos.find((p) => p.id === id);
  const limpio = (p: RegistroPrestamo): Prestamo => ({ id: p.id, tipo: p.tipo, invitado: p.invitado, inicioMs: p.inicioMs, finMs: p.finMs, ms: p.ms, bytes: p.bytes, estado: p.estado });
  const terminar = (p: RegistroPrestamo, mensajes: Msg[], estado: EstadoPrestamo): void => {
    if (p.estado !== "encolado" && p.estado !== "activo") return;
    const estabaActivo = p.estado === "activo";
    p.estado = p.cancelada ? "cancelado" : estado;
    p.finMs = ahora(); p.ms = p.finMs - p.inicioMs;
    resolvers.get(p.id)?.({ mensajes: p.cancelada ? [] : mensajes, prestamo: limpio(p) });
    resolvers.delete(p.id);
    if (estabaActivo) { activos--; const siguiente = cola.shift(); if (siguiente) iniciar(siguiente); }
  };
  const correr = async (s: RegistroPrestamo): Promise<void> => {
    try {
      const resultado = await manejadores[s.tipo]!(s.cuerpo, { sesion: s.sesion, cancelada: () => s.cancelada });
      const json = JSON.stringify(resultado ?? null);
      s.bytes = bytesUtf8(json);
      const fin: MsgFin = { t: "capacidad.fin", id: s.id, resultado };
      const trozos = partirEnTrozos(json, TROZO_MAX_BYTES)
        .map((texto): MsgTrozo => ({ t: "capacidad.trozo", id: s.id, texto }));
      terminar(s, [...trozos, fin], "hecho");
    } catch (e) { terminar(s, [{ t: "capacidad.error", id: s.id, estado: 500, mensaje: e instanceof Error ? e.message : "Error al servir la capacidad." }], "error"); }
  };
  const iniciar = (id: string): void => {
    const s = buscar(id);
    if (!s || s.estado !== "encolado" || !manejadores[s.tipo]) return;
    s.estado = "activo"; activos++; void correr(s);
  };
  const cancelar = (id: string): ResultadoAtencion => {
    const p = buscar(id);
    if (!p || (p.estado !== "encolado" && p.estado !== "activo")) return { mensajes: [], prestamo: null };
    p.cancelada = true;
    if (p.estado === "activo") return { mensajes: [], prestamo: limpio(p) };
    const i = cola.indexOf(id); if (i >= 0) cola.splice(i, 1);
    terminar(p, [], "cancelado"); return { mensajes: [], prestamo: limpio(p) };
  };
  const atender = (mensaje: unknown): Promise<ResultadoAtencion> => {
    const msg: unknown = typeof mensaje === "string" ? parseCapacidadMallaMensaje(mensaje) : mensaje;
    const nulo = (): ResultadoAtencion => ({ mensajes: [], prestamo: null });
    if (!esMensajeCapacidadMalla(msg)) return Promise.resolve(nulo());
    if (msg.t === "capacidad.cancelar") return Promise.resolve(cancelar(msg.id));
    if (msg.t !== "capacidad.pedir") return Promise.resolve(nulo());
    const sesion = sesiones.find((s) => s.id === msg.sesionId);
    if (!sesion || sesion.anfitrion !== oferta.nodoId || !permitido(sesion, "atender", ahora()))
      return Promise.resolve(rechazo(msg.id, 401, "Sesión de préstamo inválida o expirada."));
    if (!esTipoCapacidadValido(msg.tipo)) return Promise.resolve(rechazo(msg.id, 404, "Tipo de capacidad desconocido."));
    if (!manejadores[msg.tipo]) return Promise.resolve(rechazo(msg.id, 501, "Esta neurona no sirve esa capacidad."));
    const requ = REQUISITOS[msg.tipo];
    const c = capacidadPrestable(oferta).computo;
    if (c.nucleos < requ.nucleos || c.ramLibreMb < requ.ramMb || (requ.gpu && !c.gpu))
      return Promise.resolve(rechazo(msg.id, 403, "Tope de préstamo agotado en esta neurona."));
    if (activos >= maxConcurrentes && cola.length >= MAX_COLA)
      return Promise.resolve(rechazo(msg.id, 429, "Cola llena: prueba más tarde."));
    const registro: RegistroPrestamo = { id: msg.id, tipo: msg.tipo, invitado: sesion.invitado, inicioMs: ahora(), finMs: 0, ms: 0, bytes: 0, estado: "encolado", cancelada: false, cuerpo: msg.cuerpo, sesion };
    prestamos.push(registro);
    return new Promise<ResultadoAtencion>((resolucion) => {
      resolvers.set(msg.id, resolucion);
      if (activos < maxConcurrentes) iniciar(msg.id); else cola.push(msg.id);
    });
  };
  return {
    atender,
    cancelar,
    prestamos: (): { vivos: Prestamo[]; hechos: Prestamo[] } => ({
      vivos: prestamos.filter((p) => p.estado === "encolado" || p.estado === "activo").map((p) => ({ ...limpio(p), ms: ahora() - p.inicioMs })),
      hechos: prestamos.filter((p) => p.estado === "hecho" || p.estado === "cancelado" || p.estado === "error").map(limpio),
    }),
  };
}
