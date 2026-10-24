import { describe, expect, it } from "vitest";
import { ofertaVisiblePara, capacidadPrestable } from "../../recursos/oferta";
import { asignar, estadoVacio, fijarTopologia } from "../asignaciones";
import { ofertaDesdeAsignaciones, serviciosDeIA, MOTOR_SERVIDOR_IA } from "../oferta-desde-asignaciones";
import type { Alcance, Asignacion, InventarioRecursos } from "../tipos";

const PERFIL: Alcance = { tipo: "perfil", id: "cuenta", visibilidad: "privada" };
const CTX = { cuentaId: "u1", ahora: 1_760_000_000_000 };

function inventario(): InventarioRecursos {
    return {
        generado: "2026-10-23",
        estaNeuronaId: "n1",
        neuronas: [
            {
                id: "n1",
                nombre: "Mac",
                online: true,
                esEsta: true,
                vias: ["local"],
                procesadores: [
                    {
                        id: "n1:cpu", neuronaId: "n1", tipo: "cpu", nombre: "CPU", nucleos: 4, ramLibreGb: 8,
                        aceleradores: ["neon"], runtimes: ["bitnet-cpp"], via: "local", disponible: true, fuente: "detectado",
                    },
                    {
                        id: "n1:gpu", neuronaId: "n1", tipo: "gpu", nombre: "GPU", vramGb: 6,
                        aceleradores: ["metal"], runtimes: [], via: "local", disponible: true, fuente: "detectado",
                    },
                ],
                almacenes: [
                    { id: "n1:interno", tipo: "neurona-local", etiqueta: "Interno", via: "local", persistente: true, privado: true, disponible: true, fuente: "detectado", libreGb: 20 },
                    { id: "n1:ext:usb", tipo: "disco-externo", etiqueta: "USB", via: "local", persistente: true, privado: true, disponible: true, fuente: "detectado", libreGb: 10 },
                    { id: "n1:roto", tipo: "neurona-local", etiqueta: "Roto", via: "local", persistente: true, privado: true, disponible: false, fuente: "detectado", libreGb: 99 },
                ],
            },
        ],
        almacenesSueltos: [],
        procesadoresSueltos: [],
        avisos: [],
    };
}

describe("ofertaDesdeAsignaciones", () => {
    it("neurona sin servidor propio: nada público, sin motor de servidor de IA", () => {
        const o = ofertaDesdeAsignaciones(inventario(), estadoVacio(), CTX);
        expect(o.nodoId).toBe("n1");
        expect(o.cuentaId).toBe("u1");
        expect(o.computo.nucleos).toBe(4);
        expect(o.computo.ramLibreMb).toBe(8 * 1024);
        expect(o.computo.gpu).toBe(true);
        expect(o.computo.vramMb).toBe(6 * 1024);
        expect(o.computo.motores).toContain("bitnet-cpp");
        expect(o.computo.motores).not.toContain(MOTOR_SERVIDOR_IA);
        expect(o.almacen.prestaMb).toBe(30 * 1024);
        expect(o.almacen.volumenes).toEqual(["n1:interno", "n1:ext:usb"]);
        expect(o.presta.cuenta).toBe(true);
        expect(o.presta.grupos).toEqual([]);
        expect(o.presta.publico).toBe(false);
        expect(o.enlaces.latenciaMs?.local).toBe(0);
    });

    it("servidor propio privado: sirve a la cuenta, nada al público", () => {
        const estado = asignar(
            fijarTopologia(estadoVacio(), {
                topologia: "servidor-propio",
                servidorNeuronaId: "n1",
                vias: ["local", "malla-local"],
                alcance: PERFIL,
            }),
            asigModelo(PERFIL),
        );
        const inv = inventario();
        const o = ofertaDesdeAsignaciones(inv, estado, CTX);
        expect(o.computo.motores).toContain(MOTOR_SERVIDOR_IA);
        expect(o.computo.motores).toContain("modelo-demo");
        expect(serviciosDeIA(inv, estado)).toEqual([{ modeloId: "modelo-demo", procesadorId: "n1:cpu", alcance: PERFIL }]);
        expect(o.presta.cuenta).toBe(true);
        expect(o.presta.grupos).toEqual([]);
        expect(o.presta.publico).toBe(false);
    });

    it("alcance de grupo: presta a ese grupo y nunca al público", () => {
        const alcance: Alcance = { tipo: "grupo", id: "g1", visibilidad: "privada" };
        const o = ofertaDesdeAsignaciones(inventario(), asignar(estadoVacio(), asigModelo(alcance)), CTX);
        expect(o.presta.grupos).toContain("g1");
        expect(o.presta.publico).toBe(false);
        expect(o.presta.cuenta).toBe(true);
    });

    it("comunidad: pública sale al público, privada no (§3)", () => {
        const inv = inventario();
        const publica: Alcance = { tipo: "comunidad", id: "c1", visibilidad: "publica" };
        const privada: Alcance = { tipo: "comunidad", id: "c2", visibilidad: "privada" };
        expect(ofertaDesdeAsignaciones(inv, asignar(estadoVacio(), asigModelo(publica)), CTX).presta.publico).toBe(true);
        expect(ofertaDesdeAsignaciones(inv, asignar(estadoVacio(), asigModelo(privada)), CTX).presta.publico).toBe(false);
    });

    it("la oferta funciona en la bolsa: visible para la propia cuenta, préstame real", () => {
        const estado = fijarTopologia(estadoVacio(), {
            topologia: "servidor-propio",
            servidorNeuronaId: "n1",
            vias: ["local"],
            alcance: PERFIL,
        });
        const o = ofertaDesdeAsignaciones(inventario(), estado, CTX);
        expect(ofertaVisiblePara(o, { cuentaId: "u1", grupos: [] })).not.toBeNull();
        expect(ofertaVisiblePara(o, { cuentaId: "otro", grupos: [] })).toBeNull();
        expect(capacidadPrestable(o).computo.nucleos).toBeGreaterThan(0);
        expect(capacidadPrestable(o).almacen.prestaMb).toBe(30 * 1024);
    });
});

function asigModelo(alcance: Alcance): Asignacion {
    return {
        elemento: { tipo: "modelo", id: "modelo-demo", nombre: "demo" },
        almacenEn: "n1:interno",
        procesaEn: "n1:cpu",
        alcance,
        t: 1,
    };
}
