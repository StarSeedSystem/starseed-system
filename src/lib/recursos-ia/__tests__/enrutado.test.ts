/**
 * Pruebas de `destinoDeIA` (RIA1023C): las cuatro topologías, la antena prohibida salvo decisiones
 * y el caso sin host conocido. Solo la función pura: nada de red ni disco.
 */
import { describe, expect, it } from "vitest";
import { destinoDeIA } from "../enrutado";
import type { Asignacion, ConfigTopologia, InventarioRecursos, NeuronaRecursos, Procesador } from "../tipos";

const alcance = { tipo: "perfil", id: "yo", visibilidad: "privada" } as const;

function proc(id: string, neuronaId: string, via: Procesador["via"], nombre = id): Procesador {
    return { id, neuronaId, tipo: "gpu", nombre, aceleradores: [], runtimes: [], via, disponible: true, fuente: "estimado" };
}

function neurona(id: string, opts: { esEsta?: boolean; online?: boolean; vias?: NeuronaRecursos["vias"]; procs?: Procesador[] } = {}): NeuronaRecursos {
    return {
        id,
        nombre: `Neurona ${id}`,
        online: opts.online ?? true,
        esEsta: opts.esEsta ?? false,
        procesadores: opts.procs ?? [],
        almacenes: [],
        vias: opts.vias ?? ["malla-local", "red-starseed"],
    };
}

function inventario(neuronas: NeuronaRecursos[], sueltos: Procesador[] = []): InventarioRecursos {
    return { generado: "2026-10-23T00:00:00Z", estaNeuronaId: "a", neuronas, almacenesSueltos: [], procesadoresSueltos: sueltos, avisos: [] };
}

function topologia(topologia: ConfigTopologia["topologia"], extra: Partial<ConfigTopologia> = {}): ConfigTopologia {
    return { topologia, vias: ["local", "malla-local", "red-starseed"], alcance, ...extra };
}

const INV = inventario([
    neurona("a", { esEsta: true, vias: ["local"], procs: [proc("a:gpu", "a", "local", "M2")] }),
    neurona("b", { vias: ["malla-local"], procs: [proc("b:gpu", "b", "malla-local", "RTX b")] }),
    neurona("c", { online: false }),
]);

describe("destinoDeIA · servidor-propio", () => {
    const soggetto = (extra: Partial<ConfigTopologia>) => destinoDeIA(topologia("servidor-propio", extra), {}, INV, "texto");

    it("si el servidor es esta neurona, da su URL en el bucle local (puerto 4480)", () => {
        const d = soggetto({ servidorNeuronaId: "a" });
        expect(d).toEqual({
            via: "local",
            neuronaId: "a",
            baseUrl: "http://127.0.0.1:4480/v1",
            motivo: expect.stringContaining("4480"),
        });
    });

    it("si el servidor es otra neurona conocida pero sin dirección, baseUrl null con motivo legible", () => {
        const d = soggetto({ servidorNeuronaId: "b" });
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("b");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo.length).toBeGreaterThan(10);
    });

    it("si la neurona del servidor no está en el inventario, no inventa ninguna URL", () => {
        const d = soggetto({ servidorNeuronaId: "z" });
        expect(d.baseUrl).toBeNull();
        expect(d.neuronaId).toBe("z");
    });

    it("si falta servidorNeuronaId, lo dice; si está apagada, también lo dice", () => {
        expect(soggetto({}).via).toBeNull();
        expect(soggetto({ servidorNeuronaId: "c" }).baseUrl).toBeNull();
    });
});

describe("destinoDeIA · cada-neurona y demás topologías", () => {
    it("cada-neurona: local en esta neurona", () => {
        const d = destinoDeIA(topologia("cada-neurona"), {}, INV, "texto");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("a");
    });

    it("almacen-externo: los modelos viven fuera, se procesan en local", () => {
        const d = destinoDeIA(topologia("almacen-externo", { almacenExternoId: "nas" }), {}, INV, "razon");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("a");
    });

    it("comunal: se elige al usar, por Internet", () => {
        const d = destinoDeIA(topologia("comunal"), {}, INV, "imagen");
        expect(d.via).toBe("internet");
        expect(d.neuronaId).toBeNull();
        expect(d.baseUrl).toBeNull();
    });
});

describe("destinoDeIA · fragmentada", () => {
    it("va a la neurona asignada a esa capacidad por su procesador", () => {
        const cfg = topologia("fragmentada", { porCapacidad: { texto: { procesaEn: "b:gpu" } } });
        const d = destinoDeIA(cfg, {}, INV, "texto");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("b");
    });

    it("si la topología solo dice el modelo, lo saca de la asignación de ese modelo", () => {
        const asignacion: Asignacion = {
            elemento: { tipo: "modelo", id: "m1", nombre: "M1" },
            almacenEn: "a:interno",
            procesaEn: "a:gpu",
            alcance,
            t: 0,
        };
        const cfg = topologia("fragmentada", { porCapacidad: { razon: { modeloId: "m1" } } });
        const d = destinoDeIA(cfg, { "modelo|m1": asignacion }, INV, "razon");
        expect(d.neuronaId).toBe("a");
        expect(d.via).toBe("local");
    });

    it("sin asignación para la capacidad: esta neurona, con el motivo explicándolo", () => {
        const d = destinoDeIA(topologia("fragmentada"), {}, INV, "embeddings");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("a");
        expect(d.motivo).toContain("embedding");
    });
});

describe("destinoDeIA · la antena (§3)", () => {
    const cfg = topologia("fragmentada", { porCapacidad: { texto: { procesaEn: "a:lora" }, decision: { procesaEn: "a:lora" } } });
    const inv = inventario([
        neurona("a", { esEsta: true, vias: ["local"], procs: [{ ...proc("a:lora", "a", "antena", "LoRa"), tipo: "cpu" }] }),
    ]);

    it("nunca antena para chat: la conversación no va por radio", () => {
        const d = destinoDeIA(cfg, {}, inv, "texto");
        expect(d.via).toBeNull();
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("antena");
    });

    it("solo decisiones tipadas pasan por antena", () => {
        const d = destinoDeIA(cfg, {}, inv, "decision");
        expect(d.via).toBe("antena");
        expect(d.neuronaId).toBe("a");
    });
});

