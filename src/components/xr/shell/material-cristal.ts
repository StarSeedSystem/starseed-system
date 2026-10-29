/**
 * StarSeed XR · MATERIAL DE CRISTAL (XR1010H, contrato §3 b). Traduce el `ParamsMaterial` puro de
 * `src/lib/xr/tokens-3d.ts` a los nombres reales de three y construye la clase/instancia que pide
 * uikit. El módulo NO importa three: se inyecta para poder probarlo en Node sin WebGL.
 */

import type { ParamsMaterial } from "../../../lib/xr/tokens-3d";

export type ClaseMaterialTres = ParamsMaterial["clase"];

/** Propiedades de three (`Mesh*MaterialParameters`) con sus nombres canónicos. */
export type ArgsMaterial = Record<string, unknown>;

export type ConstructorMaterial = new (args: ArgsMaterial) => object;
export type MaterialesTres = Record<ClaseMaterialTres, ConstructorMaterial>;

/** `ParamsMaterial` → argumentos de `new THREE[clase]`. No escribe ningún color a mano. */
export function aArgsMaterial(p: ParamsMaterial): ArgsMaterial {
    const args: ArgsMaterial = {
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
    return args;
}

function fabrica(THREE: unknown, clase: ClaseMaterialTres): ConstructorMaterial {
    return (THREE as MaterialesTres)[clase];
}

/** Instancia la clase que pide `p.clase` con los argumentos ya traducidos. */
export function crearMaterial(THREE: unknown, p: ParamsMaterial): object {
    return new (fabrica(THREE, p.clase))(aArgsMaterial(p));
}

/**
 * Clase derivada de `THREE[p.clase]` que uikit acepta en `panelMaterialClass`: uikit construye el
 * material sin argumentos, así que la clase los lleva dentro y los pasa a `super`.
 */
export function crearClaseMaterial(THREE: unknown, p: ParamsMaterial): ConstructorMaterial {
    const Base = fabrica(THREE, p.clase);
    const args = aArgsMaterial(p);
    return class extends Base {
        constructor() {
            super(args);
        }
    };
}
