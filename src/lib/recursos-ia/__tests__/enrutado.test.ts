/**
 * Pruebas de `enrutado.ts` (RIA1023C): destino de cada capacidad según la topología.
 * Solo funciones puras: nada de red, disco ni rutas de Next.
 */
import { describe, expect, it } from "vitest";

import { claveElemento } from "../asignaciones";
import { destinoDeIA, hostDeNeurona, type NeuronaConHost } from "../enrutado";
import type {
    Asignacion,
    Capacidad,
    Compatibilidad,
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

/* ───────────────────────────── ladrillos mínimos ───────────────────────────── */

const proc = (id: string, neuronaId: string, via: Via): Procesador => ({
    id,
    neuronaId,
    tipo: neuronaId.startsWith("servidor:") ? "servidor" : "cpu",
    nombre: id,
    aceleradores: [],
    runtimes: [],
    via,
    disponible: true,
    fuente: "declarado",
});

const neurona = (id: string, extra: Partial<NeuronaRecursos> = {}, vias: Via[] = ["local"]): NeuronaRecursos => ({
    id,
    nombre: id.toUpperCase(),
    online: true,
    esEsta: id === "mac",
    procesadores: [proc(`${id}:cpu`, id, vias[0])],
    almacenes: [],
    vias,
    ...extra,
});

/** Host publicado por la oferta de esa neurona (lo que `destinoDeIA` lee). */
const conHost = (n: NeuronaRecursos, host: string): NeuronaRecursos & NeuronaConHost => Object.assign({}, n, { host });

const inv = (extra: Partial<InventarioRecursos> = {}): InventarioRecursos => ({
    generado: "2026-10-27T00:00:00.000Z",
    estaNeuronaId: "mac",
    neuronas: [
        neurona("mac"),
        conHost(neurona("a1", {}, ["malla-local", "red-starseed"]), "A1.local"),
        neurona("lora", {}, ["antena"]),
    ],
    almacenesSueltos: [],
    procesadoresSueltos: [],
    avisos: [],
    ...extra,
});

const config = (topologia: Topologia, extra: Partial<ConfigTopologia> = {}): ConfigTopologia => ({
    topologia,
    vias: ["local", "malla-local", "red-starseed"],
    alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
    ...extra,
});

const plan = (c: ConfigTopologia, sugerencias: Sugerencia[] = []): PlanRecursos => ({ topologia: c, sugerencias, sinOpcion: [], preguntas: [], resumen: "" });

const asign = (modeloId: string, procesaEn: string): Asignacion => ({
    elemento: { tipo: "modelo", id: modeloId, nombre: modeloId },
    almacenEn: "auto",
    procesaEn,
    alcance: { tipo: "perfil", id: "alex", visibilidad: "privada" },
    t: 0,
});

/* Sugerencia mínima (para la cadena de `fragmentada`). */
const modelo = (id: string): RequisitosModelo => ({
    id,
    nombre: id,
    familia: "bitnet",
    capacidades: ["texto", "decision"],
    bits: 1.58,
    formato: "gguf",
    runtime: "bitnet-cpp",
    parametrosB: 2,
    disco: { gb: 1, verificado: true },
    ramMinGb: 2,
    almacenamiento: { modo: "carga-completa", soloLocal: false },
    medios: ["web"],
    licencia: "MIT",
    upstream: "upstream",
    estado: "recomendado",
    origen: "catalogo-local",
});

const suggestion = (cap: Capacidad, modeloId: string, p: Procesador): Sugerencia => {
    const almacen: MedioAlmacen = { id: `${p.neuronaId}:int`, tipo: "neurona-local", etiqueta: p.neuronaId, via: p.via, persistente: true, privado: true, disponible: true, fuente: "declarado" };
    const compat: Compatibilidad = { nivel: "bueno", puntuacion: 50, motivos: [] };
    return { capacidad: cap, modelo: modelo(modeloId), procesador: p, almacen, via: p.via, compat, porQue: [], alternativas: [] };
};

describe("hostDeNeurona", () => {
    it("quita esquema, ruta y puerto; vacío no vale", () => {
        expect(hostDeNeurona(conHost(neurona("x"), "http://a.local:4480/v1"))).toBe("a.local");
        expect(hostDeNeurona(neurona("x"))).toBeNull();
    });
});

describe("destinoDeIA · cada-neurona", () => {
    it("va a esta neurona por local, sin baseUrl", () => {
        const d = destinoDeIA(plan(config("cada-neurona")), {}, inv(), "texto");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("mac");
        expect(d.baseUrl).toBeNull();
    });
});

describe("destinoDeIA · servidor-propio", () => {
    const segunA1 = plan(config("servidor-propio", { servidorNeuronaId: "a1" }));

    it("con host conocido: la API 4480 de esa neurona", () => {
        const d = destinoDeIA(segunA1, {}, inv(), "texto");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("a1");
        expect(d.baseUrl).toBe("http://A1.local:4480/v1");
    });

    it("sin host en el inventario: baseUrl null y un motivo legible", () => {
        const sinHost = inv({ neuronas: [neurona("mac"), neurona("a1", {}, ["malla-local"]), neurona("lora", {}, ["antena"])] });
        const d = destinoDeIA(segunA1, {}, sinHost, "texto");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe("a1");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("host");
    });

    it("apagada: sin baseUrl y queda claro por qué", () => {
        const dormida = inv({ neuronas: [neurona("mac"), { ...conHost(neurona("a1", {}, ["malla-local"]), "a1.local"), online: false }] });
        const d = destinoDeIA(segunA1, {}, dormida, "razon");
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("apagada");
    });

    it("sin servidorNeuronaId: la neurona actual sirve toda la cuenta", () => {
        const d = destinoDeIA(plan(config("servidor-propio")), {}, inv({ neuronas: [conHost(neurona("mac"), "Mac.local")] }), "texto");
        expect(d.baseUrl).toBe("http://Mac.local:4480/v1");
        expect(d.neuronaId).toBe("mac");
        expect(d.via).toBe("local");
    });

    it('el texto no va por antena (§3): queda en esta neurona; la decisión sí va por antena, sin baseUrl', () => {
        const antenera = plan(config("servidor-propio", { servidorNeuronaId: "lora" }));
        const chat = destinoDeIA(antenera, {}, inv(), "texto");
        expect(chat.via).toBe("local");
        expect(chat.neuronaId).toBe("mac");
        const reflejo = destinoDeIA(antenera, {}, inv(), "decision");
        expect(reflejo.via).toBe("antena");
        expect(reflejo.baseUrl).toBeNull();
    });
});

describe("destinoDeIA · fragmentada", () => {
    it("porCapacidad del plan fija la neurona", () => {
        const p = plan(config("fragmentada", { porCapacidad: { texto: { procesaEn: "a1:cpu" } } }));
        const d = destinoDeIA(p, {}, inv(), "texto");
        expect(d.neuronaId).toBe("a1");
        expect(d.via).toBe("malla-local");
        expect(d.baseUrl).toBeNull();
    });

    it("si porCapacidad es «auto», manda la asignación guardada del modelo sugerido", () => {
        const p = plan(
            config("fragmentada", { porCapacidad: { texto: { procesaEn: "auto" } } }),
            [suggestion("texto", "m1", proc("a1:cpu", "a1", "malla-local"))],
        );
        const asignaciones = { [claveElemento("modelo", "m1")]: asign("m1", "a1:cpu") };
        const d = destinoDeIA(p, asignaciones, inv(), "texto");
        expect(d.neuronaId).toBe("a1");
        expect(d.via).toBe("malla-local");
    });

    it("sin asignación ni sugerencia: queda en esta neurona", () => {
        const d = destinoDeIA(plan(config("fragmentada")), {}, inv(), "embeddings");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("mac");
    });

    it("una neurona solo por antena no recibe el chat (§3)", () => {
        const p = plan(config("fragmentada", { porCapacidad: { texto: { procesaEn: "lora:cpu" } } }));
        const d = destinoDeIA(p, {}, inv(), "texto");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("mac");
    });
});

describe("destinoDeIA · almacen-externo y comunal", () => {
    it("almacen-externo: los pesos viven fuera y procesa esta neurona", () => {
        const d = destinoDeIA(plan(config("almacen-externo", { almacenExternoId: "disco-usb" })), {}, inv(), "imagen");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe("mac");
        expect(d.baseUrl).toBeNull();
    });

    it("comunal: sin servidor concreto para la capacidad, neurona y baseUrl en null", () => {
        const d = destinoDeIA(plan(config("comunal", { vias: ["malla-local", "red-starseed"] })), {}, inv(), "texto");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBeNull();
        expect(d.baseUrl).toBeNull();
    });

    it("comunal con las vías a la antena: solo la decisión pasa (§3)", () => {
        const d = destinoDeIA(plan(config("comunal", { vias: ["antena"] })), {}, inv(), "decision");
        expect(d.via).toBe("antena");
        const chat = destinoDeIA(plan(config("comunal", { vias: ["antena"] })), {}, inv(), "texto");
        expect(chat.via).toBe("local");
    });
});
