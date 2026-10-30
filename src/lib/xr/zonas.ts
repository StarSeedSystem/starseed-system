/**
 * StarSeed XR · ZONAS Y PORTALES. Lógica pura: sin React, sin three.js, sin `node:*`.
 * Maneja zonas 3D, histéresis, efectos y destinos de portal.
 */
import { Rect } from "../protomolecula/orbe4d/eventos";

export const HISTERESIS_M = 5;

export type Vec3 = [number, number, number];

/** Una zona XR con efecto asociado. */
export function zona(nombre: string, { pos, efecto, radio, tam }: { pos: Vec3; efecto?: string; radio?: number; tam?: Vec3 }): {
  nombre: string;
  pos: Vec3;
  efecto?: string;
  radio?: number;
  tam?: Vec3;
} {
  return { nombre, pos, efecto, radio, tam };
}

export type TipoPortal =
  | "mundo"
  | "sala"
  | "estacion"
  | "servidor"
  | "punto";

export interface Portal {
  tipo: TipoPortal;
  id?: string;
  spawn?: string;
}

export function destinoDePortal(p: Portal): { tipo: string; ruta: string; privado: boolean } {
  let privado = false;
  switch (p.tipo) {
    case "mundo":
      return { tipo: "ruta", ruta: `/sala-xr/${p.id}`, privado: false };
    case "sala":
      return { tipo: "ruta", ruta: `/sala-xr/${encodeURIComponent(p.id || "")}`, privado: false };
    case "estacion":
      return { tipo: "ruta", ruta: `/estaciones/${p.id}`, privado: false };
    case "servidor":
      return { tipo: "ruta", ruta: "/servidores", privado: false };
    case "punto":
      return { tipo: "punto", spawn: p.spawn ?? "entrada", privado: false };
    default:
      return { tipo: "no-disponible", ruta: "", privado: true };
  }
}

export function anuncioDeEntrada(p: { nombre: string } | null): string | null {
  if (!p || !p.nombre) return null;
  return `Entra a ${p.nombre}`;
}

/** Efectos activados a partir de una lista de zonas y un conjunto de nombres activados. */
export function efectosActivos(zonas: readonly ReturnType<typeof zona>[], activados: Set<string>): {
  silencio: boolean;
  audioPrivado: string | null;
  gravedadCero: boolean;
  zonaSegura: boolean;
  escenario: string | null;
} {
  const silencio = zonas.some((z) => z.efecto === "silencio" && activados.has(z.nombre));
  const audioPrivado = zonas.find((z) => z.efecto === "audio-privado" && activados.has(z.nombre))?.nombre ?? null;
  const gravedadCero = zonas.some((z) => z.efecto === "gravedad-cero" && activados.has(z.nombre));
  const zonaSegura = zonas.some((z) => z.efecto === "zona-segura" && activados.has(z.nombre));
  const escenario = zonas.find((z) => z.efecto === "escenario" && activados.has(z.nombre))?.nombre ?? null;
  return { silencio, audioPrivado, gravedadCero, zonaSegura, escenario };
}

export type Cambios = { entra: string[]; sale: string[]; ahora: Set<string> };

/** Determina si un punto está dentro de una zona esférica (mayor lado como diámetro). */
export function dentroDeZona(shape: { pos: Vec3; radio: number }, punto: Vec3): boolean {
  const [px, py, pz] = punto;
  const [sx, sy, sz] = shape.pos;
  const dx = px - sx;
  const dy = py - sy;
  const radio = shape.radio;
  return dx * dx + dy * dy <= radio * radio;
}

/** Controla entrada y salida de zonas dado un nuevo posición y el estado anterior. */
export function cambiosDeZona(
  zonas: readonly ReturnType<typeof zona>[],
  anterior: Set<string>,
  ahora: Vec3,
): Cambios {
  const entra: string[] = [];
  const sale: string[] = [];
  const ahoraSet = new Set<string>();

  for (const z of zonas) {
    if (!z.pos) continue;
    const adentro = dentroDeZona({ pos: z.pos, radio: z.radio ?? 1 }, ahora);
    const nombre = z.nombre;
    if (adentro) {
      ahoraSet.add(nombre);
      if (!anterior.has(nombre)) entra.push(nombre);
    } else {
      if (anterior.has(nombre)) sale.push(nombre);
    }
  }

  return { entra, sale, ahora: ahoraSet };
}