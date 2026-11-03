/**
 * Estado y textos del panel «Automejora» de Ajustes · Capas (MTN1027K · contrato §5).
 * PURO: sin `node:*`, red ni claves. Sanea lo que devuelve la ruta local y calcula la
 * versión activa frente a la anterior; si no hubo noche, el texto lo dice sin inventar.
 */

import type { ArchivoDirectivas, DirectivaCapa } from "./directivas";

export interface NocheAutomejora {
    fecha: string;
    donde: string | null;
    llamadas: number | null;
    motivo: string;
    propuestas: { task_id: string; titulo: string; capa: string }[];
    aprobadas: { capa: string; version: number | null; texto: string; acierto: number | null; base: number | null; n: number | null }[];
}

export interface ConfigAutomejoraVista {
    capas: Record<string, boolean>;
    aportar: Record<string, boolean>;
    preguntar: boolean;
    frecuencia: string;
    topeLlamadas: number | null;
}

export interface EstadoAutomejora {
    vacio: boolean;
    config: ConfigAutomejoraVista;
    directivas: Record<string, ArchivoDirectivas>;
    ultimaNoche: NocheAutomejora | null;
}

export const vacioAutomejora = (): EstadoAutomejora => ({
    vacio: true,
    config: { capas: {}, aportar: {}, preguntar: false, frecuencia: "noche", topeLlamadas: null },
    directivas: {},
    ultimaNoche: null,
});

const esObjeto = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Sanea la respuesta de la ruta: valores raros nunca rompen el panel. */
export function normalizarEstado(crudo: unknown): EstadoAutomejora {
    const estado = vacioAutomejora();
    if (!esObjeto(crudo)) return estado;
    estado.vacio = crudo.vacio === true;
    if (esObjeto(crudo.config)) {
        const c = crudo.config;
        for (const [capa, v] of Object.entries(esObjeto(c.capas) ? c.capas : {})) {
            if (typeof v === "boolean") estado.config.capas[capa] = v;
        }
        for (const [capa, v] of Object.entries(esObjeto(c.aportar) ? c.aportar : {})) {
            if (typeof v === "boolean") estado.config.aportar[capa] = v;
        }
        estado.config.preguntar = c.preguntar === true;
        if (typeof c.frecuencia === "string") estado.config.frecuencia = c.frecuencia;
        estado.config.topeLlamadas = numero(c.topeLlamadas);
    }
    if (esObjeto(crudo.directivas)) {
        for (const [capa, v] of Object.entries(crudo.directivas)) {
            if (esObjeto(v)) estado.directivas[capa] = v as unknown as ArchivoDirectivas;
        }
    }
    if (esObjeto(crudo.ultimaNoche) && Object.keys(crudo.ultimaNoche).length > 0) {
        const n = crudo.ultimaNoche;
        const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);
        estado.ultimaNoche = {
            fecha: texto(n.fecha),
            donde: typeof n.donde === "string" && n.donde ? n.donde : null,
            llamadas: numero(n.llamadas),
            motivo: texto(n.motivo),
            propuestas: lista(n.propuestas).map((p) => ({
                task_id: texto(p.task_id), titulo: texto(p.titulo), capa: texto(p.capa),
            })),
            aprobadas: lista(n.aprobadas).map((d) => ({
                capa: texto(d.capa), version: numero(d.version), texto: texto(d.texto),
                acierto: numero(d.acierto), base: numero(d.base), n: numero(d.n),
            })),
        };
    }
    return estado;
}

const CAPAS_CONOCIDAS = ["regla", "needle", "jev", "bitnet", "llm", "persona"];

/** Capas con interruptor: las conocidas más las que traigan la config o las directivas. */
export function capasVisibles(estado: EstadoAutomejora): string[] {
    return [...new Set([...CAPAS_CONOCIDAS, ...Object.keys(estado.config.capas), ...Object.keys(estado.directivas)])];
}

/** Versión activa y anterior (para enseñar el acierto de una frente a otra). */
export function compararVersiones(archivo?: ArchivoDirectivas): {
    activa: DirectivaCapa | null;
    anterior: DirectivaCapa | null;
} {
    if (!archivo || archivo.activa === null || !Array.isArray(archivo.historial)) return { activa: null, anterior: null };
    const activa = archivo.historial.find((d) => d.version === archivo.activa && d.estado === "activa") ?? null;
    if (!activa) return { activa: null, anterior: null };
    const anterior = archivo.historial
        .filter((d) => d.version < activa.version)
        .sort((a, b) => b.version - a.version)[0] ?? null;
    return { activa, anterior };
}

/** Acierto como porcentaje legible; sin medida, «—». */
export const porcentaje = (n: number | null | undefined): string =>
    typeof n === "number" && Number.isFinite(n) ? `${Math.round(n * 100)} %` : "—";

/** Texto honesto de la última noche; sin informe no se inventa nada. */
export function textoNoche(noche: NocheAutomejora | null): string {
    if (!noche) return "Aún no ha corrido";
    return `Última noche: ${noche.fecha || "sin fecha"}${noche.donde ? ` en ${noche.donde}` : ""}`;
}
