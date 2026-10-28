import { describe, it, expect } from "vitest";
import { destinoDeIA } from "../enrutado";
import type { ConfigTopologia, InventarioRecursos, NeuronaRecursos, EstadoRecursosIa, Capacidad } from "../tipos";
import { estadoVacio } from "../asignaciones";

const N1 = "n-mac";
const N2 = "n-a1";

function neuronaTest(id: string, nombre: string): NeuronaRecursos {
    return {
        id,
        nombre,
        tipo: id === N1 ? "macOS" : "linux",
        online: true,
        esEsta: id === N1,
        vias: ["local", "malla-local", "red-starseed"],
        procesadores: [
            {
                id: `${id}:cpu`,
                neuronaId: id,
                tipo: "cpu",
                nombre: "CPU",
                nucleos: 8,
                ramLibreGb: 5,
                aceleradores: ["neon"],
                runtimes: ["bitnet-cpp"],
                via: "local",
                disponible: true,
                propio: true,
                fuente: "detectado",
            },
        ],
        almacenes: [
            {
                id: `${id}:interno`,
                tipo: "neurona-local",
                etiqueta: "Disco interno",
                neuronaId: id,
                via: "local",
                persistente: true,
                privado: true,
                disponible: true,
                fuente: "detectado",
                libreGb: 10,
            },
        ],
    };
}

function inventarioTest(): InventarioRecursos {
    return {
        generado: "2026-10-25T00:00:00.000Z",
        estaNeuronaId: N1,
        neuronas: [neuronaTest(N1, "Mac"), neuronaTest(N2, "A1")],
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
    };
}

describe("destinoDeIA", () => {
    it("topología servidor-propio devuelve la URL del servidor de la neurona elegida con host conocido", () => {
        const inventario = inventarioTest();
        (inventario.neuronas[1] as any).host = "192.168.1.50";
        const topologia: ConfigTopologia = {
            topologia: "servidor-propio",
            servidorNeuronaId: N2,
            vias: ["malla-local"],
            alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
        };
        const res = destinoDeIA(topologia, estadoVacio(), inventario, "texto");
        expect(res.neuronaId).toBe(N2);
        expect(res.baseUrl).toBe("http://192.168.1.50:4480/v1");
        expect(res.via).toBe("malla-local");
    });

    it("topología servidor-propio con host desconocido devuelve baseUrl null con motivo legible", () => {
        const inventario = inventarioTest();
        const topologia: ConfigTopologia = {
            topologia: "servidor-propio",
            servidorNeuronaId: N2,
            vias: ["malla-local"],
            alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
        };
        const res = destinoDeIA(topologia, estadoVacio(), inventario, "razon");
        expect(res.neuronaId).toBe(N2);
        expect(res.baseUrl).toBeNull();
        expect(res.motivo.length > 0).toBe(true);
    });

    it("topología cada-neurona devuelve local", () => {
        const inventario = inventarioTest();
        const topologia: ConfigTopologia = {
            topologia: "cada-neurona",
            vias: ["local"],
            alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
        };
        const res = destinoDeIA(topologia, estadoVacio(), inventario, "texto");
        expect(res.via).toBe("local");
        expect(res.baseUrl).toBeNull();
        expect(res.neuronaId).toBe(N1);
    });

    it("topología fragmentada devuelve la neurona asignada a esa capacidad", () => {
        const inventario = inventarioTest();
        const topologia: ConfigTopologia = {
            topologia: "fragmentada",
            vias: ["local", "malla-local"],
            porCapacidad: {
                razon: { procesaEn: `${N2}:cpu` },
            },
            alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
        };
        const res = destinoDeIA(topologia, estadoVacio(), inventario, "razon");
        expect(res.neuronaId).toBe(N2);
        expect(res.baseUrl).toBeNull();
    });

    it("nunca usa antena para chat", () => {
        const inventario = inventarioTest();
        const topologia: ConfigTopologia = {
            topologia: "comunal",
            vias: ["antena"],
            alcance: { tipo: "comunidad", id: "c1", visibilidad: "publica" },
        };
        const res = destinoDeIA(topologia, estadoVacio(), inventario, "texto");
        expect(res.via).not.toBe("antena");
    });
});
