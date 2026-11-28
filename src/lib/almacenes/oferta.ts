/**
 * oferta.ts — Oferta de almacenamiento como señal de capa.
 *
 * La capacidad de almacenamiento de una neurona se anuncia como las demás
 * capacidades (internet compartido y capacidad por malla): cuánto se ofrece,
 * a quién (privada, grupo, comunidad o pública), cuándo y con qué tope.
 *
 * Reglas del contrato (`architecture/almacenes-cerebros.md` §5):
 * - Apagada por defecto: sin oferta explícita, la neurona no cede ni un byte.
 * - La oferta REFERENCIA el almacén por su identidad estable (`almacenId`),
 *   nunca duplica su contenido (regla del área: entidad única).
 * - Aquí solo viaja la señal; el cifrado ocurre en la neurona del dueño.
 * - El tope manda siempre: nunca se cede más de lo declarado.
 */

import type { Compartir } from "@/lib/malla/cristal/puertas-internet";

export const DESTINOS_OFERTA = ["privada", "grupo", "comunidad", "publica"] as const;
export type DestinoOferta = (typeof DESTINOS_OFERTA)[number];

export const CUANDOS_OFERTA = ["siempre", "al-conectar", "programada", "a-mano"] as const;
export type CuandoOferta = (typeof CUANDOS_OFERTA)[number];

/** Franja horaria local [0..23]; puede cruzar la medianoche (22 → 6). */
export interface FranjaHoraria {
  desde: number;
  hasta: number;
}

export interface OfertaAlmacenSenal {
  /** Identidad estable del almacén ofrecido; se referencia, no se copia. */
  almacenId: string;
  /** Neurona que anuncia la capacidad. */
  nodoId: string;
  /** Apagada por defecto: solo `true` explícito la enciende. */
  activa: boolean;
  /** Bytes cedidos a la malla (medidos, nunca inventados). */
  bytesOfrecidos: number;
  /** Tope duro en bytes; nunca se supera aunque quede libre. */
  topeBytes: number;
  destino: DestinoOferta;
  cuando: CuandoOferta;
  /** Solo cuando `cuando === "programada"`. */
  franja?: FranjaHoraria;
}

/** Los destinos del almacén reutilizan los niveles del internet compartido. */
export const DESTINO_A_COMPARTIR: Record<DestinoOferta, Compartir> = {
  privada: "mi-cuenta",
  grupo: "grupo",
  comunidad: "vinculos",
  publica: "publico",
};

export function esDestinoOferta(v: unknown): v is DestinoOferta {
  return typeof v === "string" && (DESTINOS_OFERTA as readonly string[]).includes(v);
}

export function esCuandoOferta(v: unknown): v is CuandoOferta {
  return typeof v === "string" && (CUANDOS_OFERTA as readonly string[]).includes(v);
}

export function nivelCompartir(destino: DestinoOferta): Compartir {
  return DESTINO_A_COMPARTIR[destino];
}

/** Oferta neutra: apagada, privada y solo a mano. Es el estado de partida. */
export function crearOfertaApagada(nodoId: string, almacenId: string): OfertaAlmacenSenal {
  return {
    almacenId,
    nodoId,
    activa: false,
    bytesOfrecidos: 0,
    topeBytes: 0,
    destino: "privada",
    cuando: "a-mano",
  };
}

const enteroNoNegativo = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

function franjaValida(v: unknown): FranjaHoraria | undefined {
  if (!v || typeof v !== "object") return undefined;
  const f = v as { desde?: unknown; hasta?: unknown };
  const desde = enteroNoNegativo(f.desde);
  const hasta = enteroNoNegativo(f.hasta);
  if (desde === null || hasta === null || desde > 23 || hasta > 23) return undefined;
  return { desde, hasta };
}

/**
 * Sanea una oferta ajena (o guardada). Nunca lanza: lo que no encaja se
 * descarta y, sin `almacenId` o `nodoId`, devuelve undefined (no se anuncia).
 * Lo dudoso cae al lado seguro: privada, a mano y apagada salvo `true` explícito.
 */
export function normalizarOfertaAlmacen(x: unknown): OfertaAlmacenSenal | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const almacenId = typeof o.almacenId === "string" ? o.almacenId.trim() : "";
  const nodoId = typeof o.nodoId === "string" ? o.nodoId.trim() : "";
  if (!almacenId || !nodoId) return undefined;
  const bytes = enteroNoNegativo(o.bytesOfrecidos) ?? 0;
  const tope = enteroNoNegativo(o.topeBytes) ?? 0;
  const franja = franjaValida(o.franja);
  return {
    almacenId,
    nodoId,
    activa: o.activa === true,
    bytesOfrecidos: Math.min(bytes, tope),
    topeBytes: tope,
    destino: esDestinoOferta(o.destino) ? o.destino : "privada",
    cuando: esCuandoOferta(o.cuando) ? o.cuando : "a-mano",
    ...(franja ? { franja } : {}),
  };
}

/** Bytes que de verdad se ceden ahora: 0 si está apagada; nunca más que el tope. */
export function bytesEfectivos(oferta: OfertaAlmacenSenal): number {
  if (!oferta.activa) return 0;
  return Math.max(0, Math.min(oferta.bytesOfrecidos, oferta.topeBytes));
}

export interface ContextoOferta {
  /** Hora local [0..23] para las ofertas programadas. */
  hora: number;
  /** La neurona está conectada ahora mismo. */
  conectada: boolean;
}

function dentroDeFranja(hora: number, franja: FranjaHoraria): boolean {
  const h = ((Math.floor(hora) % 24) + 24) % 24;
  if (franja.desde === franja.hasta) return true;
  if (franja.desde < franja.hasta) return h >= franja.desde && h < franja.hasta;
  return h >= franja.desde || h < franja.hasta; // cruza la medianoche
}

/** ¿La oferta aplica ahora? Apagada o sin bytes nunca aplica. */
export function disponibleAhora(oferta: OfertaAlmacenSenal, ctx: ContextoOferta): boolean {
  if (bytesEfectivos(oferta) <= 0) return false;
  switch (oferta.cuando) {
    case "siempre":
      return true;
    case "al-conectar":
      return ctx.conectada;
    case "programada":
      return oferta.franja ? dentroDeFranja(ctx.hora, oferta.franja) : false;
    case "a-mano":
      return false;
  }
}

const UNIDADES_BYTES = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** Bytes legibles en español; sin inventar decimales donde no aportan. */
export function formatearBytes(bytes: number): string {
  let v = Math.max(0, Math.floor(bytes));
  let i = 0;
  while (v >= 1024 && i < UNIDADES_BYTES.length - 1) {
    v /= 1024;
    i++;
  }
  const valor = i === 0 || v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${valor} ${UNIDADES_BYTES[i]}`;
}

const ETIQUETA_DESTINO: Record<DestinoOferta, string> = {
  privada: "mi cuenta privada",
  grupo: "mis grupos",
  comunidad: "mi comunidad",
  publica: "la malla pública",
};

const ETIQUETA_CUANDO: Record<CuandoOferta, string> = {
  siempre: "siempre",
  "al-conectar": "al conectarse",
  programada: "en su franja horaria",
  "a-mano": "solo a mano",
};

/** Texto de interfaz (español con acentos) que resume la oferta. */
export function describirOferta(oferta: OfertaAlmacenSenal): string {
  if (!oferta.activa) return "Almacenamiento apagado: no se cede capacidad.";
  const bytes = bytesEfectivos(oferta);
  if (bytes <= 0) return "Almacenamiento activo, pero sin capacidad cedible.";
  return `Ofrece ${formatearBytes(bytes)} a ${ETIQUETA_DESTINO[oferta.destino]}, ${ETIQUETA_CUANDO[oferta.cuando]}.`;
}

const CLAVE_DESTINO: Record<DestinoOferta, string> = {
  privada: "p",
  grupo: "g",
  comunidad: "c",
  publica: "u",
};

/**
 * Token compacto para la ficha de la neurona: `o<destino><GB>`, p. ej. `oc50`.
 * Vacío si no hay nada que anunciar (apagada o sin bytes), para no ensuciar la línea.
 */
export function fichaOfertaCompacta(oferta: OfertaAlmacenSenal): string {
  const bytes = bytesEfectivos(oferta);
  if (bytes <= 0) return "";
  const gb = Math.round(bytes / (1024 * 1024 * 1024));
  return `o${CLAVE_DESTINO[oferta.destino]}${gb}`;
}
