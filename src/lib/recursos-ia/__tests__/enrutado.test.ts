import { describe, expect, it } from "vitest";
import { destinoDeIA } from "../enrutado";
import type { Alcance, Asignacion, ConfigTopologia, InventarioRecursos, MedioAlmacen, NeuronaRecursos, PlanRecursos, Procesador, Topologia, Via } from "../tipos";

const ESTA = "mac";
const ALCANCE: Alcance = { tipo: "perfil", id: "alex", visibilidad: "privada" };

const proc = (id: string, neuronaId: string, via: Via = "local", nombre = id): Procesador => ({ id, neuronaId, tipo: "cpu", nombre, aceleradores: [], runtimes: ["llama-cpp"], via, disponible: true, fuente: "detectado" });

const neurona = (id: string, nombre: string, vias: Via[], procesadores: Procesador[] = []): NeuronaRecursos => ({ id, nombre, online: true, esEsta: id === ESTA, procesadores, almacenes: [], vias });

const inventario = (neuronas: NeuronaRecursos[], extra: Partial<InventarioRecursos> = {}): InventarioRecursos => ({ generado: "2026-10-26T00:00:00.000Z", estaNeuronaId: ESTA, neuronas, almacenesSueltos: [], procesadoresSueltos: [], avisos: [], ...extra });

const plan = (topologia: Topologia, extra: Partial<ConfigTopologia> = {}): PlanRecursos => ({ topologia: { topologia, vias: ["local", "malla-local"], alcance: ALCANCE, ...extra }, sugerencias: [], sinOpcion: [], preguntas: [], resumen: "" });

const mac = (): NeuronaRecursos => neurona(ESTA, "Mac de Alex", ["local"], [proc(`${ESTA}:cpu`, ESTA)]);
const a1 = (nombre = "a1.lan", vias: Via[] = ["malla-local"]): NeuronaRecursos =>
    neurona("a1", nombre, vias, [proc("a1:cpu", "a1", vias[0])]);
const sinAsignaciones: Record<string, Asignacion> = {};

describe("destinoDeIA", () => {
    it("servidor-propio: devuelve la neurona elegida y la URL de su servidor por la malla", () => {
        const d = destinoDeIA(plan("servidor-propio", { servidorNeuronaId: "a1" }), sinAsignaciones, inventario([mac(), a1()]), "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: "http://a1.lan:4480/v1" });
        expect(d.motivo).toContain("a1.lan");
    });

    it("servidor-propio sin host: no inventa la URL y lo explica", () => {
        const d = destinoDeIA(plan("servidor-propio", { servidorNeuronaId: "a1" }), sinAsignaciones, inventario([mac(), a1("Portátil de Alex")]), "texto");
        expect(d).toMatchObject({ neuronaId: "a1", baseUrl: null });
        expect(d.motivo).toContain("host");
        expect(d.motivo).toContain("4480");
    });

    it("cada-neurona: procesa en local y no pide URL", () => {
        const d = destinoDeIA(plan("cada-neurona"), sinAsignaciones, inventario([mac()]), "texto");
        expect(d).toMatchObject({ via: "local", neuronaId: ESTA, baseUrl: null });
    });

    it("fragmentada: va a la neurona del procesador asignado a la capacidad", () => {
        const p = plan("fragmentada", { porCapacidad: { texto: { procesaEn: "a1:cpu" } } });
        const d = destinoDeIA(p, sinAsignaciones, inventario([mac(), a1()]), "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: "http://a1.lan:4480/v1" });
    });

    it("fragmentada: la asignación guardada del modelo manda sobre el plan", () => {
        const movil = neurona("movil", "movil.lan", ["malla-local"], [proc("movil:cpu", "movil", "malla-local")]);
        const asignada: Asignacion = {
            elemento: { tipo: "modelo", id: "m1", nombre: "Modelo 1" },
            almacenEn: "auto",
            procesaEn: "movil:cpu",
            alcance: ALCANCE,
            t: 1,
        };
        const p = plan("fragmentada", { porCapacidad: { texto: { modeloId: "m1", procesaEn: "a1:cpu" } } });
        const d = destinoDeIA(p, { "modelo:m1": asignada }, inventario([mac(), a1(), movil]), "texto");
        expect(d.neuronaId).toBe("movil");
        expect(d.baseUrl).toBe("http://movil.lan:4480/v1");
    });

    it("almacen-externo: procesa la neurona donde está conectado el almacén", () => {
        const ssd: MedioAlmacen = {
            id: "a1:ext:ssd",
            tipo: "disco-externo",
            etiqueta: "SSD del A1",
            neuronaId: "a1",
            via: "malla-local",
            persistente: true,
            privado: true,
            disponible: true,
            fuente: "declarado",
        };
        const p = plan("almacen-externo", { almacenExternoId: "a1:ext:ssd" });
        const d = destinoDeIA(p, sinAsignaciones, inventario([mac(), a1()], { almacenesSueltos: [ssd] }), "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "a1", baseUrl: "http://a1.lan:4480/v1" });
    });

    it("comunal: usa el servidor de la comunidad y su host", () => {
        const servidor = { ...proc("servidor:nas", "servidor:nas", "malla-local"), nombre: "nas.lan" };
        const d = destinoDeIA(plan("comunal"), sinAsignaciones, inventario([mac()], { procesadoresSueltos: [servidor] }), "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: "servidor:nas", baseUrl: "http://nas.lan:4480/v1" });
    });

    it("antena: el chat nunca sale por antena; la decisión sí puede", () => {
        const soloAntena = neurona("a1", "a1.lan", ["antena"], [proc("a1:cpu", "a1", "antena")]);
        const p = plan("servidor-propio", { servidorNeuronaId: "a1", vias: ["antena"] });
        const chat = destinoDeIA(p, sinAsignaciones, inventario([mac(), soloAntena]), "texto");
        expect(chat.via).not.toBe("antena");
        expect(chat.baseUrl).toBeNull();
        const decision = destinoDeIA(p, sinAsignaciones, inventario([mac(), soloAntena]), "decision");
        expect(decision.via).toBe("antena");
        expect(decision.baseUrl).toBeNull();
    });
});
