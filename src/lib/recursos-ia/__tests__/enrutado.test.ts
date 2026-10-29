/**
 * RIA1023C · destinoDeIA: a qué servidor va cada capacidad según la topología.
 * Solo funciones puras (entrada → salida), según las reglas de tests del repo.
 */
import { describe, expect, it } from "vitest";
import { destinoDeIA } from "../enrutado";
import type {
    Asignacion,
    Capacidad,
    ConfigTopologia,
    InventarioRecursos,
    NeuronaRecursos,
    Via,
} from "../tipos";

const PRIVADO = { tipo: "perfil" as const, id: "alex", visibilidad: "privada" as const };

function neurona(id: string, opts: { nombre?: string; esta?: boolean; vias?: Via[] } = {}): NeuronaRecursos {
    return {
        id,
        nombre: opts.nombre ?? id,
        online: true,
        esEsta: opts.esta ?? false,
        procesadores: [
            { id: `${id}:cpu`, neuronaId: id, tipo: "cpu", nombre: "CPU", aceleradores: [], runtimes: [], via: "local", disponible: true, fuente: "detectado" },
        ],
        almacenes: [
            { id: `${id}:interno`, tipo: "neurona-local", etiqueta: `Disco de ${id}`, neuronaId: id, via: "local", persistente: true, privado: true, disponible: true, fuente: "detectado" },
        ],
        vias: opts.vias ?? ["local", "malla-local", "red-starseed"],
    };
}

function inventario(neuronas: NeuronaRecursos[], extra: Partial<InventarioRecursos> = {}): InventarioRecursos {
    return {
        generado: "2026-10-23T00:00:00Z",
        estaNeuronaId: neuronas.find((n) => n.esEsta)?.id ?? "",
        neuronas,
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
        ...extra,
    };
}

function plan(patch: Partial<ConfigTopologia> = {}): ConfigTopologia {
    return { topologia: "cada-neurona", vias: ["local", "malla-local"], alcance: PRIVADO, ...patch };
}

function asignaciones(...as: Asignacion[]): Record<string, Asignacion> {
    return Object.fromEntries(as.map((a) => [`modelo:${a.elemento.id}`, a]));
}

describe("destinoDeIA · cada-neurona", () => {
    it("la capacidad corre en la propia neurona, por local y sin baseUrl", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const d = destinoDeIA(plan(), {}, inv, "texto");
        expect(d).toMatchObject({ via: "local", neuronaId: "mac", baseUrl: null });
        expect(d.motivo).toContain("Conversar y escribir");
    });
});

describe("destinoDeIA · servidor-propio", () => {
    it("si la servidora es esta neurona: lazo 127.0.0.1 con el puerto 4480", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio", servidorNeuronaId: "mac" }), {}, inv, "texto");
        expect(d).toEqual({ via: "local", neuronaId: "mac", baseUrl: "http://127.0.0.1:4480/v1", motivo: expect.any(String) });
    });

    it("servidora remota: por su mejor vía (malla) y sin dirección conocida todavía", () => {
        const inv = inventario([
            neurona("mac", { nombre: "Mac de Alex", esta: true }),
            neurona("a1", { nombre: "A1 Raspberry", vias: ["malla-local", "red-starseed"] }),
        ]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio", servidorNeuronaId: "a1" }), {}, inv, "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: null });
        expect(d.motivo).toContain("A1 Raspberry");
    });

    it("la topología no nombra servidora: neuronaId null y motivo claro", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio" }), {}, inv, "texto");
        expect(d).toMatchObject({ neuronaId: null, baseUrl: null });
        expect(d.motivo).toContain("Elige qué neurona");
    });

    it("servidora fuera del inventario: se la espera, hoy sin dirección", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio", servidorNeuronaId: "a1" }), {}, inv, "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: null });
    });
});

describe("destinoDeIA · regla de antena (§3)", () => {
    it("chat por una servidora solo-antena nunca va por antena: red de StarSeed", () => {
        const inv = inventario([
            neurona("mac", { esta: true }),
            neurona("terra", { nombre: "Terra en el campo", vias: ["antena"] }),
        ]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio", servidorNeuronaId: "terra" }), {}, inv, "texto");
        expect(d.via).toBe("red-starseed");
        expect(d.motivo).toContain("antena");
    });

    it("las decisiones sí la antena (mensajería tipada, no pesos)", () => {
        const inv = inventario([
            neurona("mac", { esta: true }),
            neurona("terra", { vias: ["antena"] }),
        ]);
        const d = destinoDeIA(plan({ topologia: "servidor-propio", servidorNeuronaId: "terra" }), {}, inv, "decision");
        expect(d.via).toBe("antena");
    });
});

describe("destinoDeIA · fragmentada", () => {
    it("la neurona asignada a la capacidad por el plan", () => {
        const inv = inventario([
            neurona("mac", { esta: true }),
            neurona("a1", { vias: ["malla-local", "red-starseed"] }),
            neurona("b2", { vias: ["red-starseed"] }),
        ]);
        const d = destinoDeIA(
            plan({ topologia: "fragmentada", porCapacidad: { texto: { procesaEn: "a1:gpu", modeloId: "bitnet" } } }),
            {},
            inv,
            "texto",
        );
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: null });
    });

    it("la asignación a mano del modelo manda sobre el plan", () => {
        const inv = inventario([
            neurona("mac", { esta: true }),
            neurona("a1", { vias: ["malla-local"] }),
            neurona("b2", { vias: ["red-starseed"] }),
        ]);
        const as = asignaciones({
            elemento: { tipo: "modelo", id: "bitnet", nombre: "BitNet" },
            almacenEn: "b2:interno",
            procesaEn: "b2:cpu",
            alcance: PRIVADO,
            t: 0,
        });
        const d = destinoDeIA(
            plan({ topologia: "fragmentada", porCapacidad: { texto: { procesaEn: "a1:gpu", modeloId: "bitnet" } } }),
            as,
            inv,
            "texto",
        );
        expect(d).toMatchObject({ via: "red-starseed", neuronaId: "b2" });
    });

    it("sin asignación para esa capacidad: se queda en esta neurona", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(plan({ topologia: "fragmentada" }), {}, inv, "embeddings");
        expect(d).toMatchObject({ via: "local", neuronaId: "mac", baseUrl: null });
    });

    it("un servidor suelto («servidor:c1») también vale como destino asignado", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(
            plan({ topologia: "fragmentada", porCapacidad: { imagen: { procesaEn: "servidor:c1" } } }),
            {},
            inv,
            "imagen",
        );
        expect(d).toMatchObject({ neuronaId: "servidor:c1" });
    });
});

describe("destinoDeIA · almacen-externo y comunal", () => {
    it("el almacén externo lo procesa la neurona donde está conectado", () => {
        const inv = inventario([neurona("mac", { esta: true }), neurona("a1")], {
            almacenesSueltos: [
                { id: "nas", tipo: "servidor-externo", etiqueta: "NAS de la casa", neuronaId: "a1", via: "internet", persistente: true, privado: true, disponible: true, fuente: "declarado" },
            ],
        });
        const d = destinoDeIA(plan({ topologia: "almacen-externo", almacenExternoId: "nas" }), {}, inv, "razon");
        expect(d).toMatchObject({ neuronaId: "a1", baseUrl: null });
        expect(d.motivo).toContain("NAS de la casa");
    });

    it("almacén que no aparece: se queda en esta neurona con motivo", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(plan({ topologia: "almacen-externo", almacenExternoId: "fantasma" }), {}, inv, "razon");
        expect(d).toMatchObject({ via: "local", neuronaId: "mac" });
    });

    it("comunal: el primer servidor disponible (desempate por id)", () => {
        const inv = inventario([neurona("mac", { esta: true })], {
            procesadoresSueltos: [
                { id: "servidor:c2", neuronaId: "servidor:c2", tipo: "servidor", nombre: "Servidor del grupo", aceleradores: [], runtimes: [], via: "internet", disponible: true, propio: true, fuente: "declarado" },
                { id: "servidor:c1", neuronaId: "servidor:c1", tipo: "servidor", nombre: "Servidor común", aceleradores: [], runtimes: [], via: "red-starseed", disponible: true, propio: true, fuente: "declarado" },
            ],
        });
        const d = destinoDeIA(plan({ topologia: "comunal" }), {}, inv, "voz-tts");
        expect(d).toMatchObject({ via: "red-starseed", neuronaId: "servidor:c1" });
    });

    it("comunal sin servidores disponibles: local en esta neurona", () => {
        const inv = inventario([neurona("mac", { esta: true })]);
        const d = destinoDeIA(plan({ topologia: "comunal" }), {}, inv, "texto");
        expect(d).toMatchObject({ via: "local", neuronaId: "mac", baseUrl: null });
    });
});
