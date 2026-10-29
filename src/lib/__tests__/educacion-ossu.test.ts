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

const todosLosCursos = nodosConOssu().flatMap((nodo) => cursosDeNodo(nodo));

describe("Currículo OSSU como datos (config/educacion-ossu.json)", () => {
    it("trae 63 cursos en 15 secciones", () => {
        expect(seccionesOssu()).toHaveLength(15);
        expect(todosLosCursos).toHaveLength(63);
    });

    it("cada sección y cada curso indican un nodo que existe en BUILTIN_NODES", () => {
        const ids = new Set(BUILTIN_NODES.map((n) => n.id));
        for (const s of seccionesOssu()) expect(ids.has(s.nodo)).toBe(true);
        for (const c of todosLosCursos) expect(ids.has(c.nodo)).toBe(true);
    });

    it("los cinco temas de informática nuevos existen bajo cat-tecnologia", () => {
        const nuevos = [
            "top-sistemas-computacion",
            "top-algoritmos",
            "top-seguridad-informatica",
            "top-bases-datos",
            "top-ingenieria-software",
        ];
        for (const id of nuevos) {
            const nodo = BUILTIN_NODES.find((n) => n.id === id);
            expect(nodo?.kind).toBe("topic");
            expect(nodo?.parentId).toBe("cat-tecnologia");
            expect(nodo?.name.length ?? 0).toBeGreaterThan(0);
        }
    });

    it("los ids de BUILTIN_NODES son únicos y cada parentId existe (o es null)", () => {
        const ids = new Set<string>();
        for (const n of BUILTIN_NODES) {
            expect(ids.has(n.id)).toBe(false);
            ids.add(n.id);
        }
        for (const n of BUILTIN_NODES) {
            if (n.parentId !== null) expect(ids.has(n.parentId)).toBe(true);
        }
    });

    it("todas las URLs de cursos son https:", () => {
        for (const c of todosLosCursos) expect(c.url.startsWith("https://")).toBe(true);
    });

    it("expone la versión y el aviso de licencia", () => {
        const v = versionOssu();
        expect(v.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(AVISO_LICENCIA_OSSU).toContain("licencias propias");
        expect(AVISO_LICENCIA_OSSU).toContain("enlaza");
    });

    it("cursosDeNodo filtra por nodo y devuelve [] con un nodo desconocido", () => {
        const prog = cursosDeNodo("top-programacion");
        expect(prog.length).toBeGreaterThan(0);
        for (const c of prog) expect(c.nodo).toBe("top-programacion");
        expect(cursosDeNodo("top-inexistente")).toEqual([]);
    });

    it("nodosConOssu no repite nodos y cada uno trae cursos", () => {
        const nodos = nodosConOssu();
        expect(new Set(nodos).size).toBe(nodos.length);
        for (const nodo of nodos) expect(cursosDeNodo(nodo).length).toBeGreaterThan(0);
    });

    it("buscarEnOssu('seguridad') devuelve cursos de seguridad, ordenados", () => {
        const r = buscarEnOssu("seguridad", 20);
        expect(r.length).toBeGreaterThan(0);
        // La coincidencia puede venir del nombre del curso o de los temas de su
        // sección; en ambos casos el resultado es de seguridad.
        for (const c of r) {
            const deSeguridad =
                c.nombre.toLowerCase().match(/secur/) !== null ||
                c.seccion.toLowerCase().match(/security/) !== null;
            expect(deSeguridad).toBe(true);
        }
        const ordenes = r.map((c) => c.orden);
        expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));
    });

    it("buscarEnOssu respeta el límite y no distingue acentos ni mayúsculas", () => {
        expect(buscarEnOssu("seguridad")).toHaveLength(5);
        expect(buscarEnOssu("seguridad", 3)).toHaveLength(3);
        expect(buscarEnOssu("").length).toBe(0);
        expect(buscarEnOssu("SEGURIDAD").length).toBe(5);
        expect(buscarEnOssu("Computación").length).toBeGreaterThan(0);
    });

    it("itinerarioOssu: una sección por sección OSSU, con un recurso por curso", () => {
        const it = itinerarioOssu();
        expect(it.kind).toBe("itinerario");
        expect(it.title).toContain("OSSU");
        expect(it.summary).toContain("licencias propias");
        expect(it.sections).toHaveLength(seccionesOssu().length);
        expect(it.sections.map((s) => s.title)).toEqual(seccionesOssu().map((s) => s.seccion));
        const recursos = it.sections.flatMap((s) => s.resources ?? []);
        expect(recursos).toHaveLength(63);
        for (const r of recursos) {
            expect(typeof r.url).toBe("string");
            expect((r.url ?? "").startsWith("https://")).toBe(true);
            expect((r.label ?? "").length).toBeGreaterThan(0);
            expect(r.kind).toBe("curso");
        }
    });

    it("el cuerpo de cada sección lista los temas entre comillas y cada curso con su duración y esfuerzo", () => {
        const it = itinerarioOssu();
        const primera = it.sections[0];
        expect(primera.body).toContain('"computation"');
        const cursosPrimera = cursosDePrimeraSeccion(primera.title);
        expect(cursosPrimera.length).toBeGreaterThan(0);
        for (const c of cursosPrimera) {
            expect(primera.body).toContain(`(${c.duracion}, ${c.esfuerzo})`);
        }
    });
});

// ── Ayudante local (puro, sin red) ────────────────────────────────────────

function cursosDePrimeraSeccion(titulo: string) {
    const sec = seccionesOssu().find((s) => s.seccion === titulo);
    if (!sec) return [];
    const porOrden = new Map(todosLosCursos.map((c) => [c.orden, c]));
    return sec.cursos.map((o) => porOrden.get(o)).filter((c): c is (typeof todosLosCursos)[number] => Boolean(c));
}
