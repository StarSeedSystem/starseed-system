/**
 * RIA1023D · el servidor propio de IA se registra como modelo propio cuando la topología elegida
 * es «servidor-propio». Solo funciones puras exportadas + localStorage de jsdom (los modelos
 * propios viven en `starseed.astraura.custom-models.v1`, igual que en producción).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CUSTOM_MODELS_KEY, listCustomModels, type CustomModel } from "@/ai/astraura/custom-models";
import { decidirServidorPropio, MARCADOR_SERVIDOR_PROPIO, sincronizarEstadoServidorPropio, sincronizarServidorPropio } from "../use-recursos-ia";
import type { EstadoRecursosIa, InventarioRecursos, NeuronaRecursos, Via } from "../tipos";
import type { ConfigTopologia } from "../tipos";

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

function inventario(neuronas: NeuronaRecursos[]): InventarioRecursos {
    return { generado: "2026-10-23T00:00:00Z", estaNeuronaId: neuronas.find((n) => n.esEsta)?.id ?? "", neuronas, almacenesSueltos: [], procesadoresSueltos: [], avisos: [] };
}

function plan(patch: Partial<ConfigTopologia> = {}): ConfigTopologia {
    return { topologia: "cada-neurona", vias: ["local", "malla-local"], alcance: PRIVADO, ...patch };
}

function planServidora(neuronaId: string): ConfigTopologia {
    return plan({ topologia: "servidor-propio", servidorNeuronaId: neuronaId, vias: ["local", "malla-local", "red-starseed"] });
}

const invMac = () => inventario([neurona("mac", { nombre: "Mac de Alex", esta: true }), neurona("a1", { nombre: "A1 Raspberry", vias: ["malla-local", "red-starseed"] })]);

function marcado(id: string, extra: Partial<CustomModel> = {}): CustomModel {
    return { id, name: "Servidor propio de IA", kind: "llm", access: "local", endpoint: "http://127.0.0.1:4480/v1", notes: MARCADOR_SERVIDOR_PROPIO, at: 1, ...extra };
}

function estadoCon(topologia: ConfigTopologia): EstadoRecursosIa {
    return { v: 1, asignaciones: {}, topologias: { "perfil:alex": topologia }, tamanosConfirmados: {}, almacenesDeclarados: [] };
}

describe("decidirServidorPropio · topología servidor-propio", () => {
    it("servidora esta neurona: registrar con el lazo como endpoint y el marcador en notes", () => {
        const d = decidirServidorPropio(planServidora("mac"), invMac(), []);
        expect(d.accion).toBe("registrar");
        expect(d.baseUrl).toBe("http://127.0.0.1:4480/v1");
        expect(d.registro).toEqual({ name: "Servidor propio de IA · Mac de Alex", endpoint: "http://127.0.0.1:4480/v1", notes: MARCADOR_SERVIDOR_PROPIO });
    });

    it("servidora remota: baseUrl null, no se registra nada (ni se quita lo que ya estaba)", () => {
        const d = decidirServidorPropio(planServidora("a1"), invMac(), [marcado("cm-1")]);
        expect(d.accion).toBe("nada");
        expect(d.baseUrl).toBeNull();
        expect(d.modeloId).toBe("cm-1");
    });

    it("sin servidora nombrada: nada", () => {
        const d = decidirServidorPropio(plan({ topologia: "servidor-propio" }), invMac(), []);
        expect(d.accion).toBe("nada");
    });

    it("sin inventario: nada (la decisión no inventa direcciones)", () => {
        const d = decidirServidorPropio(planServidora("mac"), null, []);
        expect(d.accion).toBe("nada");
    });

    it("servidora distinta a la registrada: actualizar el registro marcado", () => {
        const otro = planServidora("mac");
        const d = decidirServidorPropio(otro, invMac(), [marcado("cm-1", { name: "Servidor propio de IA · A1 Raspberry", endpoint: "http://192.168.1.10:4480/v1" })]);
        expect(d.accion).toBe("actualizar");
        expect(d.modeloId).toBe("cm-1");
        expect(d.registro?.name).toBe("Servidor propio de IA · Mac de Alex");
    });
});

describe("decidirServidorPropio · al cambiar a otra topología", () => {
    it("sin marcado no hay nada que hacer", () => {
        expect(decidirServidorPropio(plan(), invMac(), []).accion).toBe("nada");
        expect(decidirServidorPropio(undefined, invMac(), []).accion).toBe("nada");
    });

    it("con marcado: quitar SOLO ese registro, los modelos propios de la persona quedan", () => {
        const ajenos = [
            marcado("cm-marcado"),
            { id: "cm-llm-nube", name: "Mi LLM de nube", kind: "llm", access: "api", at: 2 },
            { id: "cm-voz", name: "Mi voz", kind: "voice", access: "local", at: 3 },
            { id: "cm-sin-notes", name: "Otro servidor local", kind: "llm", access: "local", endpoint: "http://127.0.0.1:1234/v1", at: 4 },
        ] as CustomModel[];
        const d = decidirServidorPropio(plan(), invMac(), ajenos);
        expect(d.accion).toBe("quitar");
        expect(d.modeloId).toBe("cm-marcado");
    });
});

describe("sincronizarServidorPropio y del estado · con localStorage de jsdom", () => {
    it("al elegir «servidor propio» se registra el modelo propio marcado (y solo uno, aunque se repita)", () => {
        const d = sincronizarServidorPropio(planServidora("mac"), invMac());
        expect(d.accion).toBe("registrar");
        const lista = listCustomModels();
        expect(lista.filter((m) => m.notes === MARCADOR_SERVIDOR_PROPIO)).toHaveLength(1);
        expect(lista[0]).toMatchObject({ name: "Servidor propio de IA · Mac de Alex", kind: "llm", access: "local", endpoint: "http://127.0.0.1:4480/v1" });
        // Idempotente: repetir no añade otro.
        sincronizarServidorPropio(planServidora("mac"), invMac());
        expect(listCustomModels()).toHaveLength(1);
    });

    it("cambiar la servidora no duplica ni toca el registro cuando la nueva no tiene dirección", () => {
        sincronizarServidorPropio(planServidora("mac"), invMac());
        const d = sincronizarServidorPropio(planServidora("a1"), invMac());
        expect(d.accion).toBe("nada"); // a1 es remota → baseUrl null → nada
        // Volver a la servidora local deja el registro intacto y único.
        sincronizarServidorPropio(planServidora("mac"), invMac());
        const marcados = listCustomModels().filter((m) => m.notes === MARCADOR_SERVIDOR_PROPIO);
        expect(marcados).toHaveLength(1);
        expect(marcados[0].name).toBe("Servidor propio de IA · Mac de Alex");
    });

    it("al cambiar a otra topología se quita únicamente el marcado", () => {
        sincronizarServidorPropio(planServidora("mac"), invMac());
        expect(listCustomModels()).toHaveLength(1);
        const d = sincronizarEstadoServidorPropio(estadoCon(plan()), invMac());
        expect(d.accion).toBe("quitar");
        expect(listCustomModels()).toHaveLength(0);
    });

    it("del estado entero: registrar con servidora local, nada con servidora remota", () => {
        const d1 = sincronizarEstadoServidorPropio(estadoCon(planServidora("mac")), invMac());
        expect(d1.accion).toBe("registrar");
        // a1 es remota (baseUrl null): nada, y el registro de la servidora local se queda.
        const d2 = sincronizarEstadoServidorPropio(estadoCon(planServidora("a1")), invMac());
        expect(d2.accion).toBe("nada");
        expect(listCustomModels()).toHaveLength(1);
    });

    it("varias topologías por alcance no duplican el registro", () => {
        const estado = { ...estadoCon(plan()), topologias: { "perfil:alex": plan(), "grupo:x": planServidora("mac") } };
        sincronizarEstadoServidorPropio(estado, invMac());
        expect(listCustomModels().filter((m) => m.notes === MARCADOR_SERVIDOR_PROPIO)).toHaveLength(1);
    });
});

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});
