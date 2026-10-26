/**
 * servir-capacidades — lado anfitrión del relé `capacidad.*` (Ola 1017A, Apps en la malla).
 * Admite peticiones revisando la sesión de préstamo (sesion-prestamo.ts) y los topes de
 * `capacidadPrestable`, encola cuando está completo (máx. 4 en cola), trocea la respuesta,
 * permite cancelar y registra cada préstamo (quién, qué, ms, bytes) para Procesos activos.
 * Puro: sin red, disco ni procesos; el reloj y las sesiones se inyectan, y `atender`
 * devuelve los mensajes de salida, no los envía (el anfitrión los manda por su enlace).
 */
import { capacidadPrestable, type OfertaNeurona } from './oferta';
import { permitido, type Sesion } from './sesion-prestamo';
import {
  bytesUtf8,
  esMensajeCapacidadMalla,
  partirEnTrozos,
  type Msg,
  type MsgPedir,
  type TipoCapacidad,
} from '../network/capacidad-por-malla';

export const MAX_COLA_CAPACIDAD = 4;

export type ManejadorCapacidad = (cuerpo: Record<string, unknown>) => unknown;
export type FinPrestamo = 'fin' | 'error' | 'cancelado';
export type PrestamoVivo = { id: string; tipo: TipoCapacidad; invitado: string; inicio: number };
export type PrestamoHecho = {
  id: string;
  tipo: TipoCapacidad;
  invitado: string;
  duracionMs: number;
  bytes: number;
  fin: FinPrestamo;
};
export type ConfigServidor = {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona;
  sesiones: Sesion[];
  ahora: () => number;
  /** Mensajes que nacen al drenar la cola, fuera de cualquier llamada a atender. */
  alResponder?: (msgs: Msg[]) => void;
};
export type ServidorCapacidades = {
  atender: (mensaje: unknown) => Promise<Msg[]>;
  prestamos: () => { vivos: PrestamoVivo[]; hechos: PrestamoHecho[] };
};

export function crearServidor(config: ConfigServidor): ServidorCapacidades {
  const { manejadores, oferta, sesiones, ahora, alResponder } = config;
  const vivos = new Map<string, { tipo: TipoCapacidad; invitado: string; inicio: number }>();
  const hechos: PrestamoHecho[] = [];
  const cola: MsgPedir[] = [];

  const error = (id: string, estado: number, mensaje: string): Msg => ({ t: 'capacidad.error', id, estado, mensaje });
  const prestableAhora = () => capacidadPrestable({ ...oferta, t: ahora() });

  type Chequeo = { ok: true; sesion: Sesion } | { ok: false; estado: number; motivo: string; lleno?: boolean };
  function puedeCorrer(m: MsgPedir, t: number): Chequeo {
    const sesion = sesiones.find((s) => s.id === m.sesionId);
    if (!sesion || sesion.anfitrion !== oferta.nodoId || !permitido(sesion, 'atender', t))
      return { ok: false, estado: 403, motivo: 'Sin sesión de préstamo válida para usar esta capacidad.' };
    if (!manejadores[m.tipo])
      return { ok: false, estado: 404, motivo: `Este anfitrión no sirve la capacidad «${m.tipo}».` };
    const prestable = capacidadPrestable({ ...oferta, t });
    if (prestable.computo.nucleos < 1)
      return { ok: false, estado: 503, motivo: 'El anfitrión no presta cómputo ahora (topes, energía o en uso).' };
    if (prestable.computo.motores.length > 0 && !prestable.computo.motores.includes(m.tipo))
      return { ok: false, estado: 503, motivo: `El anfitrión no presta el motor «${m.tipo}».` };
    if (vivos.size >= prestable.computo.nucleos)
      return { ok: false, estado: 503, motivo: 'El anfitrión está completo con este préstamo.', lleno: true };
    return { ok: true, sesion };
  }

  async function correrTerminar(m: MsgPedir, sesion: Sesion): Promise<Msg[]> {
    const t0 = ahora();
    vivos.set(m.id, { tipo: m.tipo, invitado: sesion.invitado, inicio: t0 });
    const salida: Msg[] = [];
    try {
      const resultado = (await manejadores[m.tipo]!(m.cuerpo)) ?? null;
      if (vivos.has(m.id)) {
        const json = JSON.stringify(resultado);
        for (const texto of partirEnTrozos(json)) salida.push({ t: 'capacidad.trozo', id: m.id, texto });
        salida.push({ t: 'capacidad.fin', id: m.id, resultado });
        vivos.delete(m.id);
        hechos.push({ id: m.id, tipo: m.tipo, invitado: sesion.invitado, duracionMs: ahora() - t0, bytes: bytesUtf8(json), fin: 'fin' });
      }
    } catch (e: unknown) {
      if (vivos.has(m.id)) {
        vivos.delete(m.id);
        hechos.push({ id: m.id, tipo: m.tipo, invitado: sesion.invitado, duracionMs: ahora() - t0, bytes: 0, fin: 'error' });
        salida.push(error(m.id, 500, `La capacidad «${m.tipo}» falló: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    salida.push(...drenar());
    return salida;
  }

  /** Corre la cabeza de la cola mientras quepa; lo que salga va por `alResponder`. */
  function drenar(): Msg[] {
    const salida: Msg[] = [];
    while (cola.length > 0) {
      const m = cola[0];
      const chequeo = puedeCorrer(m, ahora());
      if (!chequeo.ok && chequeo.lleno) break;
      cola.shift();
      if (!chequeo.ok) {
        salida.push(error(m.id, chequeo.estado, chequeo.motivo));
        continue;
      }
      void correrTerminar(m, chequeo.sesion).then((msgs) => alResponder?.(msgs), () => undefined);
      break;
    }
    return salida;
  }

  async function atenderPedir(m: MsgPedir): Promise<Msg[]> {
    if (vivos.has(m.id) || cola.some((c) => c.id === m.id)) return [];
    const chequeo = puedeCorrer(m, ahora());
    if (!chequeo.ok && chequeo.lleno) {
      if (cola.length >= MAX_COLA_CAPACIDAD)
        return [error(m.id, 503, `Cola del anfitrión llena (máximo ${MAX_COLA_CAPACIDAD} en espera).`)];
      cola.push(m);
      return [];
    }
    if (!chequeo.ok) return [error(m.id, chequeo.estado, chequeo.motivo)];
    return correrTerminar(m, chequeo.sesion);
  }

  function atenderCancelar(id: string): Msg[] {
    const vivo = vivos.get(id);
    if (vivo) {
      vivos.delete(id);
      hechos.push({ id, tipo: vivo.tipo, invitado: vivo.invitado, duracionMs: ahora() - vivo.inicio, bytes: 0, fin: 'cancelado' });
    }
    const enCola = cola.findIndex((c) => c.id === id);
    if (enCola >= 0) cola.splice(enCola, 1);
    return vivo ? drenar() : [];
  }

  const atender = async (mensaje: unknown): Promise<Msg[]> => {
    if (!esMensajeCapacidadMalla(mensaje)) return [];
    if (mensaje.t === 'capacidad.cancelar') return atenderCancelar(mensaje.id);
    if (mensaje.t !== 'capacidad.pedir') return [];
    return atenderPedir(mensaje);
  };

  const prestamos = () => ({
    vivos: [...vivos.entries()].map(([id, p]) => ({ id, ...p })),
    hechos: [...hechos],
  });

  return { atender, prestamos };
}

