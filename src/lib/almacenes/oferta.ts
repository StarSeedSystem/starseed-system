/**
 * Oferta de almacenamiento como señal de capa — StarSeed OS
 *
 * La capacidad de almacenamiento se anuncia como las demás capacidades de la neurona
 * (reutiliza capacidades-nodo.ts y el patrón de internet compartido y capacidad por malla):
 * cuánto, a quién (privada, grupo, comunidad, pública), cuándo y con qué tope.
 * Apagada por defecto.
 */

import type { TipoAlmacen } from "./modelo";

export type AmbitoOferta = "privada" | "grupo" | "comunidad" | "publica";

export interface OfertaAlmacenamiento {
  /** Identificador único de la oferta. */
  id: string;
  /** Id del nodo/neurona que ofrece. */
  nodoId: string;
  /** Id del almacén físico asociado (UUID del volumen). */
  almacenId: string;
  /** Tipo de almacén (extraíble, disco_interno, red, nube, neurona, nodo). */
  tipoAlmacen: TipoAlmacen;
  /** Ámbito de la oferta: privada (cuenta), grupo, comunidad, pública. */
  ambito: AmbitoOferta;
  /** Bytes totales que se ofrecen para almacenamiento ajeno. */
  bytesOfrecidos: bigint;
  /** Bytes ya comprometidos en ofertas activas. */
  bytesComprometidos: bigint;
  /** Duración de la oferta en milisegundos (0 = indefinida). */
  duracionMs: number;
  /** Prioridad de la oferta (mayor = más prioritario). */
  prioridad: number;
  /** Cuándo está disponible: "siempre", "programada", "bajo_demanda". */
  disponibilidad: "siempre" | "programada" | "bajo_demanda";
  /** Ventana de disponibilidad si es programada (cron o rangos ISO). */
  ventana?: string;
  /** Tope máximo por consumidor individual (bytes). */
  topePorConsumidor?: bigint;
  /** Tope total de almacenamiento ajeno permitido (bytes). */
  topeTotal?: bigint;
  /** Si la oferta está activa. Apagada por defecto. */
  activa: boolean;
  /** Fecha de creación de la oferta. */
  fechaCreacion: string;
  /** Fecha de última actualización. */
  fechaActualizacion: string;
  /** Metadatos adicionales (etiquetas, notas, etc.). */
  meta?: Record<string, unknown>;
}

export interface OfertaAlmacenamientoParams {
  nodoId: string;
  almacenId: string;
  tipoAlmacen: TipoAlmacen;
  ambito: AmbitoOferta;
  bytesOfrecidos: bigint;
  duracionMs?: number;
  prioridad?: number;
  disponibilidad?: "siempre" | "programada" | "bajo_demanda";
  ventana?: string;
  topePorConsumidor?: bigint;
  topeTotal?: bigint;
  activa?: boolean;
  meta?: Record<string, unknown>;
}

const AMBITOS_VALIDOS: readonly AmbitoOferta[] = ["privada", "grupo", "comunidad", "publica"] as const;
const DISPONIBILIDADES_VALIDAS = ["siempre", "programada", "bajo_demanda"] as const;

export function esAmbitoOfertaValido(ambito: string): ambito is AmbitoOferta {
  return AMBITOS_VALIDOS.includes(ambito as AmbitoOferta);
}

export function esDisponibilidadValida(d: string): d is "siempre" | "programada" | "bajo_demanda" {
  return DISPONIBILIDADES_VALIDAS.includes(d as "siempre" | "programada" | "bajo_demanda");
}

export function bytesLibres(oferta: OfertaAlmacenamiento): bigint {
  if (oferta.bytesOfrecidos <= oferta.bytesComprometidos) return BigInt(0);
  return oferta.bytesOfrecidos - oferta.bytesComprometidos;
}

export function estaDisponible(oferta: OfertaAlmacenamiento, ahora: number = Date.now()): boolean {
  if (!oferta.activa) return false;
  if (oferta.duracionMs > 0) {
    const inicio = new Date(oferta.fechaCreacion).getTime();
    if (ahora - inicio > oferta.duracionMs) return false;
  }
  return bytesLibres(oferta) > BigInt(0);
}

export function puedeAceptar(oferta: OfertaAlmacenamiento, bytesSolicitados: bigint): boolean {
  if (!estaDisponible(oferta)) return false;
  const libres = bytesLibres(oferta);
  if (bytesSolicitados > libres) return false;
  if (oferta.topePorConsumidor !== undefined && bytesSolicitados > oferta.topePorConsumidor) return false;
  if (oferta.topeTotal !== undefined && oferta.bytesComprometidos + bytesSolicitados > oferta.topeTotal) return false;
  return true;
}

export function crearOfertaAlmacenamiento(params: OfertaAlmacenamientoParams): OfertaAlmacenamiento {
  if (!esAmbitoOfertaValido(params.ambito)) {
    throw new Error(`Ámbito de oferta inválido: ${params.ambito}`);
  }
  if (params.disponibilidad !== undefined && !esDisponibilidadValida(params.disponibilidad)) {
    throw new Error(`Disponibilidad inválida: ${params.disponibilidad}`);
  }
  if (params.bytesOfrecidos <= BigInt(0)) {
    throw new Error("bytesOfrecidos debe ser mayor que 0");
  }

  const ahora = new Date().toISOString();
  return {
    id: `oferta-${params.nodoId}-${params.almacenId}-${Date.now()}`,
    nodoId: params.nodoId,
    almacenId: params.almacenId,
    tipoAlmacen: params.tipoAlmacen,
    ambito: params.ambito,
    bytesOfrecidos: params.bytesOfrecidos,
    bytesComprometidos: BigInt(0),
    duracionMs: params.duracionMs ?? 0,
    prioridad: params.prioridad ?? 0,
    disponibilidad: params.disponibilidad ?? "siempre",
    ventana: params.ventana,
    topePorConsumidor: params.topePorConsumidor,
    topeTotal: params.topeTotal,
    activa: params.activa ?? false,
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
    meta: params.meta,
  };
}

export function actualizarOferta(
  oferta: OfertaAlmacenamiento,
  patch: Partial<Pick<OfertaAlmacenamiento, "activa" | "prioridad" | "ventana" | "topePorConsumidor" | "topeTotal" | "bytesComprometidos" | "meta">>
): OfertaAlmacenamiento {
  return {
    ...oferta,
    ...patch,
    fechaActualizacion: new Date().toISOString(),
  };
}

export function comprometerBytes(oferta: OfertaAlmacenamiento, bytes: bigint): OfertaAlmacenamiento {
  if (bytes <= BigInt(0)) return oferta;
  const nuevosComprometidos = oferta.bytesComprometidos + bytes;
  if (nuevosComprometidos > oferta.bytesOfrecidos) {
    throw new Error("No hay suficientes bytes libres en la oferta");
  }
  return actualizarOferta(oferta, { bytesComprometidos: nuevosComprometidos });
}

export function liberarBytes(oferta: OfertaAlmacenamiento, bytes: bigint): OfertaAlmacenamiento {
  if (bytes <= BigInt(0)) return oferta;
  const nuevosComprometidos = oferta.bytesComprometidos > bytes ? oferta.bytesComprometidos - bytes : BigInt(0);
  return actualizarOferta(oferta, { bytesComprometidos: nuevosComprometidos });
}

export function filtrarPorAmbito(ofertas: OfertaAlmacenamiento[], ambito: AmbitoOferta): OfertaAlmacenamiento[] {
  return ofertas.filter((o) => o.ambito === ambito && estaDisponible(o));
}

export function ordenarPorPrioridad(ofertas: OfertaAlmacenamiento[]): OfertaAlmacenamiento[] {
  return [...ofertas].sort((a, b) => {
    if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;
    return Number(bytesLibres(b) - bytesLibres(a));
  });
}

export interface ResumenOferta {
  id: string;
  nodoId: string;
  almacenId: string;
  ambito: AmbitoOferta;
  bytesOfrecidos: bigint;
  bytesLibres: bigint;
  activa: boolean;
  prioridad: number;
}

export function resumirOferta(oferta: OfertaAlmacenamiento): ResumenOferta {
  return {
    id: oferta.id,
    nodoId: oferta.nodoId,
    almacenId: oferta.almacenId,
    ambito: oferta.ambito,
    bytesOfrecidos: oferta.bytesOfrecidos,
    bytesLibres: bytesLibres(oferta),
    activa: oferta.activa,
    prioridad: oferta.prioridad,
  };
}