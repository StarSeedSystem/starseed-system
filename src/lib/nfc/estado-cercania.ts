// Estado único de «NFC y cercanía» (contrato: architecture/nfc-neuronas.md §9).
// Lo leen las cuatro puertas: centro de control, notificaciones, Señales y hub social.
// Módulo puro: sin red, disco ni Node. Cada función devuelve datos nuevos, nunca muta.

import type { RegistroEncuentro } from "./encuentros";
import type { ViaAcercar } from "./respaldo";

export const CLAVE_ESTADO_CERCANIA = "starseed.nfc.cercania.v1" as const;
export const CLAVE_ENCUENTROS = "starseed.nfc.encuentros.v1" as const;
export const MAX_ELEMENTOS = 50;

export const MODOS = ["recibir", "emitir", "ambos"] as const;
export type ModoCercania = (typeof MODOS)[number];

export interface VinculoCercania { id: string; neuronaId: string; via: ViaAcercar; desde: number; revocado: boolean }
export interface PersonaCercana { neuronaId: string; nombre: string; via: ViaAcercar; vista: number }
export interface TarjetaRecibida { id: string; neuronaId: string; titulo: string; tipo: string; en: number }
export interface GrupoCercania { id: string; nombre: string; neuronaIds: string[]; en: number }

export interface EstadoCercania {
  version: 1;
  activo: boolean;
  modo: ModoCercania;
  vinculos: VinculoCercania[];
  conocidas: PersonaCercana[];
  tarjetas: TarjetaRecibida[];
  grupos: GrupoCercania[];
}

export function estadoPorDefecto(): EstadoCercania {
  return { version: 1, activo: true, modo: "ambos", vinculos: [], conocidas: [], tarjetas: [], grupos: [] };
}

const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/** Lee el texto guardado; cualquier cosa rara devuelve el estado de fábrica. */
export function leerEstado(raw: string | null): EstadoCercania {
  if (!raw) return estadoPorDefecto();
  try {
    const x: unknown = JSON.parse(raw);
    if (!x || typeof x !== "object" || Array.isArray(x) || (x as { version?: unknown }).version !== 1) return estadoPorDefecto();
    const o = x as Partial<EstadoCercania>;
    return {
      version: 1,
      activo: o.activo !== false,
      modo: MODOS.includes(o.modo as ModoCercania) ? (o.modo as ModoCercania) : "ambos",
      vinculos: lista<VinculoCercania>(o.vinculos),
      conocidas: lista<PersonaCercana>(o.conocidas),
      tarjetas: lista<TarjetaRecibida>(o.tarjetas),
      grupos: lista<GrupoCercania>(o.grupos),
    };
  } catch {
    return estadoPorDefecto();
  }
}

/** Lee el registro de encuentros que escribe la hoja «Cerca de ti». */
export function leerRegistroEncuentros(raw: string | null): RegistroEncuentro[] {
  try {
    const x: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(x) ? (x as RegistroEncuentro[]) : [];
  } catch {
    return [];
  }
}

export const alternarActivo = (e: EstadoCercania): EstadoCercania => ({ ...e, activo: !e.activo });
export const cambiarModo = (e: EstadoCercania, modo: ModoCercania): EstadoCercania =>
  MODOS.includes(modo) ? { ...e, modo } : e;

/** Añade al principio, sin repetir la clave, con tope. */
function poner<T>(xs: readonly T[], nuevo: T, clave: (t: T) => string): T[] {
  return [nuevo, ...xs.filter((x) => clave(x) !== clave(nuevo))].slice(0, MAX_ELEMENTOS);
}

export const anadirVinculo = (e: EstadoCercania, v: Omit<VinculoCercania, "revocado">): EstadoCercania =>
  ({ ...e, vinculos: poner(e.vinculos, { ...v, revocado: false }, (x) => x.id) });
export const revocarVinculo = (e: EstadoCercania, id: string): EstadoCercania =>
  ({ ...e, vinculos: e.vinculos.map((v) => (v.id === id ? { ...v, revocado: true } : v)) });
export const vinculosActivos = (e: EstadoCercania): VinculoCercania[] => e.vinculos.filter((v) => !v.revocado);

export const anadirConocida = (e: EstadoCercania, p: PersonaCercana): EstadoCercania =>
  ({ ...e, conocidas: poner(e.conocidas, p, (x) => x.neuronaId) });
export const anadirTarjeta = (e: EstadoCercania, t: TarjetaRecibida): EstadoCercania =>
  ({ ...e, tarjetas: poner(e.tarjetas, t, (x) => x.id) });
export const anadirGrupo = (e: EstadoCercania, g: GrupoCercania): EstadoCercania =>
  ({ ...e, grupos: poner(e.grupos, g, (x) => x.id) });

/** Encuentros con ofertas sin hacer: lo que el Centro de notificaciones enseña con sus botones. */
export function encuentrosPendientes(registro: readonly RegistroEncuentro[]): RegistroEncuentro[] {
  return registro.filter((r) => r.ofrecidas.some((a) => !r.hechas.includes(a)));
}

/** Frase corta del mosaico del centro de control. */
export function resumenCercania(e: EstadoCercania, registro: readonly RegistroEncuentro[]): string {
  if (!e.activo) return "Apagado";
  const n = vinculosActivos(e).length;
  const p = encuentrosPendientes(registro).length;
  const partes = [`${n} vínculo${n === 1 ? "" : "s"}`];
  if (p > 0) partes.push(`${p} pendiente${p === 1 ? "" : "s"}`);
  return partes.join(" · ");
}
