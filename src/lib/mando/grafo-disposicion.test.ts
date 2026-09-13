import { describe, expect, it } from "vitest";

import {
    colorArista,
    disponerGrafo,
    etiquetaEstado,
    nodosVisibles,
    olasDelGrafo,
    rutaBezier,
    tonoNodoTarea,
} from "@/lib/mando/grafo-disposicion";
import type { GrafoOrquestacion } from "@/lib/mando/tipos";

const GRAFO: GrafoOrquestacion = {
    nodos: [
        { id: "ola:241", tipo: "ola", etiqueta: "241" },
        { id: "tarea:P1", tipo: "tarea", etiqueta: "P1", ola: "241", estado: "commit" },
        { id: "tarea:P2", tipo: "tarea", etiqueta: "P2", ola: "241", estado: "en_curso" },
        { id: "modelo:m1", tipo: "modelo", etiqueta: "qwen3" },
        { id: "revisor:r1", tipo: "revisor", etiqueta: "kimi" },
        { id: "commit:abc1234", tipo: "commit", etiqueta: "abc1234" },
    ],
    aristas: [
        { de: "ola:241", a: "tarea:P1", tipo: "contiene" },
        { de: "ola:241", a: "tarea:P2", tipo: "contiene" },
        { de: "tarea:P2", a: "tarea:P1", tipo: "depende" },
        { de: "modelo:m1", a: "tarea:P1", tipo: "escribio" },
        { de: "revisor:r1", a: "ola:241", tipo: "reviso" },
        { de: "tarea:P1", a: "commit:abc1234", tipo: "produjo" },
    ],
};

describe("grafo-disposicion", () => {
    it("colorea cada tipo de arista distinto", () => {
        expect(colorArista("contiene")).not.toBe(colorArista("depende"));
        expect(colorArista("depende")).not.toBe(colorArista("escribio"));
        expect(colorArista("escribio")).not.toBe(colorArista("reviso"));
        expect(colorArista("reviso")).not.toBe(colorArista("produjo"));
    });

    it("tonoNodoTarea distingue commit, sin cambios, fallo y en curso", () => {
        expect(tonoNodoTarea("commit")).not.toBe(tonoNodoTarea("sin_cambios"));
        expect(tonoNodoTarea("fallo_tests")).not.toBe(tonoNodoTarea("commit"));
        expect(tonoNodoTarea("conflicto")).not.toBe(tonoNodoTarea("commit"));
        expect(tonoNodoTarea("en_curso")).not.toBe(tonoNodoTarea("sin_cambios"));
    });

    it("etiquetaEstado pone espacios en lugar de guiones bajos", () => {
        expect(etiquetaEstado("sin_cambios")).toBe("sin cambios");
        expect(etiquetaEstado("en_curso")).toBe("en curso");
    });

    it("olasDelGrafo lista las olas en orden de nodos", () => {
        expect(olasDelGrafo(GRAFO.nodos)).toEqual(["241"]);
    });

    it("rutaBezier une dos puntos con una curva cubic", () => {
        const d = rutaBezier({ x: 0, y: 0 }, { x: 100, y: 40 });
        expect(d.startsWith("M 0 0")).toBe(true);
        expect(d).toContain("C");
        expect(d.endsWith("100 40")).toBe(true);
    });

    it("sin filtro, todos los nodos son visibles", () => {
        expect(nodosVisibles(GRAFO, null).size).toBe(GRAFO.nodos.length);
    });

    it("el filtro de ola conserva sus tareas, su modelo, su revisor y su commit", () => {
        const visibles = nodosVisibles(GRAFO, "241");
        expect(visibles.has("ola:241")).toBe(true);
        expect(visibles.has("tarea:P1")).toBe(true);
        expect(visibles.has("tarea:P2")).toBe(true);
        expect(visibles.has("modelo:m1")).toBe(true);
        expect(visibles.has("revisor:r1")).toBe(true);
        expect(visibles.has("commit:abc1234")).toBe(true);
    });

    it("disponerGrafo reparte columnas y posiciones sin solaparse", () => {
        const d = disponerGrafo(GRAFO, null);
        expect(d.ancho).toBeGreaterThan(0);
        expect(d.alto).toBeGreaterThan(0);
        expect(d.columnas.map((c) => c.tipo)).toEqual([
            "ola",
            "tarea",
            "modelo",
            "revisor",
            "commit",
        ]);
        // La ola queda a la izquierda de las tareas.
        expect(d.posiciones["ola:241"].x).toBeLessThan(d.posiciones["tarea:P1"].x);
        // Todos los nodos tienen posición.
        for (const nodo of GRAFO.nodos) {
            expect(d.posiciones[nodo.id]).toBeDefined();
        }
        // Sin filtro, ninguna arista se pierde.
        expect(d.aristas.length).toBe(GRAFO.aristas.length);
    });

    it("disponerGrafo con grafo vacío no lanza", () => {
        const d = disponerGrafo({ nodos: [], aristas: [] }, null);
        expect(d.columnas).toEqual([]);
        expect(d.aristas).toEqual([]);
    });
});
