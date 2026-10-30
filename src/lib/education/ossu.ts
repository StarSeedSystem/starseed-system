/*
 * ossu — Currículo de Informática de OSSU (Open Source Society University)
 * como DATOS (`config/educacion-ossu.json`: 63 cursos, MIT del repositorio,
 * cursos enlazados de sus anfitriones — el OS ENLAZA, nunca copia). Puro.
 */

import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "@/lib/education/study";

export interface CursoOssu {
    orden: number;
    seccion: string;
    bloque: string;
    nombre: string;
    url: string;
    duracion: string;
    esfuerzo: string;
    requisitos: string;
    nodo: string;
}

export interface SeccionOssu {
    seccion: string;
    bloque: string;
    temas: string[];
    nodo: string;
}

interface DatosOssu {
    aviso_licencia: string;
    commit_main: string;
    fecha_commit: string;
    secciones: SeccionOssu[];
    cursos: CursoOssu[];
}

const OSSU = datos as unknown as DatosOssu;

/** Aviso de licencia: el MIT cubre la lista de OSSU, no el material de los cursos enlazados. */
export const AVISO_LICENCIA_OSSU: string = OSSU.aviso_licencia;

/** Versión del dato: commit de OSSU del que se leyó y fecha de esa lectura. */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: OSSU.commit_main, fecha: OSSU.fecha_commit };
}

/** Las 15 secciones del currículo, en el orden del repositorio. */
export function seccionesOssu(): SeccionOssu[] {
    return OSSU.secciones;
}

/** Cursos asignados a un nodo del catálogo de Educación, en su orden. */
export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return OSSU.cursos.filter((c) => c.nodo === nodoId);
}

/** Nodos del catálogo a los que apunta algo del dato (secciones, luego cursos), en orden de aparición. */
export function nodosConOssu(): string[] {
    const vistos = new Set<string>();
    const out: string[] = [];
    for (const s of OSSU.secciones) if (!vistos.has(s.nodo)) { vistos.add(s.nodo); out.push(s.nodo); }
    for (const c of OSSU.cursos) if (!vistos.has(c.nodo)) { vistos.add(c.nodo); out.push(c.nodo); }
    return out;
}

/** Sin acentos, sin mayúsculas: «Máquina» compara igual que "machine". */
function quitarAcentos(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Búsqueda por palabras en el nombre del curso y en los temas de su sección
 * (sin acentos ni mayúsculas). Devuelve hasta `max` cursos en su orden.
 */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = quitarAcentos(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    const textoSeccion = new Map(
        OSSU.secciones.map((s) => [s.seccion, `${s.seccion} ${s.temas.join(" ")}`] as const),
    );
    const out: CursoOssu[] = [];
    for (const c of OSSU.cursos) {
        const paja = quitarAcentos(`${c.nombre} ${textoSeccion.get(c.seccion) ?? ""}`);
        if (palabras.every((p) => paja.includes(p))) {
            out.push(c);
            if (out.length >= max) return out;
        }
    }
    return out;
}

/**
 * El currículo completo como itinerario de guías (forma de `UpsertGuideInput`
 * de study.ts): una sección por sección OSSU, el `body` lista los temas (en
 * inglés, tal cual están en el dato, entre comillas) y la duración y el
 * esfuerzo de cada curso; las URL van solo en los recursos.
 */
export function itinerarioOssu(): UpsertGuideInput {
    const secciones = OSSU.secciones.map((sec) => {
        const cursos = OSSU.cursos.filter((c) => c.seccion === sec.seccion);
        const lineas = sec.temas.length
            ? [`Temas: ${sec.temas.map((t) => `"${t}"`).join(", ")}.`]
            : [];
        for (const c of cursos) lineas.push(`- "${c.nombre}" · ${c.duracion} · ${c.esfuerzo}`);
        return {
            title: sec.seccion,
            body: lineas.join("\n"),
            resources: cursos.map((c) => ({ label: c.nombre, url: c.url, kind: "curso" as const })),
        };
    });
    const { commit, fecha } = versionOssu();
    return {
        title: "Currículo de Informática de OSSU",
        topic: "Programación",
        summary: `Ruta completa de ciencia de la computación de la Open Source Society University (OSSU), leída en ${fecha} del commit ${commit}. ${AVISO_LICENCIA_OSSU}`,
        kind: "itinerario",
        sections: secciones,
    };
}
