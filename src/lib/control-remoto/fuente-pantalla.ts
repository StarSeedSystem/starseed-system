/**
 * RST04 · Fuente de pantalla pedida: regla pura (automática o fluida) y lo que se le dice a la persona.
 * Puro, sin red ni node:*. Solo tipos y funciones de entrada → salida.
 */

export type FuentePedida = "auto" | "proyeccion";

export const FUENTE_DEFECTO: FuentePedida = "auto";

export function fuentePedidaValida(x: unknown): FuentePedida {
    if (x === "auto" || x === "proyeccion") return x;
    return FUENTE_DEFECTO;
}

export type FuenteReal = "accesibilidad" | "proyeccion";

export interface VeredictoFuente {
    cumplida: boolean;
    aviso: string | null;
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): VeredictoFuente {
    if (pedida === "auto") {
        return { cumplida: true, aviso: null };
    }
    // pedida === "proyeccion"
    if (real === "proyeccion") {
        return { cumplida: true, aviso: null };
    }
    if (real === "accesibilidad") {
        return {
            cumplida: false,
            aviso: "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
        };
    }
    // real === null (aún sin pantalla)
    return { cumplida: false, aviso: null };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") return "Pantalla fluida (proyección)";
    if (real === "accesibilidad") return "Pantalla por accesibilidad";
    return "Pantalla: aún sin fuente";
}