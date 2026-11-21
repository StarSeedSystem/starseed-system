import { describe, expect, it } from "vitest";

import {
    detalleDeMedidor,
    filasDeAlmacenamiento,
    leerNodosAlmacenamiento,
    nombreDeNodoAlmacenamiento,
} from "@/lib/mando/medidores";

describe("leerNodosAlmacenamiento", () => {
    it("lee los tres nodos con disco y ordena Mac, Maggabox, A1", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 80 },
                { nodoId: "maggabox", medio: "linux", discoLibreGb: 120.5 },
                { nodoId: "mac-local", medio: "mac", discoLibreGb: 42 },
            ],
        });
        expect(nodos.map((n) => n.nombre)).toEqual(["Mac", "Maggabox", "A1"]);
        expect(nodos[1].discoLibreGb).toBe(120.5);
    });

    it("acepta el array directo y las variantes de nombre de la medida", () => {
        const nodos = leerNodosAlmacenamiento([
            { id: "mac-1", medio: "mac", disco_libre_gb: 10 },
            { id: "a1", medio: "nube", discoLibreGB: 20 },
        ]);
        expect(nodos.map((n) => [n.id, n.discoLibreGb])).toEqual([
            ["mac-1", 10],
            ["a1", 20],
        ]);
    });

    it("descarta lo que no trae disco medido y no inventa ceros", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "sin-disco", medio: "mac" },
                { nodoId: "roto", medio: "linux", discoLibreGb: "mucho" },
                { nodoId: "", medio: "mac", discoLibreGb: 3 },
                null,
                "no-es-nodo",
            ],
        });
        expect(nodos).toEqual([]);
        expect(leerNodosAlmacenamiento(null)).toEqual([]);
        expect(leerNodosAlmacenamiento({ nodos: "no-es-lista" })).toEqual([]);
    });

    it("conserva el cero medido: un disco sin espacio no es «sin dato»", () => {
        const [nodo] = leerNodosAlmacenamiento([{ nodoId: "mac-local", medio: "mac", discoLibreGb: 0 }]);
        expect(nodo.discoLibreGb).toBe(0);
    });
});

describe("nombreDeNodoAlmacenamiento", () => {
    it("traduce los ids reales y deja los desconocidos tal cual", () => {
        expect(nombreDeNodoAlmacenamiento("mac-local")).toBe("Mac");
        expect(nombreDeNodoAlmacenamiento("maggabox")).toBe("Maggabox");
        expect(nombreDeNodoAlmacenamiento("a1-oracle")).toBe("A1");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "linux")).toBe("Linux");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "nube")).toBe("Nube");
        expect(nombreDeNodoAlmacenamiento("nodo-x", "otro")).toBe("nodo-x");
    });
});

describe("detalleDeMedidor · almacenamiento", () => {
    it("resume los discos libres con sus nombres y ofrece el mapa de medios", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [
                    { id: "mac-local", nombre: "Mac", medio: "mac", discoLibreGb: 42, almacen: [] },
                    { id: "maggabox", nombre: "Maggabox", medio: "linux", discoLibreGb: 120, almacen: [] },
                    { id: "a1-oracle", nombre: "A1", medio: "nube", discoLibreGb: 80, almacen: [] },
                ],
            },
        });
        expect(d.titulo).toBe("Almacenamiento");
        expect(d.resumen).toBe("Nodos con disco libre: Mac (42 GB), Maggabox (120 GB), A1 (80 GB)");
        expect(d.filas.map((f) => f.id)).toEqual(["mac-local", "maggabox", "a1-oracle"]);
        expect(d.filas[0].detalle).toEqual({ discoLibres: 42, origen: "mac", almacen: [] });
        expect(d.acciones).toEqual([
            { clase: "ir-a", texto: "Ver mapa de medios", destino: "mapa-medios", destructiva: false },
        ]);
    });

    it("avisa de medio único cuando solo un nodo declara disco", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [{ id: "mac-local", nombre: "Mac", medio: "mac", discoLibreGb: 8, almacen: [] }],
            },
        });
        expect(d.aviso).toContain("Medio único");
        expect(d.filas[0].estado).toBe("bajo");
    });

    it("sin nodos no inventa cifras y explica de dónde saldrían", () => {
        const d = detalleDeMedidor("almacenamiento", {});
        expect(d.resumen).toBe("sin dato");
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBeTruthy();
        expect(d.aviso).toBeUndefined();
    });
});

describe("filasDeAlmacenamiento", () => {
    it("marca bajo y crítico según el disco que queda", () => {
        const filas = filasDeAlmacenamiento([
            { id: "a", nombre: "A", medio: "mac", discoLibreGb: 3, almacen: [] },
            { id: "b", nombre: "B", medio: "linux", discoLibreGb: 10, almacen: [] },
            { id: "c", nombre: "C", medio: "nube", discoLibreGb: 30, almacen: [] },
        ]);
        expect(filas.map((f) => f.estado)).toEqual(["crítico", "bajo", "libre"]);
    });
});
