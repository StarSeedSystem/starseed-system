// @vitest-environment jsdom
/**
 * RIA1023D · con la topología «servidor-propio», Astraura registra el servidor propio de IA
 * como modelo propio (`custom-models.v1`, marca `NOTAS_SERVIDOR_PROPIO`) y al irse a otra
 * topología lo quita SÓLO a él. Las decisiones son puras (`objetivoServidorPropio`,
 * `decidirServidorPropio`); el registro se prueba contra el localStorage real de jsdom.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NOTAS_SERVIDOR_PROPIO, addCustomModel, listCustomModels } from "@/ai/astraura/custom-models";
import { decidirServidorPropio, objetivoServidorPropio, sincronizarServidorPropio } from "../use-recursos-ia";
import type { ConfigTopologia, EstadoRecursosIa, InventarioRecursos, NeuronaRecursos, Via } from "../tipos";

const PRIVADO = { tipo: "perfil" as const, id: "alex", visibilidad: "privada" as const };
const LAZO = "http://127.0.0.1:4480/v1";

function neurona(id: string, opts: { nombre?: string; esta?: boolean; vias?: Via[] } = {}): NeuronaRecursos {
    return {
        id,
        nombre: opts.nombre ?? id,
        online: true,
        esEsta: opts.esta ?? false,
        procesadores: [],
        almacenes: [],
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
    return { topologia: "cada-neurona", vias: ["local", "malla-local"], alcance: PRIVADO, ...patch };
}

function estadoCon(planes: ConfigTopologia[]): EstadoRecursosIa {
    return {
        v: 1,
        asignaciones: {},
        topologias: Object.fromEntries(planes.map((p, i) => [`perfil:alcance${i}`, p])),
        tamanosConfirmados: {},
        almacenesDeclarados: [],
    };
}

beforeEach(() => {
    window.localStorage.clear();
});

describe("objetivoServidorPropio (puro)", () => {
    const inv = inventario([
        neurona("mac", { nombre: "Mac de Alex", esta: true }),
        neurona("a1", { nombre: "A1 Raspberry" }),
    ]);

    it("servidora = esta neurona: nombre de la neurona + lazo 127.0.0.1:4480", () => {
        const o = objetivoServidorPropio(plan({ topologia: "servidor-propio", servidorNeuronaId: "mac" }), {}, inv);
        expect(o).toEqual({ name: "Servidor propio de IA · Mac de Alex", endpoint: LAZO });
    });

    it("otra topología: nada que registrar", () => {
        expect(objetivoServidorPropio(plan(), {}, inv)).toBeNull();
    });

    it("servidora remota aún sin dirección publicada (baseUrl null): no registra nada", () => {
        expect(objetivoServidorPropio(plan({ topologia: "servidor-propio", servidorNeuronaId: "a1" }), {}, inv)).toBeNull();
    });

    it("topología sin servidora nombrada: no registra nada", () => {
        expect(objetivoServidorPropio(plan({ topologia: "servidor-propio" }), {}, inv)).toBeNull();
    });
});

describe("decidirServidorPropio (puro)", () => {
    const objetivo = { name: "Servidor propio de IA · Mac de Alex", endpoint: LAZO };
    const marcado = { id: "cm-1", name: objetivo.name, endpoint: objetivo.endpoint };
    const otro = { id: "cm-2", name: "Servidor propio de IA · A1", endpoint: "http://a1.local:4480/v1" };

    it("sin objetivo y sin marcados: nada", () => {
        expect(decidirServidorPropio(null, [])).toEqual({ accion: "nada" });
    });

    it("sin objetivo y con marcados: quitar sólo los marcados", () => {
        expect(decidirServidorPropio(null, [marcado])).toEqual({ accion: "quitar", ids: ["cm-1"] });
    });

    it("objetivo y sin marcados: registrar", () => {
        expect(decidirServidorPropio(objetivo, [])).toEqual({ accion: "registrar" });
    });

    it("objetivo ya reflejado: nada", () => {
        expect(decidirServidorPropio(objetivo, [marcado])).toEqual({ accion: "nada" });
    });

    it("objetivo distinto del marcado: actualizar el mismo registro", () => {
        expect(decidirServidorPropio(objetivo, [otro])).toEqual({ accion: "actualizar", id: "cm-2", objetivo });
    });

    it("objetivo reflejado y una sobra: quitar sólo la sobra", () => {
        expect(decidirServidorPropio(objetivo, [marcado, otro])).toEqual({ accion: "quitar", ids: ["cm-2"] });
    });

    it("objetivo distinto y una sobra: actualizar el primero y quitar la sobra", () => {
        expect(decidirServidorPropio(objetivo, [otro, marcado])).toEqual({ accion: "actualizar", id: "cm-2", objetivo, sobran: ["cm-1"] });
    });
});

describe("sincronizarServidorPropio · registro en localStorage", () => {
    const invMac = inventario([neurona("mac", { nombre: "Mac de Alex", esta: true }), neurona("a1", { nombre: "A1 Raspberry" })]);
    const propioMac = plan({ topologia: "servidor-propio", servidorNeuronaId: "mac" });
    const propioA1 = plan({ topologia: "servidor-propio", servidorNeuronaId: "a1" });

    it("registra UN modelo propio: llm, acceso local, endpoint del servidor y la marca", () => {
        const d = sincronizarServidorPropio(estadoCon([propioMac]), invMac);
        expect(d).toEqual({ accion: "registrar" });
        const [m] = listCustomModels();
        expect(m).toMatchObject({
            name: "Servidor propio de IA · Mac de Alex",
            kind: "llm",
            access: "local",
            endpoint: LAZO,
            notes: NOTAS_SERVIDOR_PROPIO,
        });
    });

    it("es idempotente: dos llamadas con lo mismo no duplican el registro", () => {
        sincronizarServidorPropio(estadoCon([propioMac]), invMac);
        expect(sincronizarServidorPropio(estadoCon([propioMac]), invMac)).toEqual({ accion: "nada" });
        expect(listCustomModels()).toHaveLength(1);
    });

    it("cambia la servidora conocida: actualiza el MISMO registro (no duplica) y luego se quita", () => {
        sincronizarServidorPropio(estadoCon([propioMac]), invMac);
        const id = listCustomModels()[0].id;
        expect(sincronizarServidorPropio(estadoCon([propioMac]), invMac)).toEqual({ accion: "nada" });
        // La servidora deja de ser esta neurona (a1 remota, sin baseUrl): se quita el marcado.
        expect(sincronizarServidorPropio(estadoCon([propioA1]), invMac)).toEqual({ accion: "quitar", ids: [id] });
        expect(listCustomModels()).toHaveLength(0);
    });

    it("se va a otra topología: quita SÓLO el marcado y conserva los modelos a mano del usuario", () => {
        addCustomModel({ name: "Mi LM Studio", kind: "llm", access: "local", endpoint: "http://127.0.0.1:1234/v1" });
        sincronizarServidorPropio(estadoCon([propioMac]), invMac);
        const idMarcado = listCustomModels().find((m) => m.notes === NOTAS_SERVIDOR_PROPIO)?.id;
        expect(idMarcado).toBeTruthy();
        const d = sincronizarServidorPropio(estadoCon([plan()]), invMac);
        expect(d).toEqual({ accion: "quitar", ids: [idMarcado!] });
        const lista = listCustomModels();
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatchObject({ name: "Mi LM Studio", notes: undefined });
    });

    it("una sobra marcada se quita aunque el primero quede actualizado", () => {
        addCustomModel({ name: "Servidor propio de IA · viejo", kind: "llm", access: "local", endpoint: "http://viejo:4480/v1", notes: NOTAS_SERVIDOR_PROPIO });
        const marcadoId = listCustomModels().find((m) => m.notes === NOTAS_SERVIDOR_PROPIO)?.id;
        expect(sincronizarServidorPropio(estadoCon([propioMac]), invMac)).toEqual({
            accion: "actualizar",
            id: marcadoId!,
            objetivo: { name: "Servidor propio de IA · Mac de Alex", endpoint: LAZO },
        });
        expect(listCustomModels()).toHaveLength(1);
        expect(listCustomModels()[0]).toMatchObject({ name: "Servidor propio de IA · Mac de Alex", endpoint: LAZO });
    });
});


