/**
 * UNI1116A · fuente de pantalla pedida y real, veredicto y rótulo.
 * Costo: 1 archivo de escritura pura, ≤ 120 líneas, sin `node:*`, sin lanzamientos,
 * sin red, sin disco: solo tipos y lógica booleana sobre cadenas.
 *
 * `FuentePedida` = fuente que la persona solicita (auto o proyección).
 * `FUENTE_DEFECTO` = "auto" cuando no se informa.
 * `FuenteReal` = fuente efectiva que responde el aparato (accesibilidad o proyección).
 * `veredictoFuente` = si la petición se cumplió respecto a la realidad.
 * `rotuloFuente` = texto para mostrar en la UI.
 */

export type FuentePedida = "auto" | "proyeccion";

export const FUENTE_DEFECTO = "auto";

export type FuenteReal = "accesibilidad" | "proyeccion";

export function fuentePedidaValida(x: unknown): FuentePedida {
    if (typeof x === "string" && (x === "auto" || x === "proyeccion")) return x;
    return "auto";
}

export function veredictoFuente(pedida: FuentePedida, real: FuenteReal | null): { cumplida: boolean; aviso: string | null } {
    if (pedida === "auto") return { cumplida: true, aviso: null };
    if (pedida === "proyeccion") {
        if (real === "proyeccion") return { cumplida: true, aviso: null };
        if (real === "accesibilidad") {
            return {
                cumplida: false,
                aviso:
                    "Pediste la pantalla fluida, pero este aparato la está mandando por accesibilidad (menos fluida). Hace falta la proyección de pantalla en ese aparato.",
            };
        }
        if (real === null) return { cumplida: false, aviso: null };
    }
    return { cumplida: false, aviso: null };
}

export function rotuloFuente(real: FuenteReal | null): string {
    if (real === "proyeccion") return "Pantalla fluida (proyección)";
    if (real === "accesibilidad") return "Pantalla por accesibilidad";
    return "Pantalla: aún sin fuente";
}