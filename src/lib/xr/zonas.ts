/**
 * StarSeed XR · ZONAS Y PORTALES (RTXR1010, respuesta desde la rama de la nube). Lógica PURA: sin
 * React, sin three.js, sin `node:*`. Una zona es un volumen del espacio (esfera o caja) o solo un
 * efecto; al entrar sale una entrada (histéresis de 5 cm para no parpadear en el borde) y los
 * portales dicen a qué ruta o spawn llevan, con `privado` explícito.
 */

/** Posición y tamaño en metros: [x, y, z]. */
export type Vec3 = [number, number, number];
export type EfectoZona = "silencio" | "audio-privado" | "gravedad-cero" | "zona-segura" | "escenario" | "punto-reunion";

export interface Zona {
  nombre: string;
  efecto?: EfectoZona;
  /** Centro de la zona. Una zona sin pos no participa en la geometría (solo efectos). */
  pos?: Vec3;
  /** Radio de la esfera, desde el centro. */
  radio?: number;
  /** Tamaño completo (lado a lado) de la caja alineada a ejes, centrada en `pos`. */
  tam?: Vec3;
}

export function zona(nombre: string, opciones: { efecto?: EfectoZona; pos?: Vec3; radio?: number; tam?: Vec3 } = {}): Zona {
  return { nombre, ...opciones };
}

/** Histéresis al salir: una zona ocupada no se suelta hasta estar a esta distancia de su borde. */
export const HISTERESIS_M = 0.05;

/** Cuántos metros hay desde el punto al volumen, medidos hacia fuera (0 si está dentro). */
function distanciaExterior(z: Zona, punto: Vec3): number {
  if (!z.pos) return Infinity;
  const d: Vec3 = [punto[0] - z.pos[0], punto[1] - z.pos[1], punto[2] - z.pos[2]];
  if (z.radio !== undefined) return Math.max(0, Math.hypot(d[0], d[1], d[2]) - z.radio);
  if (z.tam) {
    const mitad: Vec3 = [z.tam[0] / 2, z.tam[1] / 2, z.tam[2] / 2];
    return Math.max(Math.max(0, Math.abs(d[0]) - mitad[0]), Math.max(0, Math.abs(d[1]) - mitad[1]), Math.max(0, Math.abs(d[2]) - mitad[2]));
  }
  return Infinity;
}

/** ¿Está el punto dentro de la zona? El borde cuenta como dentro; una zona sin forma nunca contiene. */
export function dentroDeZona(z: Zona, punto: Vec3): boolean {
  return distanciaExterior(z, punto) === 0;
}

/** Qué zonas se entran y sales al moverse a `punto`, con el estado anterior. */
export function cambiosDeZona(zonas: readonly Zona[], antes: ReadonlySet<string>, punto: Vec3): { entra: string[]; sale: string[]; ahora: Set<string> } {
  const ahora = new Set<string>();
  const entra: string[] = [];
  for (const z of zonas) {
    if (!z.pos) continue;
    if (dentroDeZona(z, punto) || (antes.has(z.nombre) && distanciaExterior(z, punto) <= HISTERESIS_M)) {
      ahora.add(z.nombre);
      if (!antes.has(z.nombre)) entra.push(z.nombre);
    }
  }
  const sale: string[] = [];
  for (const nombre of antes) if (!ahora.has(nombre)) sale.push(nombre);
  return { entra, sale, ahora };
}

/** Efectos en vigor según las zonas que se ocupan ahora mismo. */
export function efectosActivos(zonas: readonly Zona[], ocupadas: ReadonlySet<string>): {
  silencio: boolean;
  audioPrivado: string | null;
  gravedadCero: boolean;
  zonaSegura: boolean;
  escenario: string | null;
} {
  const vivas = zonas.filter((z) => z.efecto && ocupadas.has(z.nombre));
  const primeraDe = (efecto: EfectoZona): string | null => vivas.find((z) => z.efecto === efecto)?.nombre ?? null;
  return {
    silencio: primeraDe("silencio") !== null,
    audioPrivado: primeraDe("audio-privado"),
    gravedadCero: primeraDe("gravedad-cero") !== null,
    zonaSegura: primeraDe("zona-segura") !== null,
    escenario: primeraDe("escenario"),
  };
}

/** Aviso al entrar en una zona con efecto; una zona sin efecto no se anuncia. */
export function anuncioDeEntrada(z: Zona | null): string | null {
  if (!z?.efecto) return null;
  return `Entra a ${z.nombre}`;
}

export type TipoPortal = "mundo" | "sala" | "estacion" | "servidor" | "punto";

export interface Portal {
  tipo: TipoPortal;
  id?: string;
  /** Solo portales de tipo punto: spawn dentro de la sala. */
  spawn?: string;
  /** Un portal marcado privado solo se puede abrir desde dentro del espacio. */
  privado?: boolean;
}

export type DestinoPortal =
  | { tipo: "ruta"; ruta: string; privado: boolean }
  | { tipo: "punto"; spawn: string; privado: boolean }
  | { tipo: "no-disponible"; ruta: ""; privado: true };

/** A dónde lleva un portal: la sala XR real, su página existente o el spawn interior. */
export function destinoDePortal(p: Portal): DestinoPortal {
  const privado = p.privado === true;
  switch (p.tipo) {
    case "mundo":
      return { tipo: "ruta", ruta: `/sala-xr/${p.id ?? ""}`, privado };
    case "sala":
      return { tipo: "ruta", ruta: `/sala-xr/${encodeURIComponent(p.id ?? "")}`, privado };
    case "estacion":
      return { tipo: "ruta", ruta: `/estaciones/${p.id ?? ""}`, privado };
    case "servidor":
      return { tipo: "ruta", ruta: "/servidores", privado };
    case "punto":
      return { tipo: "punto", spawn: p.spawn ?? "entrada", privado };
    default:
      return { tipo: "no-disponible", ruta: "", privado: true };
  }
}
