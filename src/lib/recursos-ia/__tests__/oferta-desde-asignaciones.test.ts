import { describe, it, expect } from "vitest";
import { estadoVacio, asignar, fijarTopologia } from "../asignaciones";
import type { Alcance, Asignacion, ConfigTopologia, InventarioRecursos, NeuronaRecursos } from "../tipos";
import {
    ofertaDesdeAsignaciones,
    alcancePresta,
    esServidorPropio,
    modelosServidos,
    PUERTO_SERVIDOR_IA,
} from "../oferta-desde-asignaciones";

const N1 = "n-mac";

function neuronaTest(): NeuronaRecursos {
    return {
        id: N1,
        nombre: "Mac de Alex",
        tipo: "macOS",
        online: true,
        esEsta: true,
        vias: ["local", "malla-local"],
        procesadores: [
            {
                id: `${N1}:cpu`,
                neuronaId: N1,
                tipo: "cpu",
                nombre: "M2",
                nucleos: 8,
                ramLibreGb: 5,
                aceleradores: ["neon"],
                runtimes: ["bitnet-cpp"],
                via: "local",
                disponible: true,
                propio: true,
                fuente: "detectado",
            },
            {
                id: `${N1}:gpu`,
                neuronaId: N1,
                tipo: "gpu",
                nombre: "M2 GPU",
                vramGb: 4,
                aceleradores: ["metal"],
                runtimes: ["mlx"],
                via: "local",
                disponible: true,
                propio: true,
                fuente: "detectado",
            },
        ],
        almacenes: [
            {
                id: `${N1}:interno`,
                tipo: "neurona-local",
                etiqueta: "Disco interno",
                neuronaId: N1,
                via: "local",
                persistente: true,
                privado: true,
                disponible: true,
                fuente: "detectado",
                libreGb: 10,
            },
        ],
    };
}

function inventarioTest(): InventarioRecursos {
    return {
        generado: "2026-10-25T00:00:00.000Z",
        estaNeuronaId: N1,
        neuronas: [neuronaTest()],
        almacenesSueltos: [],
        procesadoresSueltos: [],
        modelosInstalados: [{ modeloId: "bitnet-b1.58-2b", procesadorId: `${N1}:cpu` }],
        avisos: [],
    };
}

const ALCANCE_PRIVADO: Alcance = { tipo: "perfil", id: "alex", visibilidad: "privada" };

function asignacionModelo(procesaEn?: string): Asignacion {
    const base: Asignacion = {
        elemento: { tipo: "modelo", id: "bonsai-1.58", nombre: "Bonsai 1.58", tamanoGb: 2 },
        almacenEn: `${N1}:interno`,
        alcance: ALCANCE_PRIVADO,
        t: 1,
        ...(procesaEn ? { procesaEn } : {}),
    };
    return base;
}

function topologiaServidor(alcance: Alcance): ConfigTopologia {
    return { topologia: "servidor-propio", servidorNeuronaId: N1, vias: ["local", "malla-local"], alcance };
}

describe("ofertaDesdeAsignaciones", () => {
    it("neurona sin servidor propio: describe su cómputo y almacén y no presta a nadie", () => {
        const estado = asignar(estadoVacio(), asignacionModelo(`${N1}:cpu`));
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estado, new Date(0));
        expect(oferta.nodoId).toBe(N1);
        expect(oferta.computo.nucleos).toBe(8);
        expect(oferta.computo.ramLibreMb).toBe(5 * 1024);
        expect(oferta.computo.gpu).toBe(true);
        expect(oferta.computo.vramMb).toBe(4 * 1024);
        expect(oferta.computo.motores).toEqual(expect.arrayContaining(["bitnet-cpp", "mlx"]));
        expect(oferta.almacen.prestaMb).toBe(10 * 1024);
        expect(oferta.almacen.volumenes).toEqual([`${N1}:interno`]);
        expect(oferta.presta).toEqual({ cuenta: false, grupos: [], publico: false, topes: expect.anything() });
        expect(oferta.apps).toContainEqual({ id: "bitnet-b1.58-2b", version: `${N1}:cpu` });
        expect(oferta.apps).toContainEqual({ id: "bonsai-1.58", version: `${N1}:cpu` });
        expect(oferta.apps.some((a) => a.id === "servidor-ia")).toBe(false);
        expect(oferta.t).toBe(0);
        expect(oferta.enlaces.latenciaMs).toEqual({ local: 0, "malla-local": 8 });
    });

    it("servidor propio con alcance privado: presta solo a su cuenta, nunca con alcance público", () => {
        const estado = fijarTopologia(estadoVacio(), topologiaServidor(ALCANCE_PRIVADO));
        expect(esServidorPropio(estado, N1)).toBe(true);
        expect(esServidorPropio(estado, "otra")).toBe(false);
        expect(alcancePresta(estado, N1)).toEqual({ cuenta: true, grupos: [], publico: false });
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estado, new Date(0));
        expect(oferta.presta.cuenta).toBe(true);
        expect(oferta.presta.grupos).toEqual([]);
        expect(oferta.presta.publico).toBe(false);
        // presta su servidor propio de IA (puerto 4480)
        expect(oferta.apps).toContainEqual({ id: "servidor-ia", version: String(PUERTO_SERVIDOR_IA) });
        const otro = ofertaDesdeAsignaciones(inventarioTest(), estado);
        expect(otro.t).toBe(Date.parse("2026-10-25T00:00:00.000Z"));
    });

    it("con alcance de grupo: el grupo entra en grupos, la cuenta no", () => {
        const alcance: Alcance = { tipo: "grupo", id: "g-aurora", visibilidad: "privada" };
        const estado = fijarTopologia(estadoVacio(), topologiaServidor(alcance));
        const presta = alcancePresta(estado, N1);
        expect(presta.cuenta).toBe(false);
        expect(presta.grupos).toContain("g-aurora");
        expect(presta.publico).toBe(false);
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estado, new Date(0));
        expect(oferta.presta.grupos).toContain("g-aurora");
        expect(oferta.presta.cuenta).toBe(false);
    });

    it("con alcance de comunidad y visibilidad pública: entra en grupos y sale público a propósito", () => {
        const alcance: Alcance = { tipo: "comunidad", id: "c-raiz", visibilidad: "publica" };
        const estado = fijarTopologia(estadoVacio(), topologiaServidor(alcance));
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estado, new Date(0));
        expect(oferta.presta.grupos).toContain("c-raiz");
        expect(oferta.presta.publico).toBe(true);
    });

    it("nada privado sale con alcance público: dos topologías, la privada no abre a nadie más", () => {
        let estado = fijarTopologia(estadoVacio(), topologiaServidor(ALCANCE_PRIVADO));
        estado = fijarTopologia(estado, {
            ...topologiaServidor({ tipo: "grupo", id: "g-otro", visibilidad: "privada" }),
            servidorNeuronaId: N1,
        });
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estado, new Date(0));
        expect(oferta.presta.cuenta).toBe(true);
        expect(oferta.presta.grupos).toEqual(["g-otro"]);
        expect(oferta.presta.publico).toBe(false);
    });

    it("modelosServidos: modelos instalados en almacén de esta neurona, sin destino y corregidos por asignación", () => {
        const inventario: InventarioRecursos = {
            ...inventarioTest(),
            modelosInstalados: [
                { modeloId: "en-almacen", almacenId: `${N1}:interno` },
                { modeloId: "sin-destino" },
            ],
        };
        const estado = asignar(estadoVacio(), {
            ...asignacionModelo(),
            elemento: { tipo: "modelo", id: "en-almacen", nombre: "En almacén", tamanoGb: 1 },
            almacenEn: `${N1}:interno`,
            procesaEn: `${N1}:cpu`,
        });
        expect(modelosServidos(inventario, estado)).toEqual([
            { id: "en-almacen", version: `${N1}:cpu` },
            { id: "sin-destino", version: "auto" },
        ]);
    });

    it("el medio sale del tipo de la neurona del inventario", () => {
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), estadoVacio(), new Date(0));
        expect(oferta.medio).toBe("macOS");
        expect(ofertaDesdeAsignaciones({ ...inventarioTest(), neuronas: [] }, estadoVacio(), new Date(0)).medio).toBe("neurona");
    });

    it("modelosServidos: inventario sin neurona conocida y asignación a procesador ajeno no la suscriben", () => {
        const vacio: InventarioRecursos = { ...inventarioTest(), neuronas: [], modelosInstalados: [] };
        const estado = asignar(estadoVacio(), asignacionModelo("otra-neurona:cpu"));
        expect(modelosServidos(vacio, estado)).toEqual([]);
        expect(ofertaDesdeAsignaciones(vacio, estado, new Date(0)).computo.nucleos).toBe(0);
        expect(ofertaDesdeAsignaciones(vacio, estado, new Date(0)).almacen.prestaMb).toBe(0);
    });

    it("neurona sin servidor propio", () => {
        const e = asignar(estadoVacio(), {
            ...asignacionModelo(),
            elemento: { tipo: "modelo", id: "mod1", nombre: "mod1", tamanoGb: 5 },
            almacenEn: `${N1}:interno`,
        });
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), e, new Date(0));
        expect(oferta.presta.cuenta).toBe(false);
        expect(oferta.almacen.prestaMb).toBe(10 * 1024); // El inventario tiene 10GB libres
    });

    it("neurona con servidor propio privado", () => {
        const e = fijarTopologia(estadoVacio(), topologiaServidor(ALCANCE_PRIVADO));
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), e, new Date(0));
        expect(oferta.presta.cuenta).toBe(true);
    });

    it("neurona con alcance de grupo", () => {
        const alcance: Alcance = { tipo: "grupo", id: "g1", visibilidad: "publica" };
        const e = fijarTopologia(estadoVacio(), topologiaServidor(alcance));
        const oferta = ofertaDesdeAsignaciones(inventarioTest(), e, new Date(0));
        expect(oferta.presta.grupos).toContain("g1");
    });
});

