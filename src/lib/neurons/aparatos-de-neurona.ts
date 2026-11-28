/*
 * aparatos-de-neurona — los APARATOS (dispositivos) de cada neurona (NEU1115G · 2026-11-15).
 * Contrato: architecture/neuronas-y-aparatos.md.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Una neurona tiene uno o más aparatos; lo normal y recomendado es uno. Cada aparato tiene su id estable
 * (el id de sync de su origen, `starseed.device.id`) y un nombre que la persona edita, aparte del nombre
 * de la neurona. La lista vive en `capabilities.aparatos` de la fila de la neurona (jsonb que ya existe:
 * SIN migración), una entrada por aparato; cada aparato escribe SOLO la suya y se funde por id.
 *
 * Una entrada `{ ts, fuera }` con `fuera >= ts` es una LÁPIDA: el aparato se desvinculó de esta neurona
 * (así el fundido de otro aparato no lo resucita). Un aparato que vuelve a vincularse escribe una entrada
 * nueva (`ts` mayor, sin `fuera`).
 *
 * Puro: sin red, sin DOM, sin almacenamiento. Nunca lanza.
 */

import { colorDe, normalizarColor } from "./color-publico";

export type EstadoSyncAparato = "activa" | "pendiente" | "sin-enlace";

export interface EntradaAparato {
  /** Nombre que la persona le puso a este aparato (apartado del nombre de la neurona). */
  n?: string;
  /** ID único personalizable del aparato (se muestra como nombre propio junto al apellido de la neurona). */
  idUnico?: string;
  /** Color diferenciador del aparato (`#rrggbb`). */
  color?: string;
  /** Huella de hardware de este aparato para distinguir dispositivos del mismo SO. */
  huella?: string;
  /** Estado de sincronización con su neurona. */
  syncEstado?: EstadoSyncAparato;
  /** Número de cambios pendientes en cola local. */
  syncPendientes?: number;
  medio?: string;
  so?: string;
  equipo?: string;
  /** Epoch ms de la última escritura de ESTA entrada (el aparato que la escribe). */
  ts: number;
  /** Epoch ms en que se desvinculó de esta neurona (lápida si `fuera >= ts`). */
  fuera?: number;
}

export type MapaAparatos = Record<string, EntradaAparato>;

export interface AparatoDeNeurona {
  id: string;
  nombre: string;
  idUnico?: string;
  color?: string;
  huella?: string;
  syncEstado?: EstadoSyncAparato;
  syncPendientes?: number;
  medio?: string;
  so?: string;
  equipo?: string;
  visto: number;
}

const ID_OK = /^[A-Za-z0-9_.-]{6,80}$/;

function texto(v: unknown, max = 60): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

/** Lee `capabilities.aparatos` con tipos saneados (descarta lo raro). */
export function leerMapaAparatos(capabilities: unknown): MapaAparatos {
  const out: MapaAparatos = {};
  try {
    const crudo = capabilities && typeof capabilities === "object" ? (capabilities as Record<string, unknown>).aparatos : null;
    if (!crudo || typeof crudo !== "object") return out;
    for (const [id, v] of Object.entries(crudo as Record<string, unknown>)) {
      if (!ID_OK.test(id) || !v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : 0;
      const e: EntradaAparato = { ts };
      const n = texto(o.n);
      if (n) e.n = n;
      const idUnico = texto(o.idUnico, 40);
      if (idUnico) e.idUnico = idUnico;
      const color = normalizarColor(o.color);
      if (color) e.color = color;
      const huella = texto(o.huella, 80);
      if (huella) e.huella = huella;
      if (o.syncEstado === "activa" || o.syncEstado === "pendiente" || o.syncEstado === "sin-enlace") {
        e.syncEstado = o.syncEstado;
      }
      if (typeof o.syncPendientes === "number" && Number.isFinite(o.syncPendientes) && o.syncPendientes >= 0) {
        e.syncPendientes = Math.round(o.syncPendientes);
      }
      for (const k of ["medio", "so", "equipo"] as const) {
        const t = texto(o[k], 80);
        if (t) e[k] = t;
      }
      if (typeof o.fuera === "number" && Number.isFinite(o.fuera)) e.fuera = o.fuera;
      out[id] = e;
    }
  } catch {
    /* mapa vacío */
  }
  return out;
}

/** Funde dos mapas por id: gana la entrada con `ts` mayor (la lápida también es una entrada). Pura. */
export function fusionarAparatos(remotos: unknown, locales: unknown): MapaAparatos {
  const a = leerMapaAparatos({ aparatos: remotos });
  const b = leerMapaAparatos({ aparatos: locales });
  const out: MapaAparatos = { ...a };
  for (const [id, e] of Object.entries(b)) {
    const previo = out[id];
    if (!previo || e.ts >= previo.ts) out[id] = e;
  }
  return out;
}

export function estaVinculado(e: EntradaAparato): boolean {
  return !(typeof e.fuera === "number" && e.fuera >= e.ts);
}

/** Nombre por defecto de un aparato: su equipo o su medio. */
export function nombreAparatoPorDefecto(e: Pick<EntradaAparato, "equipo" | "medio" | "so">): string {
  return e.equipo || [e.medio, e.so].filter(Boolean).join(" · ") || "Aparato";
}

/** Los aparatos vinculados de una neurona (sin lápidas), el más reciente primero. Pura. */
export function aparatosDe(capabilities: unknown): AparatoDeNeurona[] {
  const mapa = leerMapaAparatos(capabilities);
  return Object.entries(mapa)
    .filter(([, e]) => estaVinculado(e))
    .map(([id, e]) => ({
      id,
      nombre: e.n || nombreAparatoPorDefecto(e),
      ...(e.idUnico ? { idUnico: e.idUnico } : {}),
      ...(e.color ? { color: e.color } : {}),
      ...(e.huella ? { huella: e.huella } : {}),
      ...(e.syncEstado ? { syncEstado: e.syncEstado } : {}),
      ...(typeof e.syncPendientes === "number" ? { syncPendientes: e.syncPendientes } : {}),
      medio: e.medio,
      so: e.so,
      equipo: e.equipo,
      visto: e.ts,
    }))
    .sort((x, y) => y.visto - x.visto);
}

/** La entrada de lápida para un aparato (se escribe en la fila de la neurona que deja). */
export function lapida(previa: EntradaAparato | undefined, ahora: number): EntradaAparato {
  return { ...(previa ?? { ts: 0 }), ts: ahora, fuera: ahora };
}

/** Entrada viva de un aparato. */
export function entradaViva(
  d: {
    nombre?: string;
    idUnico?: string;
    color?: string;
    huella?: string;
    syncEstado?: EstadoSyncAparato;
    syncPendientes?: number;
    medio?: string;
    so?: string;
    equipo?: string;
  },
  ahora: number,
): EntradaAparato {
  const e: EntradaAparato = { ts: ahora };
  const n = texto(d.nombre);
  if (n) e.n = n;
  const idUnico = texto(d.idUnico, 40);
  if (idUnico) e.idUnico = idUnico;
  const color = normalizarColor(d.color);
  if (color) e.color = color;
  const huella = texto(d.huella, 80);
  if (huella) e.huella = huella;
  if (d.syncEstado) e.syncEstado = d.syncEstado;
  if (typeof d.syncPendientes === "number" && Number.isFinite(d.syncPendientes) && d.syncPendientes >= 0) {
    e.syncPendientes = Math.round(d.syncPendientes);
  }
  for (const k of ["medio", "so", "equipo"] as const) {
    const t = texto(d[k], 80);
    if (t) e[k] = t;
  }
  return e;
}

/** Color efectivo de un aparato (el personalizado o un color determinista de su ID). Pura. */
export function colorAparatoDe(aparato: Pick<AparatoDeNeurona, "id" | "color">): string {
  return colorDe(aparato.id, aparato.color);
}

/** Sugerencia de ID único legible para un aparato a partir de su nombre/equipo y su UUID de sync. Pura. */
export function idUnicoPorDefecto(aparato: Pick<AparatoDeNeurona, "id" | "nombre" | "equipo" | "so">): string {
  const base = (aparato.equipo || aparato.nombre || aparato.so || "aparato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "aparato";
  const sufijo = aparato.id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase() || "0001";
  return `${base}-${sufijo}`;
}

/** Estado de sincronización de un aparato respecto a su neurona. Pura. */
export function estadoSyncAparato(
  aparato: Pick<AparatoDeNeurona, "visto" | "syncEstado" | "syncPendientes">,
  opciones?: { ahora?: number; presente?: boolean; pendientes?: number },
): { estado: EstadoSyncAparato; etiqueta: string; pendientes: number } {
  const ahora = opciones?.ahora ?? Date.now();
  const pendientes = opciones?.pendientes ?? aparato.syncPendientes ?? 0;
  if (pendientes > 0 || aparato.syncEstado === "pendiente") {
    return {
      estado: "pendiente",
      etiqueta: pendientes > 0 ? `Sincronización pendiente (${pendientes})` : "Sincronización pendiente",
      pendientes,
    };
  }
  const fresco = opciones?.presente === true || (aparato.visto > 0 && ahora - aparato.visto < 12 * 60_000);
  if (fresco || aparato.syncEstado === "activa") {
    return { estado: "activa", etiqueta: "Sincronización activa", pendientes: 0 };
  }
  return { estado: "sin-enlace", etiqueta: "Pendiente de sincronizar al conectar", pendientes: 0 };
}

export interface NeuronaParaElegir {
  id: string;
  nombre: string;
  aparatos: AparatoDeNeurona[];
  /** ¿Es la neurona en la que está este aparato ahora? */
  esActual: boolean;
  /** Hay más de un aparato: la interfaz avisa de que lo normal es uno. */
  variosAparatos: boolean;
}

interface FilaNeurona {
  id: string;
  name?: string;
  capabilities?: unknown;
}

/**
 * La lista de la ventana «¿en qué neurona va este aparato?»: cada neurona de la cuenta con su nombre y
 * los aparatos que YA la usan. Las filas absorbidas por una fusión no se enseñan. Una neurona antigua
 * (sin lista de aparatos) enseña el aparato de `capabilities.aparato`, si lo hay, como «aparato sin
 * nombrar». Pura.
 */
export function neuronasParaElegir(filas: readonly FilaNeurona[], idActual: string): NeuronaParaElegir[] {
  const out: NeuronaParaElegir[] = [];
  for (const f of filas ?? []) {
    if (!f || typeof f.id !== "string" || !f.id) continue;
    const caps = (f.capabilities && typeof f.capabilities === "object" ? f.capabilities : {}) as Record<string, unknown>;
    if (caps.fusionada && typeof caps.fusionada === "object") continue;
    let aparatos = aparatosDe(caps);
    if (!aparatos.length) {
      const ap = caps.aparato && typeof caps.aparato === "object" ? (caps.aparato as Record<string, unknown>) : null;
      const equipo = texto(ap?.equipo, 80);
      const medio = texto(ap?.medio, 40);
      const so = texto(ap?.so, 40);
      if (equipo || medio || so) aparatos = [{ id: `heredado-${f.id}`, nombre: nombreAparatoPorDefecto({ equipo, medio, so }), medio, so, equipo, visto: 0 }];
    }
    out.push({
      id: f.id,
      nombre: texto(f.name, 60) || "Neurona sin nombre",
      aparatos,
      esActual: f.id === idActual,
      variosAparatos: aparatos.length > 1,
    });
  }
  return out.sort((a, b) => Number(b.esActual) - Number(a.esActual) || a.nombre.localeCompare(b.nombre, "es"));
}
