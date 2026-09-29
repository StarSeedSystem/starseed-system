import { describe, expect, it } from "vitest";
import {
    alternarFijada,
    buscarApps,
    moverEnRejilla,
    normalizarE,
    ordenarParaLanzador,
    puntuarApp,
    registrarReciente,
    rejillaPara,
} from "../lanzador";

const apps = [
    { id: "nexus", name: "StarSeed Nexus", short: "Nexus", description: "Portal del ecosistema", category: "starseed" },
    { id: "cafe", name: "StarSeed Café", short: "Café", description: "Menú vivo y economía de Granos", category: "starseed" },
    { id: "messages", name: "Mensajes", description: "Conversaciones privadas y de grupo", category: "sistema" },
    { id: "musica", name: "Música", description: "Reproductor de tu biblioteca", category: "media" },
    { id: "clima", name: "Clima", description: "Tiempo y cielo de tu lugar", category: "utilidad" },
];

describe("buscar apps", () => {
    it("ignora acentos y mayúsculas", () => {
        expect(normalizarE("  Música ")).toBe("musica");
        expect(buscarApps(apps, "cafe").map((a) => a.id)).toEqual(["cafe"]);
        expect(buscarApps(apps, "MUSI").map((a) => a.id)).toEqual(["musica"]);
    });

    it("prefiere el inicio del nombre a una coincidencia en medio", () => {
        expect(puntuarApp(apps[0], "nex")).toBeGreaterThan(puntuarApp(apps[0], "seed n"));
        expect(buscarApps(apps, "s").map((a) => a.id)[0]).toBe("nexus");
    });

    it("encuentra por intención en la descripción y por categoría", () => {
        expect(buscarApps(apps, "conversaciones").map((a) => a.id)).toEqual(["messages"]);
        expect(buscarApps(apps, "medios").map((a) => a.id)).toEqual(["musica"]);
    });

    it("sin consulta devuelve todas en su orden y con consulta sin casar, ninguna", () => {
        expect(buscarApps(apps, "   ").map((a) => a.id)).toEqual(apps.map((a) => a.id));
        expect(buscarApps(apps, "zzzz")).toEqual([]);
    });
});

describe("fijadas y recientes", () => {
    it("fijadas primero, luego recientes (lo último antes) y luego el resto", () => {
        const orden = ordenarParaLanzador(apps, ["clima"], [{ id: "cafe", t: 1 }, { id: "messages", t: 5 }]);
        expect(orden.map((a) => a.id)).toEqual(["clima", "messages", "cafe", "nexus", "musica"]);
    });

    it("ignora ids que no están en la colección y no duplica", () => {
        const orden = ordenarParaLanzador(apps, ["fantasma", "nexus"], [{ id: "nexus", t: 9 }]);
        expect(orden.map((a) => a.id)).toEqual(["nexus", "cafe", "messages", "musica", "clima"]);
    });

    it("registrar sube al principio y recorta al máximo", () => {
        let r = registrarReciente([], "a", 1);
        r = registrarReciente(r, "b", 2);
        r = registrarReciente(r, "a", 3);
        expect(r.map((x) => x.id)).toEqual(["a", "b"]);
        expect(registrarReciente(r, "c", 4, 2).map((x) => x.id)).toEqual(["c", "a"]);
    });

    it("fijar alterna", () => {
        expect(alternarFijada(["a"], "b")).toEqual(["a", "b"]);
        expect(alternarFijada(["a", "b"], "a")).toEqual(["b"]);
    });
});

describe("rejilla", () => {
    it("calcula columnas y filas con la caja y usa el mínimo sin medida", () => {
        expect(rejillaPara(0, 0, 60, 6)).toEqual({ columnas: 4, filas: 2 });
        expect(rejillaPara(300, 200, 60, 6)).toEqual({ columnas: 4, filas: 3 });
    });

    it("las flechas no se salen de la rejilla", () => {
        expect(moverEnRejilla(0, "ArrowLeft", 4, 10)).toBe(0);
        expect(moverEnRejilla(0, "ArrowDown", 4, 10)).toBe(4);
        expect(moverEnRejilla(8, "ArrowDown", 4, 10)).toBe(9);
        expect(moverEnRejilla(5, "ArrowUp", 4, 10)).toBe(1);
        expect(moverEnRejilla(3, "End", 4, 10)).toBe(9);
        expect(moverEnRejilla(3, "Home", 4, 10)).toBe(0);
    });
});
