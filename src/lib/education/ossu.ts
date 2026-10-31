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

export const AVISO_LICENCIA_OSSU: string = OSSU.aviso_licencia;

export function versionOssu(): { commit: string; fecha: string } {
    return { commit: OSSU.commit_main, fecha: OSSU.fecha_commit };
}

export function seccionesOssu(): SeccionOssu[] {
    return OSSU.secciones;
}

export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return OSSU.cursos.filter((c) => c.nodo === nodoId);
}

export function nodosConOssu(): string[] {
    const vistos = new Set<string>();
    const out: string[] = [];
    for (const s of OSSU.secciones) if (!vistos.has(s.nodo)) { vistos.add(s.nodo); out.push(s.nodo); }
    for (const c of OSSU.cursos) if (!vistos.has(c.nodo)) { vistos.add(c.nodo); out.push(c.nodo); }
    return out;
}

function quitarAcentos(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const ESPAÑOL_A_INGLÉS: Record<string, string[]> = {
    algoritmo: ["algorithm"],
    algoritmos: ["algorithms"],
    bases: ["databases"],
    datos: ["data"],
    criptografia: ["cryptography"],
    encriptacion: ["cryptography"],
    programacion: ["programming"],
    red: ["network"],
    redes: ["networks"],
    seguridad: ["security"],
    sistema: ["system"],
    sistemas: ["systems"],
};

export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = quitarAcentos(consulta)
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => [p, ...(ESPAÑOL_A_INGLÉS[quitarAcentos(p)] ?? [])]);
    if (!palabras.length) return [];
    const textoSeccion = new Map(
        OSSU.secciones.map((s) => [s.seccion, `${s.seccion} ${s.temas.join(" ")}`] as const),
    );
    const out: CursoOssu[] = [];
    for (const c of OSSU.cursos) {
        const paja = quitarAcentos(`${c.nombre} ${textoSeccion.get(c.seccion) ?? ""}`);
        if (palabras.every((formas) => formas.some((f) => paja.includes(f)))) {
            out.push(c);
            if (out.length >= max) return out;
        }
    }
    return out;
}

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