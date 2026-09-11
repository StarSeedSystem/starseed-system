/**
 * Tests de las funciones PURAS y constantes de Cuadernos (Ola 290 · T6 · 2026-09-08).
 * Solo importa constantes y funciones puras: sin disco, sin red ni rutas de
 * `src/app/api/**`, porque en este repo vitest corre con `globals: false`.
 */
import { describe, it, expect } from "vitest";
import {
    CUADERNOS_SEMILLA,
    normalizarTemas,
    artefactosParaTema,
    bloqueDeFuentes,
    validarArtefacto,
    type ArtefactoCuaderno,
    type Cuaderno,
} from "../canales/cuadernos";

describe("CUADERNOS_SEMILLA", () => {
    it("tiene 3 cuadernos con URL bien formada", () => {
        expect(CUADERNOS_SEMILLA).toHaveLength(3);
        for (const c of CUADERNOS_SEMILLA) {
            expect(c.url.startsWith("https://notebook.google.com/notebook/")).toBe(true);
            expect(c.artefactos).toEqual([]);
        }
    });

    it("los ids corresponden a los cuadernos públicos del proyecto", () => {
        const ids = CUADERNOS_SEMILLA.map((c) => c.id);
        expect(ids).toContain("1f0ef34c-7eb2-41f6-8a3b-ded7f74804a6");
        expect(ids).toContain("f8f45e80-9ed0-49b8-8c1f-75a6e123ad1d");
        expect(ids).toContain("e769a118-bcba-4cac-8f69-484f7aa611b2");
    });
});

describe("normalizarTemas", () => {
    it("quita duplicados, tildes y palabras vacías", () => {
        const temas = normalizarTemas("La Ontocracia y la ontocracia, el DISEÑO");
        expect(temas).toEqual(["ontocracia", "diseno"]);
        expect(temas).not.toContain("la");
        expect(temas).not.toContain("el");
        expect(temas).not.toContain("y");
    });

    it("no devuelve más de 12 temas", () => {
        const temas = normalizarTemas("a b c d e f g h i j k l m n o p");
        expect(temas.length).toBeLessThanOrEqual(12);
    });
});

describe("artefactosParaTema", () => {
    const artefacto = (id: string, temas: string[], titulo: string): ArtefactoCuaderno => ({
        id,
        cuadernoId: "c1",
        tipo: "nota",
        titulo,
        resumen: "resumen",
        creado: "2026-09-08T00:00:00.000Z",
        temas,
    });

    const cuadernos: Cuaderno[] = [
        {
            id: "c1",
            nombre: "C1",
            descripcion: "",
            temas: ["x"],
            url: "https://notebook.google.com/notebook/c1",
            artefactos: [
                artefacto("a1", ["ontocracia", "gobernanza"], "La ontocracia"),
                artefacto("a2", ["ontocracia"], "Nota suelta"),
                artefacto("a3", ["diseno"], "Sobre el diseño"),
            ],
        },
    ];

    it("devuelve primero el que comparte más temas", () => {
        const res = artefactosParaTema(cuadernos, "ontocracia");
        expect(res[0].id).toBe("a1");
    });

    it("respeta max y descarta los que no puntúan", () => {
        const res = artefactosParaTema(cuadernos, "ontocracia", 1);
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe("a1");
    });
});

describe("bloqueDeFuentes", () => {
    it("devuelve cadena vacía sin artefactos", () => {
        expect(bloqueDeFuentes([])).toBe("");
    });

    it("contiene la palabra Fuentes y ambos títulos con dos artefactos", () => {
        const bloque = bloqueDeFuentes([
            { id: "a1", cuadernoId: "c1", tipo: "audio", titulo: "Voz uno", resumen: "r1", creado: "", temas: [] },
            { id: "a2", cuadernoId: "c1", tipo: "informe", titulo: "Informe dos", resumen: "r2", creado: "", temas: [] },
        ]);
        expect(bloque).toContain("Fuentes");
        expect(bloque).toContain("Voz uno");
        expect(bloque).toContain("Informe dos");
    });
});

describe("validarArtefacto", () => {
    it("rechaza un objeto vacío con errores", () => {
        const res = validarArtefacto({});
        expect(res.ok).toBe(false);
        expect(res.errores.length).toBeGreaterThan(0);
    });

    it("acepta un artefacto completo", () => {
        const res = validarArtefacto({
            id: "a1",
            cuadernoId: "c1",
            tipo: "nota",
            titulo: "Título",
            resumen: "Resumen",
            creado: "2026-09-08T00:00:00.000Z",
            temas: ["ontocracia"],
        });
        expect(res.ok).toBe(true);
        expect(res.errores).toEqual([]);
    });
});