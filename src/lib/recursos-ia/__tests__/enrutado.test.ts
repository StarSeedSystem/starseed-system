import { describe, expect, it } from "vitest";
import { destinoDeIA } from "../enrutado";
import type {
    Alcance,
    Capacidad,
    ConfigTopologia,
    InventarioRecursos,
    MedioAlmacen,
    NeuronaRecursos,
    PlanRecursos,
    Procesador,
    Via,
} from "../tipos";

const ESTA = "mac";
const OTRA = "a1";
const PRIVADO: Alcance = { tipo: "perfil", id: "u1", visibilidad: "privada" };

function neurona(id: string, vias: Via[] = ["local"], extra: Record<string, unknown> = {}): NeuronaRecursos {
    return { id, nombre: id, online: true, esEsta: id === ESTA, procesadores: [], almacenes: [], vias, ...extra } as NeuronaRecursos;
}

function procesador(id: string, neuronaId: string, via: Via): Procesador {
    return { id, neuronaId, tipo: "gpu", nombre: id, aceleradores: [], runtimes: [], via, disponible: true, fuente: "detectado" };
}

function almacen(id: string, neuronaId: string, via: Via): MedioAlmacen {
    return { id, tipo: "disco-externo", etiqueta: id, neuronaId, via, persistente: true, privado: true, disponible: true, fuente: "detectado" };
}

function inventario(neuronas: NeuronaRecursos[], extra: Partial<InventarioRecursos> = {}): InventarioRecursos {
    return { generado: "2026-10-23T00:00:00.000Z", estaNeuronaId: ESTA, neuronas, almacenesSueltos: [], procesadoresSueltos: [], avisos: [], ...extra };
}

function plan(topologia: ConfigTopologia): PlanRecursos {
    return { topologia, sugerencias: [], sinOpcion: [], preguntas: [], resumen: "" };
}

function top(parcial: Partial<ConfigTopologia> & Pick<ConfigTopologia, "topologia">): ConfigTopologia {
    return { vias: ["local", "malla-local", "red-starseed"], alcance: PRIVADO, ...parcial };
}

describe("destinoDeIA", () => {
    it("cada-neurona: usa esta neurona en local y sin servidor externo", () => {
        const d = destinoDeIA(plan(top({ topologia: "cada-neurona" })), undefined, inventario([neurona(ESTA)]), "texto");
        expect(d).toMatchObject({ via: "local", neuronaId: ESTA, baseUrl: null });
        expect(d.motivo).toContain("esta neurona");
    });

    it("servidor-propio: devuelve la URL del servidor de la neurona elegida", () => {
        const inv = inventario([neurona(ESTA), neurona(OTRA, ["malla-local"], { host: "a1.local" })]);
        const d = destinoDeIA(plan(top({ topologia: "servidor-propio", servidorNeuronaId: OTRA, vias: ["malla-local"] })), undefined, inv, "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: OTRA, baseUrl: "http://a1.local:4480/v1" });
    });

    it("servidor-propio sin host en el inventario: baseUrl null y motivo legible", () => {
        const inv = inventario([neurona(ESTA), neurona(OTRA, ["malla-local"])]);
        const d = destinoDeIA(plan(top({ topologia: "servidor-propio", servidorNeuronaId: OTRA, vias: ["malla-local"] })), undefined, inv, "texto");
        expect(d.baseUrl).toBeNull();
        expect(d.neuronaId).toBe(OTRA);
        expect(d.motivo).toContain("host");
    });

    it("nunca manda chat por antena; una decisión sí puede ir por antena", () => {
        const inv = inventario([neurona(ESTA), neurona(OTRA, ["antena"], { host: "nodo-radio" })]);
        const cfg = top({ topologia: "servidor-propio", servidorNeuronaId: OTRA, vias: ["antena"] });
        const chat = destinoDeIA(plan(cfg), undefined, inv, "texto");
        expect(chat.via).not.toBe("antena");
        expect(chat.baseUrl).toBeNull();
        const decision = destinoDeIA(plan(cfg), undefined, inv, "decision");
        expect(decision).toMatchObject({ via: "antena", baseUrl: "http://nodo-radio:4480/v1" });
    });

    it("fragmentada: va a la neurona asignada a esa capacidad", () => {
        const a1 = { ...neurona(OTRA, ["malla-local"]), procesadores: [procesador(`${OTRA}:gpu`, OTRA, "malla-local")] };
        const cfg = top({ topologia: "fragmentada", porCapacidad: { texto: { procesaEn: `${OTRA}:gpu` } } });
        const d = destinoDeIA(plan(cfg), undefined, inventario([neurona(ESTA), a1]), "texto");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: OTRA, baseUrl: null });
    });

    it("almacen-externo: procesa en la neurona donde se conecta el almacén", () => {
        const inv = inventario([neurona(ESTA), neurona(OTRA, ["malla-local"])], { almacenesSueltos: [almacen("ssd", OTRA, "malla-local")] });
        const d = destinoDeIA(plan(top({ topologia: "almacen-externo", almacenExternoId: "ssd" })), undefined, inv, "embeddings");
        expect(d).toMatchObject({ via: "malla-local", neuronaId: OTRA, baseUrl: null });
    });

    it("comunal: usa un servidor compartido disponible", () => {
        const comunal = procesador("servidor:g1", "g1", "red-starseed");
        const inv = inventario([neurona(ESTA)], { procesadoresSueltos: [comunal] });
        const d = destinoDeIA(plan(top({ topologia: "comunal" })), undefined, inv, "texto" as Capacidad);
        expect(d).toMatchObject({ via: "red-starseed", neuronaId: "g1", baseUrl: null });
        expect(d.motivo).toContain("servidor:g1");
    });
});
