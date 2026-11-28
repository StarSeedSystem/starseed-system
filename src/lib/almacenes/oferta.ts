/**
 * oferta.ts — La capacidad de almacenamiento como señal de capa (ALC1125F).
 *
 * Una neurona anuncia cuánto almacenamiento ofrece, a quién (privada, grupo,
 * comunidad o pública), cuándo (horario) y con qué tope, igual que las demás
 * capacidades de la neurona (`capacidades-nodo.ts`) y que internet compartido
 * y la capacidad por malla. Apagada por defecto: solo ofrece si se enciende.
 *
 * Módulo puro: sin red, sin disco y sin reloj propio (el reloj llega inyectado).
 */

/** A quién se ofrece la capacidad de almacenamiento. */
export type AmbitoOferta = "privada" | "grupo" | "comunidad" | "publica";

/** Horario diario en horas [0-23]; ausente = siempre. */
export interface HorarioOferta {
  inicio: number;
  fin: number;
}

/** Oferta de capacidad de almacenamiento anunciada por una neurona. */
export interface OfertaCapacidadAlmacen {
  /** Neurona que ofrece. */
  nodoId: string;
  /** Cuenta dueña del almacén (la que puede usarlo en el ámbito «privada»). */
  cuentaId: string;
  /** Cuánto ofrece, en MB. */
  mb: number;
  /** A quién se ofrece. */
  ambito: AmbitoOferta;
  /** Grupos con cupo cuando el ámbito es «grupo». */
  grupos?: string[];
  /** Comunidad con cupo cuando el ámbito es «comunidad». */
  comunidadId?: string;
  /** Cuándo está viva; ausente = siempre. */
  horas?: HorarioOferta;
  /** Tope por persona en MB; ausente = sin tope propio. */
  topeMb?: number;
  /** Apagada por defecto: solo ofrece si está encendida. */
  activa: boolean;
  /** Instante de la oferta (ms). */
  t: number;
}

/** Quien consulta si puede usar la oferta. */
export interface QuienOferta {
  cuentaId: string;
  grupos?: string[];
  comunidadId?: string;
}

export const AMBITOS_OFERTA: readonly AmbitoOferta[] = ["privada", "grupo", "comunidad", "publica"];

export function esAmbitoOfertaValido(x: unknown): x is AmbitoOferta {
  return typeof x === "string" && (AMBITOS_OFERTA as readonly string[]).includes(x);
}

/** Oferta apagada por defecto: no ofrece nada hasta que se enciende. */
export function ofertaApagada(nodoId: string, cuentaId: string, t = 0): OfertaCapacidadAlmacen {
  return { nodoId, cuentaId, mb: 0, ambito: "privada", activa: false, t };
}

const esNumeroFinito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function normalizarHoras(x: unknown): HorarioOferta | undefined {
  if (!x || typeof x !== "object") return undefined;
  const h = x as Record<string, unknown>;
  if (!esNumeroFinito(h.inicio) || !esNumeroFinito(h.fin)) return undefined;
  const inicio = Math.trunc(h.inicio);
  const fin = Math.trunc(h.fin);
  if (inicio < 0 || inicio > 23 || fin < 1 || fin > 24 || inicio >= fin) return undefined;
  return { inicio, fin };
}

/**
 * Sanea una oferta que llega de otra neurona. Nunca lanza: lo que no encaja se
 * descarta y, si falta lo esencial, devuelve null (no se anuncia).
 */
export function normalizarOferta(x: unknown): OfertaCapacidadAlmacen | null {
  try {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (!esTexto(o.nodoId) || !esTexto(o.cuentaId)) return null;
    if (!esNumeroFinito(o.mb) || o.mb < 0) return null;
    if (!esAmbitoOfertaValido(o.ambito)) return null;
    const grupos = Array.isArray(o.grupos)
      ? o.grupos.filter((g): g is string => typeof g === "string" && g.trim() !== "").slice(0, 32)
      : undefined;
    const comunidadId = esTexto(o.comunidadId) ? o.comunidadId : undefined;
    const horas = normalizarHoras(o.horas);
    const topeMb = esNumeroFinito(o.topeMb) && o.topeMb >= 0 ? o.topeMb : undefined;
    const t = esNumeroFinito(o.t) ? o.t : 0;
    return {
      nodoId: o.nodoId,
      cuentaId: o.cuentaId,
      mb: o.mb,
      ambito: o.ambito,
      ...(grupos && grupos.length ? { grupos } : {}),
      ...(comunidadId ? { comunidadId } : {}),
      ...(horas ? { horas } : {}),
      ...(topeMb !== undefined ? { topeMb } : {}),
      activa: o.activa === true,
      t,
    };
  } catch {
    return null;
  }
}

/** ¿Está la oferta encendida y dentro de su horario ahora? */
export function ofertaVigente(oferta: OfertaCapacidadAlmacen, ahora: number, hora?: number): boolean {
  if (!oferta.activa || oferta.mb <= 0) return false;
  if (oferta.horas) {
    const h = hora ?? new Date(ahora).getHours();
    if (h < oferta.horas.inicio || h >= oferta.horas.fin) return false;
  }
  return true;
}

/** MB que la oferta pone a disposición ahora mismo (0 si está apagada o fuera de horario). */
export function capacidadOfertadaMb(oferta: OfertaCapacidadAlmacen, ahora: number, hora?: number): number {
  return ofertaVigente(oferta, ahora, hora) ? oferta.mb : 0;
}

/** ¿Puede `quien` usar esta oferta según su ámbito? */
export function ofertaPermitidaPara(oferta: OfertaCapacidadAlmacen, quien: QuienOferta): boolean {
  switch (oferta.ambito) {
    case "publica":
      return true;
    case "privada":
      return quien.cuentaId === oferta.cuentaId;
    case "grupo":
      return !!oferta.grupos?.some((g) => quien.grupos?.includes(g));
    case "comunidad":
      return !!oferta.comunidadId && quien.comunidadId === oferta.comunidadId;
  }
}

/** Cupo en MB que `quien` puede usar ahora: capacidad vigente limitada por su tope. */
export function cupoPara(
  oferta: OfertaCapacidadAlmacen,
  quien: QuienOferta,
  ahora: number,
  hora?: number,
): number {
  if (!ofertaPermitidaPara(oferta, quien)) return 0;
  const capacidad = capacidadOfertadaMb(oferta, ahora, hora);
  return oferta.topeMb !== undefined ? Math.min(capacidad, oferta.topeMb) : capacidad;
}

/** La oferta lista para viajar en la ficha de capacidades de la neurona. */
export function anunciarOferta(oferta: OfertaCapacidadAlmacen): OfertaCapacidadAlmacen {
  return normalizarOferta(oferta) ?? ofertaApagada(oferta.nodoId, oferta.cuentaId, oferta.t);
}

const ETIQUETA_AMBITO: Record<AmbitoOferta, string> = {
  privada: "privada",
  grupo: "de grupo",
  comunidad: "de comunidad",
  publica: "pública",
};

/** Texto de interfaz en español, con los tokens del tema. */
export function formatearOferta(oferta: OfertaCapacidadAlmacen): string {
  if (!oferta.activa) return "Almacenamiento: apagado";
  const gb = oferta.mb / 1024;
  const cantidad = gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${oferta.mb} MB`;
  const horas = oferta.horas ? ` · ${oferta.horas.inicio}:00–${oferta.horas.fin}:00` : "";
  const tope = oferta.topeMb !== undefined ? ` · tope ${oferta.topeMb} MB por persona` : "";
  return `Almacenamiento: ${cantidad} · ${ETIQUETA_AMBITO[oferta.ambito]}${horas}${tope}`;
}