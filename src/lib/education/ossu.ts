/*
 * ossu — Currículo abierto de Ciencias de la Computación (ossu/computer-science)
 * como datos consultables y como guía de estudio.
 * El contenido es una ENTIDAD única: aquí se ENLAZA, nunca se copia ni se
 * redistribuye material de curso. Funciones puras: sin red, disco ni reloj.
 * Fuente: config/educacion-ossu.json (MIT cubre la lista; cada curso conserva
 * la licencia de su anfitrión).
 */

import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "./study";

export interface AlternativaOssu {
    nombre: string;
    url: string;
}

export interface CursoOssu {
    orden: number; bloque: string; seccion: string; opcional_a_elegir: boolean;
    nombre: string; url: string; anfitrion: string; alternativas: AlternativaOssu[];
    duracion: string; esfuerzo: string; requisitos: string; nodo: string;
}

export interface SeccionOssu {
    seccion: string; bloque: string; temas: string[]; cursos: number[]; nodo: string;
}

interface DatosOssu {
    aviso_licencia: string; commit_main: string; fecha_commit: string;
    cursos_total: number; secciones: SeccionOssu[]; cursos: CursoOssu[];
}

const FUENTE = datos as unknown as DatosOssu;
const TITULO_ITINERARIO = "Ruta de Ciencias de la Computación (OSSU)";

/** Aviso de licencia: el MIT cubre la lista; cada curso conserva la suya. */
export const AVISO_LICENCIA_OSSU = FUENTE.aviso_licencia;

/** Commit y fecha de la copia del currículo que viaja con el OS. */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: FUENTE.commit_main, fecha: FUENTE.fecha_commit };
}

/** Las secciones del currículo, en el orden del dato. */
export function seccionesOssu(): SeccionOssu[] {
    return FUENTE.secciones.map((s) => ({ ...s, temas: [...s.temas], cursos: [...s.cursos] }));
}

/** Cursos enlazados a un nodo del catálogo de Educación. */
export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return FUENTE.cursos
        .filter((c) => c.nodo === nodoId)
        .sort((a, b) => a.orden - b.orden);
}

/** Ids de nodo del catálogo que tienen al menos un curso OSSU. */
export function nodosConOssu(): string[] {
    return [...new Set(FUENTE.cursos.map((c) => c.nodo))];
}

function normalizar(texto: string): string {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Búsqueda por palabras en el nombre del curso, los temas de su sección y el
 * id de su nodo (el tema del catálogo, con guiones como espacios). Sin acentos
 * ni mayúsculas; todas las palabras de la consulta deben aparecer.
 */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
    const limite = Math.floor(max);
    if (palabras.length === 0 || limite <= 0) return [];
    const temasPorSeccion = new Map(FUENTE.secciones.map((s) => [s.seccion, s.temas.join(" ")]));
    return FUENTE.cursos
        .filter((curso) => {
            const nodo = curso.nodo.replace(/-/g, " ");
            const texto = normalizar(
                `${curso.nombre} ${temasPorSeccion.get(curso.seccion) ?? ""} ${nodo}`,
            );
            return palabras.every((palabra) => texto.includes(palabra));
        })
        .sort((a, b) => a.orden - b.orden)
        .slice(0, limite);
}

function cuerpoSeccion(seccion: SeccionOssu): string {
    const temas = seccion.temas.map((t) => `"${t}"`).join(", ");
    const detalle = cursosDeSeccion(seccion.seccion).map((c) => `${c.nombre} (${c.duracion}; ${c.esfuerzo})`).join("; ");
    return `Temas: ${temas}. Cursos: ${detalle}.`;
}

function cursosDeSeccion(nombre: string): CursoOssu[] {
    return FUENTE.cursos
        .filter((c) => c.seccion === nombre)
        .sort((a, b) => a.orden - b.orden);
}

function recursosDeSeccion(nombre: string): { label: string; url: string; kind: string }[] {
    return cursosDeSeccion(nombre)
        .filter((c) => c.url.startsWith("https:"))
        .map((c) => ({ label: c.nombre, url: c.url, kind: "curso" }));
}

/** Guía de tipo «itinerario»: una sección por sección OSSU y un recurso por curso. */
export function itinerarioOssu(): UpsertGuideInput {
    return {
        title: TITULO_ITINERARIO,
        topic: "Tecnología",
        summary: `Currículo abierto de Ciencias de la Computación con ${FUENTE.cursos_total} cursos en ${FUENTE.secciones.length} secciones. El OS enlaza a los anfitriones; cada curso conserva su licencia.`,
        kind: "itinerario",
        sections: FUENTE.secciones.map((seccion) => ({
            title: seccion.seccion,
            body: cuerpoSeccion(seccion),
            resources: recursosDeSeccion(seccion.seccion),
        })),
    };
}
