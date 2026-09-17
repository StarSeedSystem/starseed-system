/**
 * Tipos de una comprobación de directores, puros y sin red.
 *
 * No importa `node:child_process` aquí: eso rompió jsdom en septiembre.
 * El módulo de la ruta (`route.ts`) lanza el proceso; este solo describe
 * lo que se lanza y resume el resultado.
 */

export type ClaveMedidorComprobacion =
    | "en-curso"
    | "bloqueadas"
    | "listas"
    | "agentes"
    | "proveedores"
    | "memoria"
    | "disco"
    | "ola-activa"
    | "sin-publicar";

export interface VeredictoProceso {
    proceso: string;
    estado: "vivo" | "muerto" | "colgado" | "desconocido";
    detalle: string;
}

export interface Comprobacion {
    id: string;
    medidor: ClaveMedidorComprobacion;
    empezado: string;
    terminado: string | null;
    directores: string[];
    veredictos: VeredictoProceso[];
    resumen: string;
}

export interface ResumenComprobacion {
    frase: string;
    veredictos: number;
    vivos: number;
    muertos: number;
    colgados: number;
}

/** Resumen en una frase para la interfaz. Puro: sin disco ni red. */
export function resumirComprobacion(
    c: Comprobacion,
): ResumenComprobacion {
    const vivos = c.veredictos.filter(
        (v) => v.estado === "vivo",
    ).length;
    const muertos = c.veredictos.filter(
        (v) => v.estado === "muerto",
    ).length;
    const colgados = c.veredictos.filter(
        (v) => v.estado === "colgado",
    ).length;
    const total = c.veredictos.length;

    let frase: string;
    if (c.terminado === null) {
        frase = `Comprobación en curso para «${c.medidor}» · ${vivos}/${total} vivos`;
    } else if (total === 0) {
        frase = `Comprobación de «${c.medidor}» terminada sin procesos`;
    } else if (muertos === total) {
        frase = `Comprobación de «${c.medidor}» terminada: todo muerto (${total})`;
    } else if (colgados > 0) {
        frase = `Comprobación de «${c.medidor}» terminada: ${colgados} colgado(s), ${vivos} vivo(s)`;
    } else if (vivos === total) {
        frase = `Comprobación de «${c.medidor}» terminada: todos vivos`;
    } else {
        frase = `Comprobación de «${c.medidor}» terminada: ${vivos}/${total} vivos, ${muertos} muerto(s)`;
    }
    return {
        frase,
        veredictos: total,
        vivos,
        muertos,
        colgados,
    };
}
