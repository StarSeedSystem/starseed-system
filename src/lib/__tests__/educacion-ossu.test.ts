/*
 * Pruebas del cargador OSSU: datos puros, sin red ni disco.
 * El dato vive en config/educacion-ossu.json (licencia MIT).
 */
import { describe, it, expect } from "vitest";
import {
    AVISO_LICENCIA_OSSU,
    versionOssu,
    seccionesOssu,
    cursosDeNodo,
    nodosConOssu,
    buscarEnOssu,
    itinerarioOssu,
} from "@/lib/education/ossu";
import { BUILTIN_NODES } from "@/lib/education/curriculum";
import datosOssu from "../../../config/educacion-ossu.json";

/** Recoge todas las cadenas con forma de URL de un dato JSON. */
function urlsDe(valor: unknown): string[] {
    const salida: string[] = [];
    const recorrer = (v: unknown) => {
        if (typeof v === "string") {
            if (v.startsWith("http")) salida.push(v);
        } else if (Array.isArray(v)) {
            v.forEach(recorrer);
        } else if (v && typeof v === "object") {
            Object.values(v).forEach(recorrer);
        }
    };
    recorrer(valor);
    return salida;
}
describe("cargador OSSU", () => {
    it("trae 63 cursos y 15 secciones", () => {
        expect(seccionesOssu().length).toBe(15);
        expect(nodosConOssu().length).toBeGreaterThan(0);
        const cursos = nodosConOssu().flatMap((nodo) => cursosDeNodo(nodo));
        expect(cursos.length).toBe(63);
        expect(seccionesOssu().reduce((t, s) => t + s.cursos.length, 0)).toBe(63);
    });

    it("cursosDeNodo respeta su nodo y el orden", () => {
        const seguridad = cursosDeNodo("top-seguridad-informatica");
        expect(seguridad.length).toBeGreaterThan(0);
        expect(seguridad.every((c) => c.nodo === "top-seguridad-informatica")).toBe(true);
        const ordenes = seguridad.map((c) => c.orden);
        expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
    });


    it("expone la versión y el aviso de licencia", () => {
        const v = versionOssu();
        expect(v.commit.length).toBe(40);
        expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(AVISO_LICENCIA_OSSU.length).toBeGreaterThan(40);
    });
});

describe("OSSU y el catálogo de Educación", () => {
    it("los ids de BUILTIN_NODES son únicos y cada parentId existe", () => {
        const ids = BUILTIN_NODES.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
        const porId = new Set(ids);
        for (const n of BUILTIN_NODES) {
            if (n.parentId !== null) expect(porId.has(n.parentId)).toBe(true);
        }
    });

    it("todo nodo del dato existe en BUILTIN_NODES", () => {
        const ids = new Set(BUILTIN_NODES.map((n) => n.id));
        for (const s of seccionesOssu()) expect(ids.has(s.nodo)).toBe(true);
        for (const nodo of nodosConOssu()) expect(ids.has(nodo)).toBe(true);
    });

    it("todas las URLs del dato son https:", () => {
        const urls = urlsDe(datosOssu);
        expect(urls.length).toBeGreaterThan(60);
        for (const u of urls) expect(u.startsWith("https://")).toBe(true);
    });
});

describe("búsqueda e itinerario OSSU", () => {
    it("buscarEnOssu('seguridad') devuelve cursos de seguridad", () => {
        const resultados = buscarEnOssu("seguridad");
        expect(resultados.length).toBeGreaterThan(0);
        expect(
            resultados.every((c) => c.nodo === "top-seguridad-informatica"),
        ).toBe(true);
    });

    it("respeta el máximo y lleva sin acentos ni mayúsculas", () => {
        expect(buscarEnOssu("SEGURIDAD", 3).length).toBeLessThanOrEqual(3);
        expect(buscarEnOssu("seguridad", 1).length).toBe(1);
        expect(buscarEnOssu("", 5)).toEqual([]);
        expect(buscarEnOssu("zzzz-nada", 5)).toEqual([]);
    });

    it("el itinerario tiene una sección por sección OSSU y recursos con URL", () => {
        const itinerario = itinerarioOssu();
        expect(itinerario.kind).toBe("itinerario");
        expect(itinerario.title.length).toBeGreaterThan(0);
        expect(itinerario.sections.length).toBe(seccionesOssu().length);
        for (const [i, s] of itinerario.sections.entries()) {
            expect(s.title).toBe(seccionesOssu()[i].seccion);
        }
        const recursos = itinerario.sections.flatMap((s) => s.resources ?? []);
        expect(recursos.length).toBe(63);
        for (const r of recursos) {
            expect(r.url).toMatch(/^https:\/\//);
            expect(r.kind).toBe("curso");
            expect(r.label.length).toBeGreaterThan(0);
        }
    });

    it("el cuerpo de cada sección lista temas y duración/esfuerzo", () => {
        const primera = itinerarioOssu().sections[0];
        expect(primera.body).toContain('"computation"');
        expect(primera.body).toContain("(14 weeks, 6-10 hours/week)");
    });
});
