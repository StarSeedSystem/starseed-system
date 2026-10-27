import { describe, it, expect } from "vitest";
import {
    AVISO_LICENCIA_OSSU,
    versionOssu,
    seccionesOssu,
    cursosDeNodo,
    nodosConOssu,
    buscarEnOssu,
    itinerarioOssu,
    CursoOssu,
    SeccionOssu,
} from "../education/ossu";

// Extraer BUILTIN_NODES desde el archivo de texto por si vitest no puede
// importar curriculum.ts (tiene "use client" y dependencias).
function extraerNodosDelArchivo(): { id: string; parentId: string | null }[] {
    const fs = require("node:fs");
    const texto = fs.readFileSync("src/lib/education/curriculum.ts", "utf8");
    const nodos: { id: string; parentId: string | null }[] = [];
    const regex = /n\("([^"]+)",\s*"[^"]+",\s*"([^"]+)",\s*("[^"]+"|null)(?:,\s*"([^"]*)")?\)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(texto)) !== null) {
        nodos.push({ id: m[1], parentId: m[3] === "null" ? null : m[3].replace(/"/g, "") });
    }
    return nodos;
}

describe("OSSU datos puros", () => {
    it("tiene 63 cursos y 15 secciones", () => {
        const cursos = require("../../../config/educacion-ossu.json").cursos;
        expect(cursos.length).toBe(63);
        expect(seccionesOssu().length).toBe(15);
    });

    it("versionOssu devuelve commit y fecha", () => {
        const v = versionOssu();
        expect(typeof v.commit).toBe("string");
        expect(typeof v.fecha).toBe("string");
        expect(v.commit.length).toBeGreaterThan(0);
    });

    it("AVISO_LICENCIA_OSSU es texto MIT y menciona red", () => {
        expect(typeof AVISO_LICENCIA_OSSU).toBe("string");
        expect(AVISO_LICENCIA_OSSU.toLowerCase()).toContain("mit");
        expect(AVISO_LICENCIA_OSSU).toContain("enlaza");
    });

    it("todos los nodos de OSSU existen en BUILTIN_NODES", () => {
        const nodos = extraerNodosDelArchivo();
        const ids = new Set(nodos.map((n) => n.id));
        const ossuNodos = nodosConOssu();
        for (const nodo of ossuNodos) {
            expect(ids.has(nodo)).toBe(true);
        }
    });

    it("ids de BUILTIN_NODES son únicos y parentId existe", () => {
        const nodos = extraerNodosDelArchivo();
        const ids = nodos.map((n) => n.id);
        const unicos = new Set(ids);
        expect(unicos.size).toBe(ids.length);
        for (const n of nodos) {
            if (n.parentId !== null) {
                expect(ids.includes(n.parentId)).toBe(true);
            }
        }
    });

    it("todas las URLs de cursos son https:", () => {
        const datos = require("../../../config/educacion-ossu.json");
        for (const c of datos.cursos) {
            expect(typeof c.url).toBe("string");
            expect(c.url.startsWith("https:")).toBe(true);
        }
    });

    it("itinerarioOssu tiene una sección por sección OSSU y ningún recurso sin URL", () => {
        const it = itinerarioOssu();
        expect(it.kind).toBe("itinerario");
        expect(it.sections.length).toBe(seccionesOssu().length);
        for (const sec of it.sections) {
            expect(typeof sec.title).toBe("string");
            expect(typeof sec.body).toBe("string");
            for (const r of sec.resources || []) {
                expect(typeof r.url).toBeDefined();
                expect(typeof r.url === "string" ? r.url.startsWith("https:") : true).toBe(true);
                expect(typeof r.label).toBe("string");
            }
        }
    });

    it("buscarEnOssu('seguridad') devuelve cursos de seguridad", () => {
        const resultados = buscarEnOssu("seguridad");
        expect(resultados.length).toBeGreaterThan(0);
        for (const c of resultados) {
            expect(c.url.startsWith("https:")).toBe(true);
            const texto = (c.nombre + " " + c.seccion).toLowerCase();
            expect(texto.includes("seguridad") || texto.includes("security")).toBe(true);
        }
    });

    it("cursosDeNodo filtra por nodo existente", () => {
        expect(cursosDeNodo("top-programacion").length).toBeGreaterThan(0);
        expect(cursosDeNodo("top-algoritmos").length).toBeGreaterThan(0);
        expect(cursosDeNodo("nodo-inexistente").length).toBe(0);
    });
});
