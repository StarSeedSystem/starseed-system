import { describe, expect, it } from "vitest";

import {
    detalleDeMedidor,
    filasDeAlmacenamiento,
    leerNodosAlmacenamiento,
    pastillaDeAlmacenamiento,
} from "@/lib/mando/medidores";

const capacidades = {
    nodos: [
        {
            nodoId: "maggabox",
            medio: "linux",
            discoLibreGb: 397,
            discoTotalGb: 453,
            discos: [
                { ruta: "/", rol: "principal", libreGb: 397, totalGb: 453, montado: true, smart: "ok" },
                {
                    ruta: "/srv/starseed-almacen",
                    rol: "secundario: respaldos y datos no fundamentales",
                    libreGb: 418,
                    totalGb: 500,
                    montado: true,
                    smart: "ok",
                },
            ],
        },
        { nodoId: "mac-local", medio: "mac", discoLibreGb: 13, discoTotalGb: 228 },
        { nodoId: "a1-oracle", medio: "nube", discoLibreGb: 9.1 },
        { nodoId: "drive", medio: "nube", usoGb: 0, discoTotalGb: 2048 },
    ],
};

describe("MED1126A · almacenamiento de los nodos", () => {
    it("expande los discos de la Maggabox en interno principal y externo secundario", () => {
        const nodos = leerNodosAlmacenamiento(capacidades);
        const maggabox = nodos.filter((n) => n.nombre.startsWith("Maggabox"));
        expect(maggabox.map((n) => n.nombre)).toEqual([
            "Maggabox · interno (principal)",
            "Maggabox · disco externo (secundario)",
        ]);
        expect(maggabox[0].discoLibreGb).toBe(397);
        expect(maggabox[0].discoTotalGb).toBe(453);
        expect(maggabox[1].discoLibreGb).toBe(418);
        expect(maggabox[1].discoTotalGb).toBe(500);
        expect(maggabox[1].rol).toContain("respaldos");
    });

    it("marca el externo sin montar o con errores y no lo deja como destino", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                {
                    nodoId: "maggabox",
                    medio: "linux",
                    discos: [
                        { ruta: "/", rol: "principal", libreGb: 397, totalGb: 453, montado: true },
                        {
                            ruta: "/srv/starseed-almacen",
                            rol: "secundario: respaldos y datos no fundamentales",
                            montado: false,
                            errores: ["no montado"],
                        },
                    ],
                },
            ],
        });
        const externo = nodos.find((n) => n.nombre.includes("externo"));
        expect(externo?.estadoDisco).toBe("error");
        const detalle = detalleDeMedidor("almacenamiento", { almacenamiento: { nodos } });
        const fila = detalle.filas.find((f) => f.titulo.includes("externo"));
        expect(fila?.estado).toBe("error");
        expect(fila?.porque).toContain("no se usa como destino");
    });

    it("marca sin montar cuando el disco no está montado y no hay errores", () => {
        const nodos = leerNodosAlmacenamiento({
            nodos: [
                {
                    nodoId: "maggabox",
                    medio: "linux",
                    discos: [
                        { ruta: "/", rol: "principal", libreGb: 397, totalGb: 453, montado: true },
                        {
                            ruta: "/srv/starseed-almacen",
                            rol: "secundario: respaldos y datos no fundamentales",
                            montado: false,
                        },
                    ],
                },
            ],
        });
        const externo = nodos.find((n) => n.nombre.includes("externo"));
        expect(externo?.estadoDisco).toBe("sin montar");
        const fila = filasDeAlmacenamiento(nodos).find((f) => f.titulo.includes("externo"));
        expect(fila?.estado).toBe("sin montar");
        expect(fila?.porque).toContain("no está montado");
    });

    it("la pastilla dice los GB libres de la Maggabox y el resto de medios", () => {
        const nodos = leerNodosAlmacenamiento(capacidades);
        const detalle = detalleDeMedidor("almacenamiento", { almacenamiento: { nodos } });
        const pastilla = pastillaDeAlmacenamiento(detalle);
        expect(pastilla.titulo).toBe("Nodos y almacenamiento");
        expect(pastilla.valor).toBe("Maggabox 397 GB libres");
        expect(pastilla.detalle).toContain("Mac");
        expect(pastilla.detalle).toContain("externo");
        expect(pastilla.detalle).toContain("A1");
        expect(pastilla.detalle).toContain("Drive");
        expect(pastilla.tono).toBe("aviso");
    });

    it("sin datos la pastilla lo dice sin inventar cifras", () => {
        const pastilla = pastillaDeAlmacenamiento(null);
        expect(pastilla.titulo).toBe("Nodos y almacenamiento");
        expect(pastilla.valor).toBe("sin dato");
        expect(pastilla.tono).toBe("normal");
    });
});
