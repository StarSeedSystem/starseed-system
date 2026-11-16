/**
 * RST1116A · regla pura de la fuente de pantalla: lo que se pide («auto» | «proyeccion»), lo que
 * contesta el aparato («accesibilidad» | «proyeccion» | null), el veredicto (¿se cumplió?) y el rótulo
 * para la persona. Sin red, sin disco, sin `node:*`.
 */

export type FuentePedida = "auto" | "proyeccion";

export const FUENTE_DEFECTO: FuentePedida = "auto";

export type FuenteReal = "accesibilidad" | "proyeccion";

export function fuentePedidaValida(x: unknown): FuentePedida {
    return x === "proyeccion" ? "proyeccion" : "auto";
}

export interface VeredictoFuente {
    cumplida: boolean;
    aviso: string | null;
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): VeredictoFuente {
    if (pedida === "auto") {
        return { cumplida: true, aviso: null };
    }
    if (real === null) {
        return { cumplida: false, aviso: null };
    }
    if (real === "proyeccion") {
        return { cumplida: true, aviso: null };
    }
    return {
        cumplida: false,
        aviso:
            "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
    };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") return "Pantalla fluida (proyección)";
    if (real === "accesibilidad") return "Pantalla por accesibilidad";
    return "Pantalla: aún sin fuente";
}