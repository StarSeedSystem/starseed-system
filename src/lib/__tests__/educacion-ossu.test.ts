import { describe, it, expect } from "vitest";
import { AVISO_LICENCIA_OSSU, buscarEnOssu, cursosDeNodo, cursosOssu, itinerarioOssu, nodosConOssu, seccionesOssu, versionOssu } from "../education/ossu";
import { BUILTIN_NODES } from "../education/curriculum";
import type { UpsertGuideInput } from "../education/study";

const IDS_NUEVOS = ["top-sistemas-computacion", "top-algoritmos", "top-seguridad-informatica", "top-bases-datos", "top-ingenieria-software"];

describe("Currículo OSSU como datos", () => {
    it("trae 63 cursos y 15 secciones, con la versión del commit del dato", () => {
        expect(cursosOssu()).toHaveLength(63);
        expect(seccionesOssu()).toHaveLength(15);
        const version = versionOssu();
        expect(version.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(version.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("AVISO_LICENCIA_OSSU cubre el MIT de la lista y la licencia de los anfitriones", () => {
        expect(AVISO_LICENCIA_OSSU).toContain("MIT");
        expect(AVISO_LICENCIA_OSSU).toContain("anfitriones");
        expect(AVISO_LICENCIA_OSSU).toContain("nunca copia ni redistribuye");
    });

    it("cada curso y cada sección del dato pertenece a un nodo builtin", () => {
        const ids = new Set(BUILTIN_NODES.map((nd) => nd.id));
        for (const c of cursosOssu()) expect(ids.has(c.nodo)).toBe(true);
        for (const s of seccionesOssu()) expect(ids.has(s.nodo)).toBe(true);
    });

    it("BUILTIN_NODES: ids únicos y cada parentId existe (null solo en categorías)", () => {
        const ids = new Set<string>();
        for (const nd of BUILTIN_NODES) {
            expect(ids.has(nd.id)).toBe(false);
            ids.add(nd.id);
        }
        for (const nd of BUILTIN_NODES) {
            if (nd.parentId === null) expect(nd.kind).toBe("category");
            else expect(ids.has(nd.parentId)).toBe(true);
        }
    });

    it("los cinco temas de informática nuevos bajo Tecnología están en el catálogo", () => {
        for (const id of IDS_NUEVOS) {
            const nd = BUILTIN_NODES.find((n) => n.id === id);
            expect(nd).toBeDefined();
            expect(nd?.parentId).toBe("cat-tecnologia");
            expect(nd?.kind).toBe("topic");
            expect((nd?.blurb ?? "").length).toBeGreaterThan(0);
        }
    });

    it("todas las URLs de cursos y alternativas son https:", () => {
        for (const c of cursosOssu()) {
            expect(c.url.startsWith("https:")).toBe(true);
            for (const alt of c.alternativas) expect(alt.url.startsWith("https:")).toBe(true);
        }
    });

    it("cursosDeNodo y nodosConOssu rinden lo indicado por el dato", () => {
        const deSeguridad = cursosDeNodo("top-seguridad-informatica");
        expect(deSeguridad).not.toHaveLength(0);
        for (const c of deSeguridad) expect(c.nodo).toBe("top-seguridad-informatica");
        expect(cursosDeNodo("nodo-fuera")).toHaveLength(0);
        const nodos = nodosConOssu();
        expect(new Set(nodos).size).toBe(nodos.length);
        for (const id of ["top-programacion", "top-ia", "top-calculo", "top-logica", "top-algebra", "top-estadistica", "cat-matematicas", "cat-tecnologia", ...IDS_NUEVOS]) {
            expect(nodos).toContain(id);
        }
    });

    it("buscarEnOssu('seguridad') devuelve cursos de seguridad", () => {
        const hallados = buscarEnOssu("seguridad");
        expect(hallados).not.toHaveLength(0);
        for (const c of hallados) expect(c.nodo).toBe("top-seguridad-informatica");
        expect(hallados.some((c) => c.nombre.includes("Cybersecurity"))).toBe(true);
        expect(buscarEnOssu("seguridad", 3)).toHaveLength(3);
        expect(buscarEnOssu("   ")).toHaveLength(0);
    });

    it("itinerarioOssu() es compatible con UpsertGuideInput (título, tema y resumen)", () => {
        const candidato: UpsertGuideInput = itinerarioOssu();
        expect(candidato.kind).toBe("itinerario");
        expect(candidato.title.length).toBeGreaterThan(0);
        expect((candidato.summary ?? "").length).toBeGreaterThan(0);
        expect(candidato.topic).toBeTruthy();
    });

    it("el itinerario tiene una sección por sección OSSU y ningún recurso sin URL", () => {
        const itinerario = itinerarioOssu();
        expect(itinerario.sections.map((parte) => parte.title)).toEqual(seccionesOssu().map((s) => s.seccion));
        for (const parte of itinerario.sections) {
            expect(parte.body.length).toBeGreaterThan(0);
            expect((parte.resources ?? []).length).toBeGreaterThan(0);
            for (const recurso of parte.resources ?? []) {
                expect((recurso.url ?? "").length).toBeGreaterThan(0);
                expect((recurso.url ?? "").startsWith("https:")).toBe(true);
                expect(recurso.kind).toBe("curso");
                expect(recurso.label.length).toBeGreaterThan(0);
            }
        }
    });

    it("cada sección del itinerario tiene un recurso por curso y lista sus temas y duraciones", () => {
        const itinerario = itinerarioOssu();
        for (const s of seccionesOssu()) {
            const parte = itinerario.sections.find((p) => p.title === s.seccion);
            expect(parte).toBeDefined();
            expect(parte!.resources).toHaveLength(cursosOssu().filter((c) => c.seccion === s.seccion).length);
            for (const tema of s.temas) expect(parte!.body).toContain(`"${tema}"`);
            for (const c of cursosOssu()) {
                if (c.seccion !== s.seccion) continue;
                expect(parte!.body).toContain(`duración ${c.duracion}`);
                expect(parte!.body).toContain(`esfuerzo ${c.esfuerzo}`);
            }
        }
    });
});
