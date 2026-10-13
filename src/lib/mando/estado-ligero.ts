/**
 * `/api/mando/estado` ligero por defecto (2026-10-13, medido).
 *
 * QUÉ: la respuesta pesaba 3,1 MB: 1,84 MB eran el Markdown entero de los 657 informes de ola y
 * 0,59 MB la descripción y los archivos de las 992 tareas. Solo el panel «Olas e informes» los
 * enseña; la cabecera de Genesis, MetaGenesis (también por el túnel, desde otro aparato), la flota,
 * los procesos, el diseñador y el bot de Telegram los recibían en cada sondeo y no los usan.
 *
 * CÓMO: por defecto viaja el estado SIN esos textos (los informes conservan nombre, título y fecha;
 * las tareas, todo menos `descripcion` y `archivos`). Quien los necesita pide `?completo=1`. El
 * cálculo es el mismo y compartido (`calculo-compartido.ts`): esto solo cambia lo que se envía.
 *
 * Módulo PURO (va también a pruebas de cliente): nada de `node:*`.
 */
import type { EstadoMando } from "./tipos";

/** ¿La petición pide el estado completo (`?completo=1`)? */
export function quiereEstadoCompleto(url: string): boolean {
    try {
        const v = new URL(url, "http://localhost").searchParams.get("completo");
        return v === "1" || v === "si" || v === "true";
    } catch {
        return false;
    }
}

/** PURA. El estado sin los textos largos que solo usa el panel de olas. No muta la entrada. */
export function estadoLigero(estado: EstadoMando): EstadoMando {
    return {
        ...estado,
        informes: (estado.informes ?? []).map(({ nombre, titulo, fecha }) => ({ nombre, titulo, fecha, markdown: "" })),
        tareas: (estado.tareas ?? []).map((t) => {
            const { descripcion: _d, archivos: _a, ...resto } = t;
            void _d;
            void _a;
            return resto;
        }),
        ligero: true,
    };
}

const proyecciones = new WeakMap<EstadoMando, EstadoMando>();

/** La proyección ligera, calculada una vez por estado (el estado se comparte 8 s entre todos). */
export function estadoLigeroCacheado(estado: EstadoMando): EstadoMando {
    let ligero = proyecciones.get(estado);
    if (!ligero) {
        ligero = estadoLigero(estado);
        proyecciones.set(estado, ligero);
    }
    return ligero;
}

const textos = new WeakMap<EstadoMando, { ligero?: string; completo?: string }>();

/** El JSON que se envía, serializado una vez por estado y variante (antes: una vez por petición). */
export function textoEstado(estado: EstadoMando, completo: boolean): string {
    const hechos = textos.get(estado) ?? {};
    const clave = completo ? "completo" : "ligero";
    let texto = hechos[clave];
    if (texto === undefined) {
        texto = JSON.stringify(completo ? estado : estadoLigeroCacheado(estado));
        hechos[clave] = texto;
        textos.set(estado, hechos);
    }
    return texto;
}
