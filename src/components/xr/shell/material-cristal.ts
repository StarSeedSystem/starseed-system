/**
 * StarSeed XR · MATERIAL DE CRISTAL (XR1010H · contrato `architecture/starseed-xr.md` §3 b).
 *
 * Traduce el `ParamsMaterial` del núcleo (`tokens-3d.ts`) a los nombres de three y construye la
 * clase que uikit pide en `panelMaterialClass` (una clase SIN argumentos: uikit la instancia él).
 * `THREE` se inyecta para que todo esto se pruebe en node sin WebGL. Módulo PURO.
 */
import type { ParamsMaterial } from "../../../lib/xr/tokens-3d";
import { COLORES_NODO, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { TEXTO_MIN_DEG } from "../../../lib/xr/espacio-trinity";
import { altoMinimoTexto } from "../../../lib/xr/confort";

export type ClaseMaterial = ParamsMaterial["clase"];

/** Lo mínimo que necesitamos de un material de three (los tests usan uno falso). */
export interface MaterialInstancia {
    [propiedad: string]: unknown;
}
export type ConstructorMaterial = new (args?: Record<string, unknown>) => MaterialInstancia;

/** Forma mínima del namespace de three que se inyecta; evita `any` y no importa el motor. */
export interface ThreeMinimo {
    MeshBasicMaterial: ConstructorMaterial;
    MeshStandardMaterial: ConstructorMaterial;
    MeshPhysicalMaterial: ConstructorMaterial;
}

export const PIXELES_POR_METRO = 1000;

export const pixeles = (metros: number): number =>
    Math.max(0, Number.isFinite(metros) ? metros : 0) * PIXELES_POR_METRO;

/** Args de three a partir del material del núcleo. Solo incluye lo que el nivel define. */
export function aArgsMaterial(p: ParamsMaterial): { clase: ClaseMaterial; args: Record<string, unknown> } {
    const args: Record<string, unknown> = {
        color: p.color,
        opacity: p.opacidad,
        transparent: p.transparente,
    };
    if (p.rugosidad !== undefined) args.roughness = p.rugosidad;
    if (p.metalico !== undefined) args.metalness = p.metalico;
    if (p.transmision !== undefined) args.transmission = p.transmision;
    if (p.grosor !== undefined) args.thickness = p.grosor;
    if (p.ior !== undefined) args.ior = p.ior;
    if (p.dispersion !== undefined) args.dispersion = p.dispersion;
    if (p.intensidadEntorno !== undefined) args.envMapIntensity = p.intensidadEntorno;
    return { clase: p.clase, args };
}

/** Instancia el material de three sin WebGL: `new THREE[clase](args)` con el namespace inyectado. */
export function crearMaterial(THREE: ThreeMinimo, p: ParamsMaterial): MaterialInstancia {
    const { clase, args } = aArgsMaterial(p);
    return new THREE[clase](args);
}

/**
 * Clase sin argumentos que uikit instancia desde `panelMaterialClass`. Hereda de la clase que pide
 * el nivel (Basic/Standard/Physical) y aplica los args del contrato en su constructor.
 */
export function claseMaterialPanel(THREE: ThreeMinimo, p: ParamsMaterial): new () => MaterialInstancia {
    const { clase, args } = aArgsMaterial(p);
    const Base = THREE[clase];
    return class extends Base {
        constructor() {
            super(args);
        }
    };
}

/** Token #rrggbb con alfa → `rgba(...)`, que es como uikit lee la opacidad del borde. */
export function colorConAlfa(hex: string, alfa: number): string {
    const h = hex.replace("#", "");
    const canal = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    const a = Math.min(1, Math.max(0, Number.isFinite(alfa) ? alfa : 0));
    return `rgba(${canal(0)}, ${canal(2)}, ${canal(4)}, ${a})`;
}

/** Curvatura en metros → inclinación del borde de uikit (0–1); `undefined` si el panel es plano. */
export function curvaturaABorde(curvatura?: number | null): number | undefined {
    if (curvatura == null || !Number.isFinite(curvatura) || curvatura <= 0) return undefined;
    return Math.min(1, Math.max(0, 0.5 / curvatura));
}

/** Alto mínimo REAL (m) de una línea de texto a `distancia` m para medir `grados` de arco. */
export function altoTextoMinimo(distancia: number, grados: number = TEXTO_MIN_DEG): number {
    return altoMinimoTexto(distancia, grados);
}

/**
 * `fontSize` para uikit (px, 1000 px = 1 m): nunca por debajo del mínimo angular. Si quien llama
 * pide uno mayor, se respeta; el texto jamás se pinta por debajo de 1° de arco por defecto.
 */
export function fontSizeTexto(distancia: number, grados: number = TEXTO_MIN_DEG, fontSize?: number): number {
    const minimo = pixeles(altoTextoMinimo(distancia, grados));
    return Math.max(minimo, fontSize ?? 0);
}

/** Color de acento del nodo; ningún componente escribe un color a mano. */
export const colorAcento = (nodo: NodoCardinal): string => COLORES_NODO[nodo].vivo;
