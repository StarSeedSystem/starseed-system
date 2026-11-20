/**
 * `/api/mando/estado` ligero por defecto (2026-10-13, medido).
 *
 * QUÉ: la respuesta pesaba 3,1 MB: 1,84 MB eran el Markdown entero de los 657 informes de ola y
 * 0,59 MB la descripción y los archivos de las 992 tareas. Solo el panel «Olas e informes» los
 * enseña; la cabecera de Genesis, MetaGenesis (también por el túnel, desde otro aparato), la flota,
 * los procesos, el diseñador y el bot de Telegram los recibían en cada sondeo y no los usan.
 *
 * CÓMO: por defecto viaja el estado SIN esos textos (los 30 informes más recientes, con nombre,
 * título y fecha; las tareas, todo menos `descripcion` y `archivos`). Quien los necesita pide `?completo=1`. El
 * cálculo es el mismo y compartido (`calculo-compartido.ts`): esto solo cambia lo que se envía.
 *
 * Módulo PURO (va también a pruebas de cliente): nada de `node:*`.
 */
import type { EstadoMando } from "./tipos";

/** Cuántos informes (solo nombre, título y fecha) viajan en la vista ligera. */
export const INFORMES_LIGERO = 30;

/** ¿La petición pide el estado completo (`?completo=1`)? */
export function quiereEstadoCompleto(url: string): boolean {
    try {
        const v = new URL(url, "http://localhost").searchParams.get("completo");
        return v === "1" || v === "si" || v === "true";
    } catch {
        return false;
    }
}

/** ¿La petición pide solo el resumen sin `tareas` (`?resumen=1`), p. ej. cabecera, procesos o flota? */
export function quiereEstadoResumen(url: string): boolean {
    if (quiereEstadoCompleto(url)) return false;
    try {
        const v = new URL(url, "http://localhost").searchParams.get("resumen");
        return v === "1" || v === "si" || v === "true";
    } catch {
        return false;
    }
}

/** PURA. El estado sin los textos largos que solo usa el panel de olas. No muta la entrada. */
export function estadoLigero(estado: EstadoMando): EstadoMando {
    return {
        ...estado,
        // Los más recientes primero (`informes[0]` es el último): fuera del panel de olas nadie los lista.
        informes: (estado.informes ?? []).slice(0, INFORMES_LIGERO).map(({ nombre, titulo, fecha }) => ({ nombre, titulo, fecha, markdown: "" })),
        tareas: (estado.tareas ?? []).map((t) => {
            const { descripcion: _d, archivos: _a, ...resto } = t;
            void _d;
            void _a;
            return resto;
        }),
        ligero: true,
    };
}

/** PURA. Como `estadoLigero`, pero sin el arreglo gigante `tareas` (solo lo pide `panel-olas`). No muta la entrada. */
export function estadoResumen(estado: EstadoMando): EstadoMando {
    return {
        ...estadoLigero(estado),
        tareas: [],
    };
}

const proyecciones = new WeakMap<EstadoMando, EstadoMando>();
const resumenes = new WeakMap<EstadoMando, EstadoMando>();

/** La proyección ligera, calculada una vez por estado (el estado se comparte 20 s entre todos). */
export function estadoLigeroCacheado(estado: EstadoMando): EstadoMando {
    let ligero = proyecciones.get(estado);
    if (!ligero) {
        ligero = estadoLigero(estado);
        proyecciones.set(estado, ligero);
    }
    return ligero;
}

/** La proyección resumen (sin `tareas`), calculada una vez por estado. */
export function estadoResumenCacheado(estado: EstadoMando): EstadoMando {
    let resumen = resumenes.get(estado);
    if (!resumen) {
        resumen = estadoResumen(estado);
        resumenes.set(estado, resumen);
    }
    return resumen;
}

export type ModoTextoEstado = boolean | "completo" | "ligero" | "resumen";

const textos = new WeakMap<EstadoMando, { completo?: string; ligero?: string; resumen?: string }>();

/** El JSON que se envía, serializado una vez por estado y variante (antes: una vez por petición). */
export function textoEstado(estado: EstadoMando, modo: ModoTextoEstado): string {
    const clave = modo === true || modo === "completo" ? "completo" : modo === "resumen" ? "resumen" : "ligero";
    const hechos = textos.get(estado) ?? {};
    let texto = hechos[clave];
    if (texto === undefined) {
        const valor =
            clave === "completo"
                ? estado
                : clave === "resumen"
                  ? estadoResumenCacheado(estado)
                  : estadoLigeroCacheado(estado);
        texto = JSON.stringify(valor);
        hechos[clave] = texto;
        textos.set(estado, hechos);
    }
    return texto;
}
