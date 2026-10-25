import { describe, expect, it } from "vitest";

import { estadoVacio } from "../asignaciones";
import { destinoDeIA } from "../enrutado";
import type {
    Alcance,
    ConfigTopologia,
    InventarioRecursos,
    NeuronaRecursos,
    PlanRecursos,
    Procesador,
    Topologia,
} from "../tipos";

const alcance: Alcance = { tipo: "perfil", id: "p1", visibilidad: "privada" };

function neurona(id: string, extra: Partial<NeuronaRecursos> = {}, host?: string): NeuronaRecursos {
    const base: NeuronaRecursos = {
        id,
        nombre: `Neurona ${id}`,
        online: true,
        esEsta: false,
        procesadores: [],
        almacenes: [],
        vias: ["malla-local"],
        ...extra,
    };
    return host ? ({ ...base, host } as NeuronaRecursos & { host: string }) : base;
}

function inventario(
    neuronas: NeuronaRecursos[],
    extra: Partial<InventarioRecursos> = {},
    host?: string,
): InventarioRecursos {
    const base: InventarioRecursos = {
        generado: "2026-10-25T00:00:00.000Z",
        estaNeuronaId: neuronas[0]?.id ?? "n-mac",
        neuronas,
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
        ...extra,
    };
    return host ? ({ ...base, host } as InventarioRecursos & { host: string }) : base;
}

function plan(topologia: Topologia, extra: Partial<ConfigTopologia> = {}): PlanRecursos {
    return {
        topologia: { topologia, vias: ["malla-local", "red-starseed"], alcance, ...extra },
        sugerencias: [],
        sinOpcion: [],
        preguntas: [],
        resumen: "",
    };
}

const gpu: Procesador = {
    id: "n-gpu:gpu",
    neuronaId: "n-gpu",
    tipo: "gpu",
    nombre: "GPU de n-gpu",
    aceleradores: ["metal"],
    runtimes: ["mlx"],
    via: "malla-local",
    disponible: true,
    fuente: "detectado",
};

describe("destinoDeIA · cada neurona", () => {
    it("usa la IA local de esta neurona, sin URL de servidor", () => {
        const inv = inventario([neurona("n-mac", { esEsta: true, vias: ["local"] }), neurona("n-otra")]);
        const d = destinoDeIA(plan("cada-neurona"), estadoVacio(), inv, "texto");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("n-mac");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("Cada neurona");
    });
});

describe("destinoDeIA · servidor propio", () => {
    it("devuelve la URL del servidor de la neurona elegida con el host de su oferta", () => {
        const inv = inventario([
            neurona("n-mac", { esEsta: true, vias: ["local"] }),
            neurona("n-servidor", { vias: ["malla-local"] }, "192.168.1.50"),
        ]);
        const d = destinoDeIA(plan("servidor-propio", { servidorNeuronaId: "n-servidor" }), estadoVacio(), inv, "texto");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("n-servidor");
        expect(d.baseUrl).toBe("http://192.168.1.50:4480/v1");
        expect(d.motivo).toContain("servidor propio");
    });

    it("sin host conocido no inventa la URL y lo dice", () => {
        const inv = inventario([neurona("n-mac", { esEsta: true }), neurona("n-servidor", { vias: ["red-starseed"] })]);
        const d = destinoDeIA(plan("servidor-propio", { servidorNeuronaId: "n-servidor" }), estadoVacio(), inv, "texto");
        expect(d.via).toBe("red-starseed");
        expect(d.neuronaId).toBe("n-servidor");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("host no está");
    });

    it("toma el host del inventario cuando el servidor es esta neurona", () => {
        const inv = inventario([neurona("n-mac", { esEsta: true, vias: ["local"] })], {}, "mac-de-alex.local");
        const d = destinoDeIA(plan("servidor-propio", { servidorNeuronaId: "n-mac" }), estadoVacio(), inv, "texto");
        expect(d.via).toBe("local");
        expect(d.baseUrl).toBe("http://mac-de-alex.local:4480/v1");
    });
});

describe("destinoDeIA · fragmentada", () => {
    it("va a la neurona asignada a cada capacidad (procesador o neurona)", () => {
        const inv = inventario([
            neurona("n-mac", { esEsta: true }),
            neurona("n-gpu", { vias: ["malla-local"], procesadores: [gpu] }),
            neurona("n-disco", { vias: ["red-starseed"] }),
        ]);
        const extra = {
            porCapacidad: {
                texto: { procesaEn: "n-gpu:gpu" },
                razon: { procesaEn: "n-gpu" },
                imagen: { procesaEn: "n-disco" },
            },
        };
        const texto = destinoDeIA(plan("fragmentada", extra), estadoVacio(), inv, "texto");
        expect(texto.neuronaId).toBe("n-gpu");
        expect(texto.via).toBe("malla-local");
        const razon = destinoDeIA(plan("fragmentada", extra), estadoVacio(), inv, "razon");
        expect(razon.neuronaId).toBe("n-gpu");
        const imagen = destinoDeIA(plan("fragmentada", extra), estadoVacio(), inv, "imagen");
        expect(imagen.neuronaId).toBe("n-disco");
        expect(imagen.via).toBe("red-starseed");
    });
});

describe("destinoDeIA · comunal", () => {
    it("usa el servidor del grupo o la comunidad y nunca lo presenta como servidor propio", () => {
        const comunitario: Procesador = {
            id: "servidor:c1",
            neuronaId: "servidor:c1",
            tipo: "servidor",
            nombre: "Servidor comunal",
            aceleradores: [],
            runtimes: ["ollama"],
            via: "red-starseed",
            disponible: true,
            fuente: "declarado",
        };
        const inv = inventario([neurona("n-mac", { esEsta: true })], { procesadoresSueltos: [comunitario] });
        const d = destinoDeIA(plan("comunal"), estadoVacio(), inv, "texto");
        expect(d.via).toBe("red-starseed");
        expect(d.neuronaId).toBe("servidor:c1");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("Servidor comunal");
    });
});

describe("destinoDeIA · antena y almacén externo", () => {
    it("no manda chat por antena: cae a la IA local; una decisión sí puede ir por antena", () => {
        const inv = inventario([
            neurona("n-mac", { esEsta: true, vias: ["local"] }),
            neurona("n-radio", { vias: ["antena"] }, "10.0.0.9"),
        ]);
        const top = plan("servidor-propio", { servidorNeuronaId: "n-radio", vias: ["antena"] });
        const chat = destinoDeIA(top, estadoVacio(), inv, "texto");
        expect(chat.via).toBe("local");
        expect(chat.neuronaId).toBe("n-mac");
        expect(chat.baseUrl).toBeNull();
        const decision = destinoDeIA(top, estadoVacio(), inv, "decision");
        expect(decision.via).toBe("antena");
        expect(decision.neuronaId).toBe("n-radio");
        expect(decision.baseUrl).toBe("http://10.0.0.9:4480/v1");
    });

    it("almacén externo: procesa la neurona donde está conectado", () => {
        const inv = inventario(
            [neurona("n-mac", { esEsta: true }), neurona("n-nas", { vias: ["malla-local"] })],
            {
                almacenesSueltos: [
                    {
                        id: "n-nas:ext:SSD",
                        tipo: "disco-externo",
                        etiqueta: "SSD del NAS",
                        neuronaId: "n-nas",
                        via: "malla-local",
                        persistente: true,
                        privado: true,
                        disponible: true,
                        fuente: "detectado",
                    },
                ],
            },
        );
        const d = destinoDeIA(plan("almacen-externo", { almacenExternoId: "n-nas:ext:SSD" }), estadoVacio(), inv, "texto");
        expect(d.neuronaId).toBe("n-nas");
        expect(d.via).toBe("malla-local");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("SSD del NAS");
    });
});
