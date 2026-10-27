import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
    AVISO_LICENCIA_OSSU,
    versionOssu,
    seccionesOssu,
    cursosDeNodo,
    nodosConOssu,
    buscarEnOssu,
    itinerarioOssu,
    type CursoOssu,
    type SeccionOssu,
} from "@/lib/education/ossu";

describe("educación OSSU", () => {
    it("tiene 63 cursos y 15 secciones", () => {
        expect(seccionesOssu().length).toBe(15);
        expect(seccionesOssu().reduce((acc, s) => acc + s.cursos.length, 0)).toBe(63);
    });

    it("cada curso queda en su sección, con su nodo", () => {
        const secciones = seccionesOssu();
        for (const s of secciones) {
            expect(s.cursos.length).toBeGreaterThan(0);
            for (const c of s.cursos) expect(c.seccion).toBe(s.seccion);
        }
    });

    it("todos los nodo existen en BUILTIN_NODES (ids extraídos del texto del archivo: curriculum.ts abre con \"use client\")", () => {
        const texto = readFileSync("src/lib/education/curriculum.ts", "utf8");
        const ids = new Set<string>();
        for (const m of texto.matchAll(/n\("([^"]+)"/g)) ids.add(m[1]);
        const nodos = nodosConOssu();
        expect(nodos.length).toBeGreaterThan(0);
        for (const n of nodos) expect(ids.has(n)).toBe(true);
    });
    it("los ids de BUILTIN_NODES son únicos y cada parentId existe", () => {
        const texto = readFileSync("src/lib/education/curriculum.ts", "utf8");
        const bloque = texto.slice(texto.indexOf("BUILTIN_NODES"), texto.indexOf("CATEGORY_COLORS"));
        const nodos = [...bloque.matchAll(/n\("([^"]+)",\s*"([^"]+)",\s*(?:"([^"]*)"|null),\s*("(?:[^"]+)"|null)/g)];
        const ids = nodos.map((m) => m[1]);
        expect(new Set(ids).size).toBe(ids.length);
        for (const m of nodos) {
            if (m[2] !== "category") expect(ids).toContain(m[4]!.replace(/"/g, ""));
        }
    });

    it("vienen del dato con su versión", () => {
        expect(versionOssu().commit.length).toBeGreaterThan(5);
        expect(versionOssu().fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(AVISO_LICENCIA_OSSU.length).toBeGreaterThan(20);
    });

    it("todas las URLs son https:", () => {
        const todas: string[] = seccionesOssu().flatMap((s) => s.cursos.map((c) => c.url));
        expect(todas.length).toBe(63);
        for (const u of todas) expect(u.startsWith("https:")).toBe(true);
        for (const r of itinerarioOssu().sections.flatMap((s) => s.resources ?? []))
            expect(r.url?.startsWith("https:")).toBe(true);
    });

    it("cursosDeNodo y nodosConOssu responden", () => {
        expect(cursosDeNodo("top-seguridad-informatica").length).toBeGreaterThan(0);
        expect(cursosDeNodo("top-mango")).toEqual([]);
        expect(nodosConOssu()).toContain("top-algoritmos");
    });

    it("buscarEnOssu('seguridad') devuelve cursos de seguridad", () => {
        const res: CursoOssu[] = buscarEnOssu("seguridad");
        expect(res.length).toBeGreaterThan(0);
        expect(res.length).toBeLessThanOrEqual(5);
        for (const c of res) {
            const texto = `${c.nombre} ${c.seccion} ${c.nodo}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            expect(texto).toContain("seguridad");
        }
    });

    it("itinerarioOssu tiene una sección por sección OSSU y ningún recurso sin URL", () => {
        const it = itinerarioOssu();
        expect(it.kind).toBe("itinerario");
        expect(it.title.length).toBeGreaterThan(0);
        for (const s of it.sections) {
            expect(s.title.length).toBeGreaterThan(0);
            expect(s.body.length).toBeGreaterThan(0);
            for (const r of s.resources ?? [] ) {
                expect(r.url).toBeTruthy();
                expect(r.kind).toBe("curso");
            }
        }
    });

    it("los tipos exportados cuadran con las funciones", () => {
        const cur: CursoOssu = seccionesOssu()[0].cursos[0];
        const sec: SeccionOssu = seccionesOssu()[0];
        expect(cur.nombre.length).toBeGreaterThan(0);
        expect(sec.temas.length).toBeGreaterThan(0);
    });
});
