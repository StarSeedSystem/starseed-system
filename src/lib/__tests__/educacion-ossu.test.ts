/*
 * Pruebas de src/lib/education/ossu.ts y de los nodos nuevos del catálogo
 * (curriculum.ts). Solo funciones puras: nada de red, disco ni procesos.
 *
 * Nota: BUILTIN_NODES se importa por módulo; si vitest no puede cargarlo
 * (curriculum.ts arrastra dependencias de cliente), se extraen los ids
 * n("id", …, parentId) del texto del archivo, con la misma garantía de forma.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    AVISO_LICENCIA_OSSU,
    buscarEnOssu,
    cursosDeNodo,
    itinerarioOssu,
    nodosConOssu,
    seccionesOssu,
    versionOssu,
} from "@/lib/education/ossu";
import type { UpsertGuideInput } from "@/lib/education/study";
import type { EduNode } from "@/lib/education/curriculum";

type NodoPlano = { id: string; parentId: string | null; name?: string };

async function nodosBuiltin(): Promise<NodoPlano[]> {
    try {
        const mod = await import("@/lib/education/curriculum");
        return mod.BUILTIN_NODES.map((n: EduNode) => ({ id: n.id, parentId: n.parentId, name: n.name }));
    } catch {
        const texto = readFileSync(
            path.join(process.cwd(), "src/lib/education/curriculum.ts"),
            "utf8",
        );
        const re = /\bn\(\s*"([^"]+)",\s*"(?:category|topic|subtopic)",\s*"[^"]*",\s*(null|"[^"]+")/g;
        const out: NodoPlano[] = [];
        for (const m of texto.matchAll(re)) {
            out.push({ id: m[1], parentId: m[2] === "null" ? null : JSON.parse(m[2]) });
        }
        if (out.length === 0) throw new Error("No se pudieron extraer los nodos del catálogo");
        return out;
    }
}

const nodos: NodoPlano[] = await nodosBuiltin();
const idsBuiltin = new Set(nodos.map((n) => n.id));

describe("dato OSSU · volumen y trazabilidad", () => {
    it("hay 63 cursos y 15 secciones (una recurso por curso en el itinerario)", () => {
        const itin = itinerarioOssu();
        expect(itin.sections.length).toBe(15);
        const recursos = itin.sections.flatMap((s) => s.resources ?? []);
        expect(recursos.length).toBe(63);
    });

    it("seccionesOssu reproduce el dato y versionOssu trae commit y fecha", () => {
        expect(seccionesOssu().length).toBe(15);
        for (const s of seccionesOssu()) {
            expect(s.seccion.length).toBeGreaterThan(0);
            expect(s.cursos.length).toBeGreaterThan(0);
        }
        const v = versionOssu();
        expect(v.commit.length).toBeGreaterThan(10);
        expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("el aviso de licencia dice que el OS enlaza y no redistribuye", () => {
        expect(AVISO_LICENCIA_OSSU.length).toBeGreaterThan(80);
        expect(AVISO_LICENCIA_OSSU).toContain("enlaza");
        expect(AVISO_LICENCIA_OSSU).toContain("no copia");
    });
});

describe("nodos del catálogo de Educación", () => {
    it("los ids son únicos y cada parentId existe en el catálogo builtin", () => {
        const vistos = new Set<string>();
        for (const n of nodos) {
            expect(vistos.has(n.id)).toBe(false);
            vistos.add(n.id);
            if (n.parentId !== null) expect(idsBuiltin.has(n.parentId)).toBe(true);
        }
        expect(vistos.size).toBeGreaterThanOrEqual(nodos.length);
    });

    it("todos los nodos referenciados por cursos y secciones OSSU existen en builtin", () => {
        for (const nodoId of nodosConOssu()) {
            expect(idsBuiltin.has(nodoId)).toBe(true);
            expect(cursosDeNodo(nodoId).length).toBeGreaterThan(0);
        }
        const ds = seccionesOssu();
        for (const s of ds) expect(idsBuiltin.has(s.nodo)).toBe(true);
    });

    it("cinco temas nuevos bajo cat-tecnologia con sus nombres", () => {
        const esperados = [
            ["top-sistemas-computacion", "Sistemas de Computación"],
            ["top-algoritmos", "Algoritmos y Teoría de la Computación"],
            ["top-seguridad-informatica", "Seguridad Informática"],
            ["top-bases-datos", "Bases de Datos"],
            ["top-ingenieria-software", "Ingeniería de Software"],
        ];
        const porId = new Map(nodos.map((n) => [n.id, n]));
        for (const [id, nombre] of esperados) {
            const nodo = porId.get(id);
            expect(nodo).toBeDefined();
            expect(nodo?.parentId).toBe("cat-tecnologia");
            expect(nodo?.name ?? nombre).toBe(nombre);
        }
    });
});

describe("itinerarioOssu · forma de UpsertGuideInput", () => {
    it("toma la forma exacta de una guía tipo itinerario", () => {
        const itin: UpsertGuideInput = itinerarioOssu();
        expect(itin.kind).toBe("itinerario");
        expect(itin.title).toBe("Ruta de Ciencias de la Computación (OSSU)");
        expect(itin.summary?.length ?? 0).toBeGreaterThan(40);
        for (const s of itin.sections) {
            expect(s.title.length).toBeGreaterThan(0);
            expect(s.body.length).toBeGreaterThan(0);
        }
    });

    it("una sección por sección OSSU, en orden, con los temas citados en el cuerpo", () => {
        const itin = itinerarioOssu();
        expect(itin.sections.map((s) => s.title)).toEqual(seccionesOssu().map((s) => s.seccion));
        for (let i = 0; i < itin.sections.length; i++) {
            for (const tema of seccionesOssu()[i].temas) {
                expect(itin.sections[i].body).toContain(tema);
            }
        }
    });

    it("ningún recurso sin URL y todas https:", () => {
        const itin = itinerarioOssu();
        expect(itin.sections.length).toBeGreaterThan(0);
        const recursos = itin.sections.flatMap((s) => s.resources ?? []);
        expect(recursos.length).toBe(63);
        for (const r of recursos) {
            expect(r.url).toBeTruthy();
            expect((r.url ?? "").startsWith("https:")).toBe(true);
            expect(r.label.length).toBeGreaterThan(0);
        }
    });

    it("el cuerpo lista duración y esfuerzo, y la duración vacía del dato no rompe nada", () => {
        const itin = itinerarioOssu();
        const intro = itin.sections[0];
        expect(intro.body).toContain("14 weeks");
        expect(intro.body).toContain("hours/week");
        for (const parte of intro.body.split("Cursos:\n")[1]?.split("\n") ?? []) {
            expect(parte.startsWith("· ")).toBe(true);
        }
        // «Advanced math» trae un curso sin duración ni esfuerzo («-»): queda solo el nombre.
        const avanzadaMat = itin.sections[13];
        expect(avanzadaMat.body).toContain("· Essence of Linear Algebra");
    });
});

describe("buscarEnOssu", () => {
    it("'seguridad' devuelve cursos del nodo de seguridad informática", () => {
        const hallados = buscarEnOssu("seguridad", 20);
        expect(hallados.length).toBeGreaterThan(0);
        for (const c of hallados) {
            expect(c.nodo).toBe("top-seguridad-informatica");
            expect(c.url.startsWith("https:")).toBe(true);
        }
    });

    it("coincide sin acentos ni mayúsculas y respeta el tope de resultados", () => {
        expect(buscarEnOssu("SEGURIDAD", 3).length).toBeLessThanOrEqual(3);
        const algoritmos = buscarEnOssu("algoritmos", 20);
        expect(algoritmos.length).toBeGreaterThan(0);
        expect(algoritmos.every((c) => c.nodo === "top-algoritmos")).toBe(true);
        expect(buscarEnOssu("   ")).toEqual([]);
    });
});
