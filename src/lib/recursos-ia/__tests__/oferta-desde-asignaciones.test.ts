import { describe, expect, it } from "vitest";
import { PUERTO_SERVIDOR_IA, modelosServidos, ofertaDesdeAsignaciones, type OpcionesOferta } from "../oferta-desde-asignaciones";
import { asignar, estadoVacio, fijarTopologia } from "../asignaciones";
import type { Alcance, Asignacion, EstadoRecursosIa, InventarioRecursos, NeuronaRecursos, Procesador } from "../tipos";

const T = new Date(2026, 9, 23, 12, 0, 0).getTime();
const privada: Alcance = { tipo: "perfil", id: "c1", visibilidad: "privada" };
const grupo: Alcance = { tipo: "grupo", id: "g1", visibilidad: "publica" };
const cpu: Procesador = {
    id: "n1:cpu", neuronaId: "n1", tipo: "cpu", nombre: "CPU", nucleos: 8, ramGb: 16, ramLibreGb: 12,
    aceleradores: ["neon"], runtimes: ["bitnet-cpp"], via: "local", disponible: true, fuente: "detectado",
};
const gpu: Procesador = { ...cpu, id: "n1:gpu", tipo: "gpu", vramGb: 8, runtimes: ["mlx"] };
const almacen = (id: string, tipo: "neurona-local" | "disco-externo", libreGb: number, privado: boolean) => ({
    id, tipo, etiqueta: id, libreGb, disponible: true, privado, persistente: true, via: "local" as const, fuente: "detectado" as const,
});

function inventario(procesadores: Procesador[] = [cpu]): InventarioRecursos {
    const neurona: NeuronaRecursos = {
        id: "n1", nombre: "Mac", online: true, esEsta: true, procesadores, vias: ["local", "malla-local"],
        almacenes: [almacen("n1:interno", "neurona-local", 100, true), almacen("n1:ext:SSD", "disco-externo", 500, false)],
    };
    return {
        generado: new Date(T).toISOString(), estaNeuronaId: "n1", neuronas: [neurona],
        almacenesSueltos: [], procesadoresSueltos: [], avisos: [],
    };
}

function conModelo(alcance: Alcance, procesaEn?: string, id = "bitnet"): Asignacion {
    return {
        elemento: { tipo: "modelo", id, nombre: id },
        almacenEn: procesaEn ? "biblioteca" : "n1:interno",
        ...(procesaEn ? { procesaEn } : {}),
        alcance,
        t: T,
    };
}

const opciones = (alcance: Alcance = privada, extra: Partial<OpcionesOferta> = {}): OpcionesOferta => ({
    cuentaId: "c1", alcance, t: T, ...extra,
});

describe("ofertaDesdeAsignaciones", () => {
    it("neurona sin servidor propio: ofrece cómputo y modelos, solo a la cuenta", () => {
        const estado: EstadoRecursosIa = asignar(estadoVacio(), conModelo(privada, "n1:cpu"));
        const oferta = ofertaDesdeAsignaciones(inventario(), estado, opciones());

        expect(oferta.presta).toMatchObject({ cuenta: true, grupos: [], publico: false });
        expect(oferta.apps).toEqual([{ id: "modelo:bitnet", version: "n1:cpu" }]);
        expect(oferta.computo).toMatchObject({ nucleos: 8, ramLibreMb: 12288, gpu: false, motores: ["bitnet-cpp"] });
        expect(oferta.almacen).toEqual({ prestaMb: 600 * 1024, volumenes: ["n1:interno", "n1:ext:SSD"] });
        expect(oferta.medio).toBe("local");
        expect(oferta.t).toBe(T);
        expect(oferta.apps.some((a) => a.id === "servidor-ia")).toBe(false);
    });

    it("servidor propio privado: lo publica en :4480 y sirve en auto sin salir de la cuenta", () => {
        const estado = fijarTopologia(asignar(estadoVacio(), conModelo(privada)), {
            topologia: "servidor-propio", servidorNeuronaId: "n1", vias: ["local", "malla-local"], alcance: privada,
        });
        const oferta = ofertaDesdeAsignaciones(inventario([cpu, gpu]), estado, opciones());

        expect(oferta.apps).toEqual([
            { id: "modelo:bitnet", version: "n1:gpu" },
            { id: "servidor-ia", version: String(PUERTO_SERVIDOR_IA) },
        ]);
        expect(oferta.computo).toMatchObject({ gpu: true, vramMb: 8192 });
        expect(oferta.computo.motores).toContain("servidor-ia");
        expect(oferta.presta).toMatchObject({ cuenta: true, grupos: [], publico: false });
        expect(modelosServidos(inventario([cpu, gpu]), estado, opciones())).toEqual([
            { modeloId: "bitnet", procesadorId: "n1:gpu", almacenId: "n1:interno" },
        ]);
    });

    it("alcance de grupo: comparte con el grupo, no lo hace público y no filtra lo privado", () => {
        let estado = asignar(estadoVacio(), conModelo(grupo, "n1:cpu"));
        estado = asignar(estado, conModelo(privada, "n1:cpu", "secreto"));
        estado = fijarTopologia(estado, {
            topologia: "servidor-propio", servidorNeuronaId: "n1", vias: ["local"], alcance: grupo,
        });
        const oferta = ofertaDesdeAsignaciones(inventario(), estado, opciones(grupo));

        expect(oferta.presta).toMatchObject({ cuenta: true, grupos: ["g1"], publico: false });
        expect(oferta.apps).toContainEqual({ id: "modelo:bitnet", version: "n1:cpu" });
        expect(oferta.apps.some((a) => a.id.includes("secreto"))).toBe(false);
        expect(oferta.almacen.volumenes).toEqual(["n1:ext:SSD"]);
    });
});

describe("modelosServidos", () => {
    it("una neurona no sirve lo que procesa otra ni lo que no tiene asignado", () => {
        const estado = asignar(estadoVacio(), conModelo(privada, "n2:cpu", "ajeno"));
        expect(modelosServidos(inventario(), estado, opciones())).toEqual([]);
    });
});
