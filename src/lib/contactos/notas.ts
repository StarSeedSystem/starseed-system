/**
 * notas — funciones PURAS de la línea de tiempo privada de un contacto.
 * Mismo patrón de fusión LWW + lápidas que `modelo.ts` (reutiliza `fusionarPorId`/`maxIso`).
 */

import { nuevoId, maxIso, fusionarPorId, vivos } from "@/lib/contactos/modelo";
import { TIPOS_NOTA, type NotaContacto, type NotasDoc, type TipoNota } from "@/lib/contactos/tipos";

export interface CrearNotaInput {
    texto: string;
    tipo?: TipoNota;
    /** Fecha del hecho (ISO); por defecto, ahora. */
    fecha?: string;
    etiquetas?: string[];
}

function limpiarEtiquetas(xs: string[] | undefined): string[] {
    return (xs ?? []).map((e) => e.trim()).filter(Boolean);
}

export function crearNota(input: CrearNotaInput, ahora: string = new Date().toISOString()): NotaContacto {
    return {
        id: nuevoId(),
        fecha: input.fecha ?? ahora,
        tipo: input.tipo ?? "nota",
        texto: input.texto.trim(),
        etiquetas: limpiarEtiquetas(input.etiquetas),
        creado: ahora,
        actualizado: ahora,
        borrado: null,
    };
}

export function editarNota(
    n: NotaContacto,
    cambios: Partial<Pick<NotaContacto, "texto" | "tipo" | "fecha" | "etiquetas">>,
    ahora: string = new Date().toISOString(),
): NotaContacto {
    return {
        ...n,
        texto: cambios.texto !== undefined ? cambios.texto.trim() : n.texto,
        tipo: cambios.tipo ?? n.tipo,
        fecha: cambios.fecha ?? n.fecha,
        etiquetas: cambios.etiquetas !== undefined ? limpiarEtiquetas(cambios.etiquetas) : n.etiquetas,
        actualizado: ahora,
    };
}

/** Fusión LWW + lápidas de dos documentos de notas del MISMO contacto. Conmutativa. */
export function fusionarNotas(a: NotasDoc, b: NotasDoc): NotasDoc {
    return {
        v: 1,
        contactoId: a.contactoId || b.contactoId,
        notas: fusionarPorId(a.notas, b.notas),
        actualizado: maxIso(a.actualizado, b.actualizado),
    };
}

/** Notas vivas, de la más reciente a la más antigua por `fecha` (y `creado` como desempate). */
export function notasVivas(doc: NotasDoc): NotaContacto[] {
    return vivos(doc.notas)
        .slice()
        .sort((a, b) => {
            const df = (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0);
            if (df !== 0) return df;
            return (Date.parse(b.creado) || 0) - (Date.parse(a.creado) || 0);
        });
}

const MESES_ES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
];

export interface GrupoNotasPeriodo {
    /** `"AAAA-MM"`. */
    clave: string;
    anio: number;
    /** 1-12. */
    mes: number;
    /** `"septiembre de 2026"`. */
    titulo: string;
    notas: NotaContacto[];
}

/** Agrupa notas por mes de `fecha` (es-ES, minúsculas), más reciente primero. */
export function agruparPorPeriodo(notas: NotaContacto[]): GrupoNotasPeriodo[] {
    const mapa = new Map<string, GrupoNotasPeriodo>();
    for (const n of notas) {
        const d = new Date(n.fecha);
        if (Number.isNaN(d.getTime())) continue;
        const anio = d.getFullYear();
        const mesIdx = d.getMonth();
        const clave = `${anio}-${String(mesIdx + 1).padStart(2, "0")}`;
        let grupo = mapa.get(clave);
        if (!grupo) {
            grupo = { clave, anio, mes: mesIdx + 1, titulo: `${MESES_ES[mesIdx]} de ${anio}`, notas: [] };
            mapa.set(clave, grupo);
        }
        grupo.notas.push(n);
    }
    return Array.from(mapa.values()).sort((a, b) => (a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0));
}

export interface ResumenNotas {
    total: number;
    ultima?: NotaContacto;
    porTipo: Record<TipoNota, number>;
}

/** Total, última nota (por `fecha`) y recuento por tipo. */
export function resumenNotas(notas: NotaContacto[]): ResumenNotas {
    const porTipo = TIPOS_NOTA.reduce(
        (acc, t) => {
            acc[t.id] = 0;
            return acc;
        },
        {} as Record<TipoNota, number>,
    );
    let ultima: NotaContacto | undefined;
    for (const n of notas) {
        porTipo[n.tipo] = (porTipo[n.tipo] ?? 0) + 1;
        if (!ultima || (Date.parse(n.fecha) || 0) > (Date.parse(ultima.fecha) || 0)) ultima = n;
    }
    return { total: notas.length, ultima, porTipo };
}
