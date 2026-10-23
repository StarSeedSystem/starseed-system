/**
 * Enrutado de una capacidad según la topología: servidor propio (con host en la ficha o en la
 * oferta, y sin host), cada neurona, fragmentada, almacén externo, comunal y la regla de que la
 * antena nunca lleva chat. Sin red: todo sale del plan y del inventario.
 */
import { describe, expect, it } from "vitest";

import { destinoDeIA, PUERTO_SERVIDOR_IA } from "../enrutado";
import type {
    Alcance,
    Asignacion,
    Capacidad,
    ConfigTopologia,
    InventarioRecursos,
    MedioAlmacen,
    NeuronaRecursos,
    PlanRecursos,
    Procesador,
    RequisitosModelo,
    Sugerencia,
    Topologia,
    Via,
} from "../tipos";

const ALCANCE: Alcance = { tipo: "perfil", id: "p1", visibilidad: "privada" };

const MODELO: RequisitosModelo = {
    id: "bitnet-b158-2b",
    nombre: "BitNet b1.58 2B",
    familia: "BitNet",
    capacidades: ["texto"],
    bits: 1.58,
    formato: "gguf",
    runtime: "bitnet-cpp",
    parametrosB: 2.4,
    disco: { gb: 1.2, verificado: true },
    ramMinGb: 1.5,
    almacenamiento: { modo: "mmap", soloLocal: true },
    medios: ["nativo", "servidor"],
    licencia: "MIT",
    upstream: "prueba",
    estado: "recomendado",
    origen: "capas",
};

const ALMACEN: MedioAlmacen = {
    id: "mac:interno",
    tipo: "neurona-local",
    etiqueta: "Disco de la Mac",
    neuronaId: "mac",
    via: "local",
    persistente: true,
    privado: true,
    disponible: true,
    fuente: "detectado",
};

function procesador(id: string, neuronaId: string, via: Via, extra: Partial<Procesador> = {}): Procesador {
    return {
        id,
        neuronaId,
        tipo: "cpu",
        nombre: id,
        aceleradores: [],
        runtimes: ["llama-cpp"],
        via,
        disponible: true,
        fuente: "detectado",
        ...extra,
    };
}

function neurona(
    id: string,
    opts: {
        esEsta?: boolean;
        vias?: Via[];
        procesadores?: Procesador[];
        almacenes?: MedioAlmacen[];
        host?: string;
    } = {},
): NeuronaRecursos & { host?: string } {
    return {
        id,
        nombre: `Neurona ${id}`,
        online: true,
        esEsta: opts.esEsta ?? false,
        procesadores: opts.procesadores ?? [procesador(`${id}:cpu`, id, opts.vias?.[0] ?? "local")],
        almacenes: opts.almacenes ?? [],
        vias: opts.vias ?? ["local"],
        ...(opts.host ? { host: opts.host } : {}),
    };
}

function inventario(
    neuronas: NeuronaRecursos[],
    extra: Partial<InventarioRecursos> = {},
): InventarioRecursos {
    return {
        generado: "2026-10-23T10:00:00.000Z",
        estaNeuronaId: neuronas.find((n) => n.esEsta)?.id ?? "mac",
        neuronas,
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
        ...extra,
    };
}

function topologia(
    tipo: Topologia,
    vias: Via[],
    extra: Partial<ConfigTopologia> = {},
): ConfigTopologia {
    return { topologia: tipo, vias, alcance: ALCANCE, ...extra };
}

function plan(t: ConfigTopologia, sugerencias: Sugerencia[] = []): PlanRecursos {
    return { topologia: t, sugerencias, sinOpcion: [], preguntas: [], resumen: "" };
}

function sugerencia(capacidad: Capacidad, p: Procesador): Sugerencia {
    return {
        capacidad,
        modelo: MODELO,
        procesador: p,
        almacen: ALMACEN,
        via: p.via,
        compat: { nivel: "optimo", puntuacion: 90, motivos: [] },
        porQue: [],
        alternativas: [],
    };
}

function asignacion(procesaEn: string): Asignacion {
    return {
        elemento: { tipo: "modelo", id: MODELO.id, nombre: MODELO.nombre },
        almacenEn: ALMACEN.id,
        procesaEn,
        alcance: ALCANCE,
        t: 1,
    };
}

describe("destinoDeIA · servidor-propio", () => {
    it("devuelve la URL del servidor de la neurona elegida (host en su ficha)", () => {
        const a1 = neurona("a1", { vias: ["red-starseed"], host: "192.168.1.50" });
        const inv = inventario([a1]);
        const t = topologia("servidor-propio", ["local", "malla-local", "red-starseed"], { servidorNeuronaId: "a1" });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.via).toBe("red-starseed");
        expect(d.neuronaId).toBe("a1");
        expect(d.baseUrl).toBe(`http://192.168.1.50:${PUERTO_SERVIDOR_IA}/v1`);
        expect(d.motivo).toContain("Servidor propio");
    });

    it("toma el host de la oferta de esa neurona cuando su ficha no lo trae", () => {
        const a1 = neurona("a1", { vias: ["malla-local"] });
        const inv = {
            ...inventario([a1]),
            ofertas: [{ nodoId: "a1", host: "a1.malla.local" }],
        } as InventarioRecursos & { ofertas: unknown };
        const t = topologia("servidor-propio", ["local", "malla-local"], { servidorNeuronaId: "a1" });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.via).toBe("malla-local");
        expect(d.baseUrl).toBe(`http://a1.malla.local:${PUERTO_SERVIDOR_IA}/v1`);
    });

    it("sin host conocido deja la URL en null y lo explica", () => {
        const a1 = neurona("a1", { vias: ["red-starseed"] });
        const inv = inventario([a1]);
        const t = topologia("servidor-propio", ["local", "red-starseed"], { servidorNeuronaId: "a1" });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.neuronaId).toBe("a1");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toMatch(/host no consta|no hay URL/i);
    });
});

describe("destinoDeIA · cada-neurona y fragmentada", () => {
    it("cada-neurona procesa en local, sin servidor propio", () => {
        const mac = neurona("mac", { esEsta: true, vias: ["local"] });
        const inv = inventario([mac]);
        const t = topologia("cada-neurona", ["local"]);

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d).toEqual({ via: "local", neuronaId: "mac", baseUrl: null, motivo: expect.stringContaining("Cada neurona") });
    });

    it("fragmentada va a la neurona del procesador fijado en porCapacidad", () => {
        const mac = neurona("mac", { esEsta: true });
        const gpu = neurona("n-gpu", {
            vias: ["malla-local"],
            procesadores: [procesador("n-gpu:cuda", "n-gpu", "malla-local", { tipo: "gpu", vramGb: 24 })],
        });
        const inv = inventario([mac, gpu]);
        const t = topologia("fragmentada", ["local", "malla-local"], {
            porCapacidad: { texto: { procesaEn: "n-gpu:cuda" } },
        });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("n-gpu");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("Repartida");
    });

    it("fragmentada respeta la asignación del modelo cuando no hay procesador fino", () => {
        const mac = neurona("mac", { esEsta: true });
        const gpu = neurona("n-gpu", {
            vias: ["malla-local"],
            procesadores: [procesador("n-gpu:cuda", "n-gpu", "malla-local", { tipo: "gpu", vramGb: 24 })],
        });
        const inv = inventario([mac, gpu]);
        const t = topologia("fragmentada", ["local", "malla-local"]);
        const p = plan(t, [sugerencia("texto", procesador("mac:cpu", "mac", "local"))]);

        const d = destinoDeIA(p, { [`modelo:${MODELO.id}`]: asignacion("n-gpu:cuda") }, inv, "texto");

        expect(d.neuronaId).toBe("n-gpu");
        expect(d.via).toBe("malla-local");
    });
});

describe("destinoDeIA · almacén externo y comunal", () => {
    it("almacén-externo procesa en la neurona donde se conecta el almacén", () => {
        const mac = neurona("mac", { esEsta: true });
        const nas = neurona("n-nas", { vias: ["malla-local"] });
        const externo: MedioAlmacen = {
            id: "nas:modelos",
            tipo: "servidor-externo",
            etiqueta: "NAS de casa",
            neuronaId: "n-nas",
            via: "malla-local",
            persistente: true,
            privado: true,
            disponible: true,
            fuente: "declarado",
        };
        const inv = inventario([mac, nas], { almacenesSueltos: [externo] });
        const t = topologia("almacen-externo", ["local", "malla-local"], { almacenExternoId: externo.id });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.neuronaId).toBe("n-nas");
        expect(d.via).toBe("malla-local");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("NAS de casa");
    });

    it("comunal usa el servidor compartido disponible", () => {
        const mac = neurona("mac", { esEsta: true });
        const srv = neurona("srv", { vias: ["red-starseed"] });
        const inv = inventario([mac, srv], {
            procesadoresSueltos: [procesador("srv:cpu", "srv", "red-starseed")],
        });
        const t = topologia("comunal", ["local", "red-starseed"]);

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.neuronaId).toBe("srv");
        expect(d.via).toBe("red-starseed");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("Comunal");
    });
});

describe("destinoDeIA · regla de la antena", () => {
    it("nunca elige antena para chat aunque sea la primera vía", () => {
        const a1 = neurona("a1", { vias: ["antena", "malla-local"] });
        const inv = inventario([a1]);
        const t = topologia("servidor-propio", ["antena", "malla-local"], { servidorNeuronaId: "a1" });

        const d = destinoDeIA(plan(t), {}, inv, "texto");

        expect(d.via).not.toBe("antena");
        expect(d.via).toBe("malla-local");
    });

    it("para decisiones sí permite la antena", () => {
        const a1 = neurona("a1", { vias: ["antena"] });
        const inv = inventario([a1]);
        const t = topologia("servidor-propio", ["antena"], { servidorNeuronaId: "a1" });

        const d = destinoDeIA(plan(t), {}, inv, "decision");

        expect(d.via).toBe("antena");
    });
});
