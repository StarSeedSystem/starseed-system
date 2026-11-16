/**
 * Control remoto · fuente de pantalla pedida y real (RST1116A).
 * Módulo puro, sin dependencias externas, sin red ni disco.
 */

export type FuentePedida = "auto" | "proyeccion";
export const FUENTE_DEFECTO: FuentePedida = "auto";

export type FuenteReal = "accesibilidad" | "proyeccion";

export function fuentePedidaValida(x: unknown): FuentePedida {
    if (x === "proyeccion") return "proyeccion";
    return "auto";
}

export interface VeredictoFuente {
    cumplida: boolean;
    aviso: string | null;
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): VeredictoFuente {
    if (pedida === "auto") {
        return { cumplida: true, aviso: null };
    }
    if (real === "proyeccion") {
        return { cumplida: true, aviso: null };
    }
    if (real === "accesibilidad") {
        return {
            cumplida: false,
            aviso: "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
        };
    }
    return { cumplida: false, aviso: null };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") {
        return "Pantalla fluida (proyección)";
    }
    if (real === "accesibilidad") {
        return "Pantalla por accesibilidad";
    }
    return "Pantalla: aún sin fuente";
}
