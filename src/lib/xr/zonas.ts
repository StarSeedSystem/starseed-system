/**
 * StarSeed XR · ZONAS Y PORTALES. Lógica pura: sin React, sin three.js, sin `node:*`.
 * Maneja zonas 3D, histéresis, efectos y destinos de portal.
 */
import { Rect } from "../protomolecula/orbe4d/eventos";

export const HISTERESIS_M = 5;

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
  const privado = p.tipo === "privado" || false;
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

function dentroDeZonaPunto(x: number, y: number, z: Rect): boolean {
  return x >= z.x && x <= z.x + z.ancho && y >= z.y && y <= z.y + z.alto;
}

/** Controla entrada y salida de zonas dado un nuevo posición y el estado anterior. */
export function cambiosDeZona(
  zonas: readonly ReturnType<typeof zona>[],
  anterior: Set<string>,
  ahora: [number, number, number],
): Cambios {
  entra: string[]; sale: string[]; ahora: Set<string>;
  const ahoraSet = new Set<string>();
  const entra: string[] = [];
  const sale: string[] = [];

  for (const z of zonas) {
    if (!z.pos) continue;
    const [px, py, pz] = ahora;
    const adentro = dentroDeZonaPunto(px, py, z.pos);
    if (adentro) {
      ahoraSet.add(z.nombre);
      if (!anterior.has(z.nombre)) entra.push(z.nombre);
    } else {
      if (anterior.has(z.nombre)) sale.push(z.nombre);
    }
  }

  return { entra, sale, ahora: ahoraSet };
}