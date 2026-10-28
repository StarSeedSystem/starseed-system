import { permitido } from './sesion-prestamo';
import { capacidadPrestable } from './oferta';
import type { OfertaNeurona } from './oferta';
import type { Sesion } from './sesion-prestamo';

export type TipoCapacidad =
  | 'imagen'
  | 'voz'
  | 'oido'
  | 'palabra'
  | 'transcodificar'
  | 'render'
  | 'buscar'
  | 'construir';

export type MensajeCapacidad =
  | { tipo: 'pedir'; sesionId: string; capacidad: TipoCapacidad; pedidoId: string; datos?: unknown }
  | { tipo: 'trozo'; sesionId: string; pedidoId: string; indice: number }
  | { tipo: 'cancelar'; sesionId: string; pedidoId: string }
  | { tipo: 'fin'; sesionId: string; pedidoId: string };

export type RespuestaCapacidad =
  | { tipo: 'trozo'; pedidoId: string; indice: number; datos: unknown; bytes: number }
  | { tipo: 'fin'; pedidoId: string; bytesTotal: number }
  | { tipo: 'error'; pedidoId: string; mensaje: string }
  | { tipo: 'cola'; pedidoId: string; posicion: number };

export type ManejadorCapacidad = (
  pedido: { pedidoId: string; datos?: unknown },
  ctx: { ahora: number }
) => AsyncIterable<unknown> | Iterable<unknown> | unknown;

export type PrestamoRegistro = {
  pedidoId: string;
  sesionId: string;
  invitado: string;
  anfitrion: string;
  capacidad: TipoCapacidad;
  inicio: number;
  fin?: number;
  bytes: number;
  estado: 'vivo' | 'hecho' | 'cancelado' | 'error';
};

export type ServidorCapacidades = {
  atender: (mensaje: MensajeCapacidad) => RespuestaCapacidad[];
  prestamos: () => PrestamoRegistro[];
};

export type CrearServidorOpts = {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona;
  sesiones: Sesion[] | Map<string, Sesion>;
  ahora: number;
  maxCola?: number;
  tamanoTrozoBytes?: number;
};

function getSesion(sesiones: Sesion[] | Map<string, Sesion>, id: string): Sesion | undefined {
  if (Array.isArray(sesiones)) {
    return sesiones.find(s => s.id === id);
  }
  return sesiones.get(id);
}

function chunkData(data: unknown, tamanoTrozoBytes: number): { datos: unknown; bytes: number }[] {
  if (typeof data === 'string') {
    const bytes = Buffer.byteLength(data);
    if (bytes <= tamanoTrozoBytes) return [{ datos: data, bytes }];
    const trozo = data.slice(0, Math.max(1, Math.floor((data.length * tamanoTrozoBytes) / bytes)));
    return [{ datos: trozo, bytes: Buffer.byteLength(trozo) }];
  }
  if (Buffer.isBuffer(data)) {
    const bytes = data.length;
    if (bytes <= tamanoTrozoBytes) return [{ datos: data, bytes }];
    const chunks: { datos: unknown; bytes: number }[] = [];
    for (let i = 0; i < data.length; i += tamanoTrozoBytes) {
      chunks.push({ datos: data.slice(i, i + tamanoTrozoBytes), bytes: Math.min(tamanoTrozoBytes, data.length - i) });
    }
    return chunks;
  }
  const json = JSON.stringify(data);
  const bytes = Buffer.byteLength(json);
  if (bytes <= tamanoTrozoBytes) return [{ datos: data, bytes }];
  return [{ datos: json, bytes }];
}

export function crearServidor(opts: CrearServidorOpts): ServidorCapacidades {
  const { manejadores, oferta, sesiones } = opts;
  const maxCola = opts.maxCola ?? 4;
  const tamanoTrozoBytes = opts.tamanoTrozoBytes ?? 4096;
  const prestable = capacidadPrestable(oferta);
  const cola: any[] = [];
  const registros: Map<string, PrestamoRegistro> = new Map();
  let aceptados = 0;
  const cancelados = new Set<string>();

  const atender = (mensaje: MensajeCapacidad): RespuestaCapacidad[] => {
    if (mensaje.tipo === 'cancelar') {
      cancelados.add(mensaje.pedidoId);
      const reg = registros.get(mensaje.pedidoId);
      if (reg && reg.estado === 'vivo') {
        registros.set(mensaje.pedidoId, { ...reg, fin: opts.ahora, estado: 'cancelado' });
      }
      return [];
    }
    if (mensaje.tipo === 'trozo' || mensaje.tipo === 'fin') {
      return [];
    }
    if (mensaje.tipo === 'pedir') {
      const sesion = getSesion(sesiones, mensaje.sesionId);
      if (!sesion || !permitido(sesion, 'usar', opts.ahora)) {
        return [{ tipo: 'error', pedidoId: mensaje.pedidoId, mensaje: 'sesion no valida' }];
      }
      const manejador = manejadores[mensaje.capacidad];
      if (!manejador) {
        return [{ tipo: 'error', pedidoId: mensaje.pedidoId, mensaje: 'sin manejador' }];
      }
      if (aceptados >= maxCola) {
        if (cola.length < maxCola) {
          cola.push({ pedidoId: mensaje.pedidoId });
        }
        return [{ tipo: 'cola', pedidoId: mensaje.pedidoId, posicion: cola.length }];
      }
      aceptados++;
      const reg: PrestamoRegistro = {
        pedidoId: mensaje.pedidoId,
        sesionId: mensaje.sesionId,
        invitado: sesion.invitado,
        anfitrion: sesion.anfitrion,
        capacidad: mensaje.capacidad,
        inicio: opts.ahora,
        bytes: 0,
        estado: 'vivo',
      };
      registros.set(mensaje.pedidoId, reg);
      try {
        const res = manejador({ pedidoId: mensaje.pedidoId, datos: mensaje.datos }, { ahora: opts.ahora });
        let out: unknown = res;
        if (res && typeof (res as any)[Symbol.asyncIterator] === 'function') {
          out = res;
        } else if (res && typeof (res as any)[Symbol.iterator] === 'function') {
          const it = (res as Iterable<unknown>)[Symbol.iterator]();
          const first = it.next();
          out = first.value;
        }
        if (cancelados.has(mensaje.pedidoId)) {
          const r2 = registros.get(mensaje.pedidoId);
          if (r2) registros.set(mensaje.pedidoId, { ...r2, fin: opts.ahora, estado: 'cancelado' });
          return [];
        }
        if (out && typeof (out as any)[Symbol.asyncIterator] === 'function') {
          return [];
        }
        const trozos = chunkData(out, tamanoTrozoBytes);
        const respuestas: RespuestaCapacidad[] = [];
        let total = 0;
        for (let i = 0; i < trozos.length; i++) {
          total += trozos[i].bytes;
          respuestas.push({ tipo: 'trozo', pedidoId: mensaje.pedidoId, indice: i, datos: trozos[i].datos, bytes: trozos[i].bytes });
        }
        respuestas.push({ tipo: 'fin', pedidoId: mensaje.pedidoId, bytesTotal: total });
        const r3 = registros.get(mensaje.pedidoId);
        if (r3) registros.set(mensaje.pedidoId, { ...r3, fin: opts.ahora, bytes: total, estado: 'hecho' });
        return respuestas;
      } catch (e: any) {
        const r4 = registros.get(mensaje.pedidoId);
        if (r4) registros.set(mensaje.pedidoId, { ...r4, fin: opts.ahora, estado: 'error' });
        return [{ tipo: 'error', pedidoId: mensaje.pedidoId, mensaje: String(e?.message || e) }];
      }
    }
    return [];
  };

  const prestamos = () => Array.from(registros.values());
  void prestable;
  return { atender, prestamos };
}
