/**
 * StarSeed XR · MATERIAL DEL CRISTAL (XR1010H, §3 b). Traduce los parámetros del núcleo
 * (`paramsMaterial` de `tokens-3d.ts`) a argumentos de three y crea el material con three
 * INYECTADO, para poder probar en node sin WebGL. No escribe ningún color: todo sale de
 * `tokens-3d.ts`. Módulo PURO (sin `node:*`, sin importar three).
 */
import type { ParamsMaterial } from "@/lib/xr/tokens-3d";
import { altoMinimoTexto } from "@/lib/xr/confort";
import { TEXTO_MIN_DEG } from "@/lib/xr/espacio-trinity";

/** Constructor mínimo de un material de three (inyectado). */
export type ConstructorMaterial = new (argumentos?: Record<string, unknown>) => object;

/** Lo único que se usa de three: sus tres clases de material. */
export interface ThreeMinimo {
    MeshBasicMaterial: ConstructorMaterial;
    MeshStandardMaterial: ConstructorMaterial;
    MeshPhysicalMaterial: ConstructorMaterial;
}

export interface ArgsMaterial {
    clase: ParamsMaterial["clase"];
    args: Record<string, unknown>;
}

/** Propiedades de three con sus nombres reales; las opcionales solo aparecen si el perfil las pide. */
export function aArgsMaterial(p: ParamsMaterial): ArgsMaterial {
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

/** Instancia el material con el three inyectado: `new THREE[clase](args)`. */
export function crearMaterial(THREE: ThreeMinimo, p: ParamsMaterial): object {
    const { clase, args } = aArgsMaterial(p);
    return new THREE[clase](args);
}

/**
 * Clase derivada de la que pide `p.clase`, que es lo que espera `panelMaterialClass` de uikit:
 * uikit la instancia con `new` y después aplica su propia configuración de panel.
 */
export function crearClaseMaterial(THREE: ThreeMinimo, p: ParamsMaterial): ConstructorMaterial {
    const { args } = aArgsMaterial(p);
    const Base = THREE[p.clase];
    class ClasePanel extends Base {
        constructor() {
            super(args);
        }
    }
    return ClasePanel;
}

/** Alto (m) mínimo de una línea de texto: nunca por debajo de `grados` de arco (1° por defecto). */
export function tamanoTextoMinimo(distancia: number, grados: number = TEXTO_MIN_DEG): number {
    const g = Number.isFinite(grados) ? grados : TEXTO_MIN_DEG;
    return altoMinimoTexto(distancia, g);
}
