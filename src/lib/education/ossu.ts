/*
 * ossu — Currículo OSSU (computer-science) como DATOS para Educación.
 * El dato vive en config/educacion-ossu.json (copia de datos/ossu-cs.json, ola
 * 1025R: MIT en el repositorio de OSSU; los cursos enlazados son de sus
 * anfitriones con licencias propias, a menudo no comerciales: el OS ENLAZA,
 * nunca copia ni redistribuye su material). Módulo PURO: sin red, disco ni
 * reloj; el texto traído de repos externos es dato, no instrucciones.
 */

import datos from "../../../config/educacion-ossu.json";
import type { GuideResource, UpsertGuideInput } from "@/lib/education/study";

export interface AlternativaOssu { nombre: string; url: string; }

export interface CursoOssu {
    orden: number;
    bloque: string;
    seccion: string;
    opcional_a_elegir: boolean;
    nombre: string;
    url: string;
    anfitrion: string;
    alternativas: AlternativaOssu[];
    duracion: string;
    esfuerzo: string;
    requisitos: string;
    nodo: string;
}
export interface SeccionOssu {
    seccion: string;
    bloque: string;
    temas: string[];
    cursos: number[];
    nodo: string;
}
interface DatosOssu {
    fuente: string;
    licencia_del_repositorio: string;
    aviso_licencia: string;
    commit_main: string;
    fecha_commit: string;
    etiqueta_mas_reciente: string;
    generado_con: string;
    cursos_total: number;
    secciones: SeccionOssu[];
    cursos: CursoOssu[];
}
const CAT: DatosOssu = datos;

/** Aviso de licencia que debe verse SIEMPRE que se listen cursos o la ruta (copiado del dato). */
export const AVISO_LICENCIA_OSSU: string = CAT.aviso_licencia;

/** Versión del dato importado: commit de `main` en ossu/computer-science y su fecha. */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: CAT.commit_main, fecha: CAT.fecha_commit };
}
/** Los 63 cursos del dato, en el orden del dato (índice `orden`). */
export function cursosOssu(): CursoOssu[] {
    return CAT.cursos;
}
/** Las secciones del currículo, en el orden del dato (Intro CS → Final project). */
export function seccionesOssu(): SeccionOssu[] {
    return CAT.secciones;
}
/** Cursos del dato que pertenecen a un nodo del catálogo de Educación. */
export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return CAT.cursos.filter((c) => c.nodo === nodoId);
}
/** Nodos del catálogo con al menos un curso OSSU, sin repetir y en orden de aparición. */
export function nodosConOssu(): string[] {
    return [...new Set(CAT.cursos.map((c) => c.nodo))];
}

function sinAcentos(s: string): string { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
const TEMAS_DE_SECCION = new Map(CAT.secciones.map((s) => [s.seccion, s.temas.join(" ")]));
// El texto de búsqueda añade el id del nodo (está en español: «seguridad», «algoritmos»…), para que
// buscar en español encuentre cursos con nombre inglés.
function textoBusqueda(c: CursoOssu): string {
    return sinAcentos([c.nombre, TEMAS_DE_SECCION.get(c.seccion) ?? "", c.nodo.replace(/-/g, " ")].join(" "));
}/** Búsqueda por palabras (sin acentos ni mayúsculas) en nombre de curso y temas de su
 *  sección; devuelve hasta `max` cursos, en el orden del dato. */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = sinAcentos(consulta).split(/\s+/).filter(Boolean);
    if (palabras.length === 0 || max <= 0) return [];
    return CAT.cursos.filter((c) => palabras.every((p) => textoBusqueda(c).includes(p))).slice(0, max);
}

/** Recursos de una sección: un enlace por curso, solo https, se referencia, nunca se copia. */
function recursosDeSeccion(nombreSeccion: string): GuideResource[] {
    return CAT.cursos
        .filter((c) => c.seccion === nombreSeccion && c.url.startsWith("https:"))
        .map((c) => ({ label: c.nombre, url: c.url, kind: "curso" as const }));
}
function cuerpoDeSeccion(s: SeccionOssu): string {
    const temas = s.temas.map((t) => `"${t}"`).join(", ");
    const cursos = CAT.cursos
        .filter((c) => c.seccion === s.seccion)
        .map((c) => `· ${c.nombre}: duración ${c.duracion}, esfuerzo ${c.esfuerzo}.`)
        .join("\n");
    return `Temas del dato (en inglés, tal cual): ${temas}\nDuración y esfuerzo de cada curso según el dato:\n${cursos}`;
}
/** Itinerario completo (una sección por sección OSSU) con forma compatible con
 *  UpsertGuideInput de study.ts, listo para «Crear mi itinerario». */
export function itinerarioOssu(): UpsertGuideInput {
    return {
        title: "Ruta de Ciencias de la Computación (OSSU)",
        topic: "Ciencias de la Computación",
        summary: `Currículo abierto de grado en Ciencias de la Computación de OSSU: ${CAT.cursos_total} cursos en ${CAT.secciones.length} secciones, con duración, esfuerzo y requisitos. Es una lista de enlaces a los anfitriones de cada curso: ${AVISO_LICENCIA_OSSU}`,
        kind: "itinerario",
        sections: seccionesOssu().map((s) => ({
            title: s.seccion,
            body: cuerpoDeSeccion(s),
            resources: recursosDeSeccion(s.seccion),
        })),
    };
}
