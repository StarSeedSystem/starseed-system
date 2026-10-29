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

const IDS = new Set(BUILTIN_NODES.map((n) => n.id));

function todosLosCursos() {
    return nodosConOssu().flatMap((nodo) => cursosDeNodo(nodo));
}

describe("currículo OSSU como datos", () => {
    it("trae 63 cursos en 15 secciones", () => {
        expect(seccionesOssu()).toHaveLength(15);
        expect(todosLosCursos()).toHaveLength(63);
    });

    it("cada sección y cada curso apuntan a un nodo del catálogo", () => {
        for (const seccion of seccionesOssu()) {
            expect(IDS.has(seccion.nodo)).toBe(true);
        }
        for (const curso of todosLosCursos()) {
            expect(IDS.has(curso.nodo)).toBe(true);
        }
    });

    it("los ids del catálogo son únicos y cada parentId existe", () => {
        const ids = BUILTIN_NODES.map((nodo) => nodo.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const nodo of BUILTIN_NODES) {
            if (nodo.parentId !== null) {
                expect(ids).toContain(nodo.parentId);
            }
        }
    });

    it("expone la versión y el aviso de licencia", () => {
        expect(versionOssu().commit).toMatch(/^[0-9a-f]{7,40}$/);
        expect(versionOssu().fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(AVISO_LICENCIA_OSSU).toContain("MIT");
    });

    it("todas las URLs enlazan por https", () => {
        for (const curso of todosLosCursos()) {
            expect(curso.url.startsWith("https:")).toBe(true);
            for (const alternativa of curso.alternativas) {
                expect(alternativa.url.startsWith("https:")).toBe(true);
            }
        }
        for (const seccion of itinerarioOssu().sections) {
            for (const recurso of seccion.resources ?? []) {
                expect(recurso.url?.startsWith("https:")).toBe(true);
            }
        }
    });

    it("el itinerario tiene una sección por sección y ningún recurso sin URL", () => {
        const itinerario = itinerarioOssu();
        expect(itinerario.kind).toBe("itinerario");
        expect(itinerario.sections).toHaveLength(seccionesOssu().length);

        const recursos = itinerario.sections.flatMap((seccion) => seccion.resources ?? []);
        expect(recursos).toHaveLength(63);
        for (const recurso of recursos) {
            expect(recurso.kind).toBe("curso");
            expect(recurso.label.length).toBeGreaterThan(0);
            expect(recurso.url?.startsWith("https:")).toBe(true);
        }
        for (const seccion of itinerario.sections) {
            expect(seccion.title.length).toBeGreaterThan(0);
            expect(seccion.body.length).toBeGreaterThan(0);
        }
    });

    it("busca seguridad sin acentos ni mayúsculas", () => {
        const resultados = buscarEnOssu("SEGURIDAD");
        expect(resultados.length).toBeGreaterThan(0);
        for (const curso of resultados) {
            expect(curso.nodo).toBe("top-seguridad-informatica");
        }
    });
});
