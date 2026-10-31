/*
 * Pruebas del módulo ossu (currículo OSSU como datos) y de la integridad
 * del catálogo builtin de Educación contra los nodos que el dato requiere.
 * Todo es función pura: entrada → salida, sin red ni disco.
 */

import { describe, it, expect } from "vitest";
import { BUILTIN_NODES } from "@/lib/education/curriculum";
import {
    AVISO_LICENCIA_OSSU,
    buscarEnOssu,
    cursosDeNodo,
    itinerarioOssu,
    nodosConOssu,
    seccionesOssu,
    versionOssu,
} from "@/lib/education/ossu";
import datos from "../../../config/educacion-ossu.json";

const SECCIONES = datos.secciones as { seccion: string; nodo: string; temas: string[] }[];
const CURSOS = datos.cursos as { orden: number; nombre: string; url: string; nodo: string; seccion: string; alternativas: { url: string }[]; duracion: string; esfuerzo: string }[];

describe("dato de base config/educacion-ossu.json", () => {
    it("tiene 63 cursos y 15 secciones", () => {
        expect(CURSOS.length).toBe(63);
        expect(SECCIONES.length).toBe(15);
    });

    it("todas las URLs (cursos y alternativas) son https", () => {
        for (const c of CURSOS) {
            expect(c.url.startsWith("https:")).toBe(true);
            for (const alt of c.alternativas) expect(alt.url.startsWith("https:")).toBe(true);
        }
    });

    it("los ids de BUILTIN_NODES son únicos y cada parentId existe o es null", () => {
        const ids = new Set(BUILTIN_NODES.map((n) => n.id));
        expect(ids.size).toBe(BUILTIN_NODES.length);
        for (const n of BUILTIN_NODES) {
            if (n.parentId !== null) expect(ids.has(n.parentId)).toBe(true);
        }
    });
});

describe("integridad dato ↔ catálogo", () => {
    it("todo nodo del dato (secciones y cursos) existe en BUILTIN_NODES", () => {
        const ids = new Set(BUILTIN_NODES.map((n) => n.id));
        for (const s of SECCIONES) expect(ids.has(s.nodo), `sección ${s.seccion} → ${s.nodo}`).toBe(true);
        for (const c of CURSOS) expect(ids.has(c.nodo), `curso ${c.orden} → ${c.nodo}`).toBe(true);
    });

    it("nodosConOssu cubre cada curso y cada sección, y cursosDeNodo suma 63", () => {
        const nodos = nodosConOssu();
        expect(new Set(nodos).size).toBe(nodos.length);
        const cubreSecciones = SECCIONES.every((s) => nodos.includes(s.nodo));
        expect(cubreSecciones).toBe(true);
        const total = nodos.reduce((n, id) => n + cursosDeNodo(id).length, 0);
        expect(total).toBe(CURSOS.length);
    });

    it("los cinco temas nuevos están en cat-tecnologia con su nombre", () => {
        const esperados: Record<string, string> = {
            "top-sistemas-computacion": "Sistemas de Computación",
            "top-algoritmos": "Algoritmos y Teoría de la Computación",
            "top-seguridad-informatica": "Seguridad Informática",
            "top-bases-datos": "Bases de Datos",
            "top-ingenieria-software": "Ingeniería de Software",
        };
        for (const [id, nombre] of Object.entries(esperados)) {
            const nodo = BUILTIN_NODES.find((n) => n.id === id);
            expect(nodo?.name).toBe(nombre);
            expect(nodo?.parentId).toBe("cat-tecnologia");
        }
    });
});

describe("consultas del módulo", () => {
    it("versionOssu devuelve el commit y la fecha del dato", () => {
        const v = versionOssu();
        expect(typeof v.commit).toBe("string");
        expect(v.commit.length).toBeGreaterThan(0);
        expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("seccionesOssu devuelve el dato tal cual", () => {
        expect(seccionesOssu()).toHaveLength(15);
        expect(seccionesOssu().map((s) => s.seccion)).toEqual(SECCIONES.map((s) => s.seccion));
    });

    it("cursosDeNodo filtra por nodo y no devuelve cursos ajenos", () => {
        const deSeguridad = cursosDeNodo("top-seguridad-informatica");
        expect(deSeguridad.length).toBeGreaterThan(0);
        expect(deSeguridad.every((c) => c.nodo === "top-seguridad-informatica")).toBe(true);
        expect(cursosDeNodo("top-bases-datos").length).toBeGreaterThan(0);
        expect(cursosDeNodo("top-programacion")[0].orden).toBe(1);
        expect(cursosDeNodo("id-que-no-existe")).toEqual([]);
    });

    it("AVISO_LICENCIA_OSSU es copia del aviso del dato", () => {
        expect(AVISO_LICENCIA_OSSU).toBe(
            "El MIT cubre el texto del repositorio (la lista y su orden). Los cursos enlazados son de sus anfitriones (MIT OpenCourseWare, Open Learning Library, Harvard, Coursera, edX…) con licencias propias, a menudo no comerciales: el OS enlaza, nunca copia ni redistribuye su material.",
        );
    });
});

describe("itinerarioOssu", () => {
    it("tiene una sección por sección OSSU, en su orden", () => {
        const itin = itinerarioOssu();
        expect(itin.kind).toBe("itinerario");
        expect(itin.title.length).toBeGreaterThan(0);
        expect(itin.sections).toHaveLength(SECCIONES.length);
        expect(itin.sections.map((s) => s.title)).toEqual(SECCIONES.map((s) => s.seccion));
    });

    it("el resumen trae la versión y el aviso de licencia", () => {
        const { summary } = itinerarioOssu();
        expect(summary).toContain(versionOssu().commit);
        expect(summary).toContain(AVISO_LICENCIA_OSSU);
    });

    it("los cuerpos listan los temas en inglés entre comillas y cada curso con duración y esfuerzo", () => {
        const itin = itinerarioOssu();
        const base = new Map(itin.sections.map((s) => [s.title, s]));
        for (const s of SECCIONES) {
            const sec = base.get(s.seccion);
            expect(sec).toBeDefined();
            if (s.temas.length) {
                for (const tema of s.temas) expect(sec!.body).toContain(`"${tema}"`);
            } else {
                expect(sec!.body).not.toContain("Temas:");
            }
        }
        // Muestra puntual: el intro-CS es el curso orden 1.
        const intro = base.get("Intro CS");
        expect(intro?.body).toContain(`"${CURSOS[0].nombre}"`);
        expect(intro?.body).toContain(CURSOS[0].duracion);
        expect(intro?.body).toContain(CURSOS[0].esfuerzo);
    });

    it("ningún recurso queda sin URL y hay un recurso por curso de la sección", () => {
        const itin = itinerarioOssu();
        for (const s of itin.sections) {
            const esperados = CURSOS.filter((c) => c.seccion === s.title);
            expect(s.resources).toHaveLength(esperados.length);
            for (const r of s.resources ?? []) {
                expect(r.label).toBeTruthy();
                expect(r.url).toBeTruthy();
                expect(r.url!.startsWith("https:")).toBe(true);
                expect(r.kind).toBe("curso");
            }
        }
    });
});

describe("buscarEnOssu", () => {
    it("«seguridad» devuelve cursos de seguridad", () => {
        const res = buscarEnOssu("seguridad");
        expect(res.length).toBeGreaterThan(0);
        expect(res.every((c) => c.nodo === "top-seguridad-informatica")).toBe(true);
        expect(res.every((c) => res.indexOf(c) === res.lastIndexOf(c))).toBe(true);
    });

    it("ignora acentos y mayúsculas, con más de una palabra", () => {
        expect(buscarEnOssu("SEGURIDAD").map((c) => c.orden)).toEqual(
            buscarEnOssu("seguridad").map((c) => c.orden),
        );
        const conTema = buscarEnOssu("criptografía");
        expect(conTema.length).toBeGreaterThan(0);
        const doble = buscarEnOssu("operating sistemas");
        expect(doble.length).toBeGreaterThan(0);
    });

    it("sin coincidencia devuelve vacío, respeta max y limita la longitud", () => {
        expect(buscarEnOssu("zzzxqy")).toEqual([]);
        expect(buscarEnOssu("   ")).toEqual([]);
        expect(buscarEnOssu("seguridad", 2).length).toBeLessThanOrEqual(2);
        // 6+ cursos de seguridad existen; el max por defecto son 5.
        expect(buscarEnOssu("seguridad").length).toBe(5);
    });
});
