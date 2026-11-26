import { describe, expect, it } from "vitest";

import { leerNodosAlmacenamiento, nombreDeNodoAlmacenamiento, detalleDeMedidor } from "@/lib/mando/medidores";

describe("ALC1125J · Maggabox almacenamiento", () => {
    it("incluye a Maggabox en los nodos de almacenamiento con datos correctos", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                { nodoId: "maggabox", medio: "linux", discoLibreGb: 418 },
                { nodoId: "mac-local", medio: "mac", discoLibreGb: 42 },
                { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 80 },
            ],
        });
        expect(nodos.map((n) => n.nombre)).toEqual(["Mac", "Maggabox", "A1"]);
        expect(nodos[1].discoLibreGb).toBe(418);
    });

    it("nombreDeNodoAlmacenamiento traduce maggabox correctamente", () => {
        expect(nombreDeNodoAlmacenamiento("maggabox")).toBe("Maggabox");
        expect(nombreDeNodoAlmacenamiento("maggabox", "linux")).toBe("Maggabox");
    });

    it("detalleDeMedidor incluye a Maggabox con su medio y aviso de único si corresponde", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [
                    { id: "mac-local", nombre: "Mac", medio: "mac", discoLibreGb: 42, almacen: [] },
                    { id: "maggabox", nombre: "Maggabox", medio: "linux", discoLibreGb: 418, almacen: [] },
                ],
            },
        });
        expect(d.titulo).toBe("Almacenamiento");
        expect(d.resumen).toContain("Maggabox");
    });

    it("aviso de medio único cuando solo Maggabox declara disco", () => {
        const d = detalleDeMedidor("almacenamiento", {
            almacenamiento: {
                nodos: [{ id: "maggabox", nombre: "Maggabox", medio: "linux", discoLibreGb: 8, almacen: [] }],
            },
        });
        expect(d.aviso).toContain("Medio único");
        expect(d.filas[0].estado).toBe("bajo");
    });
});