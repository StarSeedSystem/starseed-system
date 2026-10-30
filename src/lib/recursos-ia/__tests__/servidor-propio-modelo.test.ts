// @vitest-environment jsdom
/**
 * RIA1023D · la topología «servidor-propio» se refleja como modelo propio de Astraura.
 * Solo funciones puras con estado en localStorage de jsdom (entrada → salida).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    addCustomModel,
    listCustomModels,
    NOTES_SERVIDOR_PROPIO,
} from "@/ai/astraura/custom-models";
import { destinoServidorPropio, sincronizarServidorPropioModelo } from "../use-recursos-ia";
import type {
    Alcance,
    ConfigTopologia,
    EstadoRecursosIa,
    InventarioRecursos,
    NeuronaRecursos,
    Via,
} from "../tipos";

const PRIVADO: Alcance = { tipo: "perfil", id: "alex", visibilidad: "privada" };

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
    return {
        generado: "2026-10-23T00:00:00Z",
        estaNeuronaId: neuronas.find((n) => n.esEsta)?.id ?? "",
        neuronas,
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
    };
}

function plan(patch: Partial<ConfigTopologia> = {}): ConfigTopologia {
    return { topologia: "servidor-propio", vias: ["local", "malla-local"], alcance: PRIVADO, ...patch };
}

function estado(...planes: ConfigTopologia[]): EstadoRecursosIa {
    return {
        v: 1,
        asignaciones: {},
        topologias: Object.fromEntries(planes.map((c) => [`${c.alcance.tipo}:${c.alcance.id}`, c])),
        tamanosConfirmados: {},
        almacenesDeclarados: [],
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe("servidor-propio · registro del modelo propio", () => {
    it("con la servidora en esta neurona registra el modelo local en el lazo 4480", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const m = sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "mac" })), inv);

        expect(m).toMatchObject({
            name: "Servidor propio de IA · Mac de Alex",
            kind: "llm",
            access: "local",
            endpoint: "http://127.0.0.1:4480/v1",
            notes: NOTES_SERVIDOR_PROPIO,
        });
        const lista = listCustomModels();
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ endpoint: "http://127.0.0.1:4480/v1", notes: "recursos-ia:servidor-propio" });
    });

    it("al volver a sincronizar actualiza el mismo registro y no duplica", () => {
        const invUno = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const primero = sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "mac" })), invUno);
        const invDos = inventario([neurona("mac", { nombre: "Mac del estudio", esta: true })]);
        const segundo = sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "mac" })), invDos);

        expect(segundo?.id).toBe(primero?.id);
        expect(segundo?.name).toBe("Servidor propio de IA · Mac del estudio");
        expect(listCustomModels()).toHaveLength(1);
    });

    it("si la servidora es remota (baseUrl null) no registra nada", () => {
        const inv = inventario([
            neurona("mac", { esta: true }),
            neurona("a1", { nombre: "A1", vias: ["malla-local", "red-starseed"] }),
        ]);
        const m = sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "a1" })), inv);

        expect(m).toBeNull();
        expect(listCustomModels()).toHaveLength(0);
    });

    it("al cambiar a otra topología quita solo el modelo marcado", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "mac" })), inv);
        addCustomModel({ name: "Mi Ollama", kind: "llm", access: "local", endpoint: "http://127.0.0.1:11434", notes: "mío" });

        sincronizarServidorPropioModelo(estado(plan({ topologia: "cada-neurona", servidorNeuronaId: "mac" })), inv);

        const lista = listCustomModels();
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ name: "Mi Ollama", notes: "mío" });
    });
});

describe("servidor-propio · límites honestos", () => {
    it("sin inventario no decide ni borra el registro que ya existía", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const estadoPropio = estado(plan({ servidorNeuronaId: "mac" }));
        sincronizarServidorPropioModelo(estadoPropio, inv);

        expect(sincronizarServidorPropioModelo(estadoPropio, null)).toBeNull();
        expect(listCustomModels()).toHaveLength(1);
    });

    it("si la servidora deja de ser esta neurona, retira el registro local viejo", () => {
        const local = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        const estadoPropio = estado(plan({ servidorNeuronaId: "mac" }));
        sincronizarServidorPropioModelo(estadoPropio, local);

        const remoto = inventario([
            neurona("mac", { esta: true }),
            neurona("a1", { nombre: "A1", vias: ["malla-local"] }),
        ]);
        expect(sincronizarServidorPropioModelo(estado(plan({ servidorNeuronaId: "a1" })), remoto)).toBeNull();
        expect(listCustomModels()).toHaveLength(0);
    });

    it("destinoServidorPropio devuelve la dirección, la neurona y su nombre; sin servidora, null", () => {
        const inv = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true })]);
        expect(destinoServidorPropio(estado(plan({ servidorNeuronaId: "mac" })), inv)).toEqual({
            baseUrl: "http://127.0.0.1:4480/v1",
            neuronaId: "mac",
            nombre: "Mac de Alex",
        });
        expect(destinoServidorPropio(estado(plan()), inv)).toBeNull();
    });
});
