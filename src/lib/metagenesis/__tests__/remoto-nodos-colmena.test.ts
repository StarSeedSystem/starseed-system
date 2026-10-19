/**
 * Pruebas de COL1012B: órdenes «desconectar»/«contenedor» y campos nuevos del latido (`en_curso`,
 * `contenedor`) en el módulo puro de la pantalla. Mismas reglas que el nodo Python (COL1012A).
 * Contrato: architecture/colmena-relevo-contenedores.md §3.
 */
import { describe, it, expect } from "vitest";
import {
    ACCIONES,
    ACCIONES_DEL_LIDER,
    esDestinoPara,
    resumirBus,
    validarArgs,
    type FilaBus,
} from "@/lib/metagenesis/remoto-nodos";

const AHORA = 1_800_000_000_000;

describe("acciones colmena: desconectar y contenedor", () => {
    it("están en ACCIONES con etiqueta, y desconectar pide confirmación", () => {
        expect(ACCIONES.desconectar.etiqueta).toBe("Desconectar");
        expect(ACCIONES.desconectar.confirmar).toBe(true);
        expect(ACCIONES.desconectar.args).toEqual([]);
        expect(ACCIONES.contenedor.etiqueta).toBe("Usar como contenedor");
        expect(ACCIONES.contenedor.args).toEqual(["activo", "trabajadores"]);
    });

    it("ACCIONES_DEL_LIDER no las incluye (van en la tarjeta de cada neurona)", () => {
        expect(ACCIONES_DEL_LIDER).not.toHaveProperty("desconectar");
        expect(ACCIONES_DEL_LIDER).not.toHaveProperty("contenedor");
        expect(ACCIONES_DEL_LIDER).toHaveProperty("continuar");
        expect(Object.keys(ACCIONES_DEL_LIDER).length).toBe(Object.keys(ACCIONES).length - 2);
    });

    it("desconectar no quiere argumentos", () => {
        expect(validarArgs("desconectar", {})).toBeNull();
        expect(validarArgs("desconectar", { motivo: "x" })).toContain("argumento no admitido");
    });

    it("contenedor exige activo booleano", () => {
        expect(validarArgs("contenedor", {})).toBe("falta argumento: activo");
        expect(validarArgs("contenedor", { activo: "si" })).toBe("activo debe ser booleano");
        expect(validarArgs("contenedor", { activo: 1 })).toBe("activo debe ser booleano");
    });

    it("contenedor con activo true exige trabajadores 1–4", () => {
        expect(validarArgs("contenedor", { activo: true })).toBe("falta argumento: trabajadores");
        expect(validarArgs("contenedor", { activo: true, trabajadores: 0 })).toBe("trabajadores fuera de 1–4");
        expect(validarArgs("contenedor", { activo: true, trabajadores: 5 })).toBe("trabajadores fuera de 1–4");
        expect(validarArgs("contenedor", { activo: true, trabajadores: 2 })).toBeNull();
    });

    it("contenedor con activo false rechaza trabajadores", () => {
        expect(validarArgs("contenedor", { activo: false })).toBeNull();
        expect(validarArgs("contenedor", { activo: false, trabajadores: 2 })).toContain("trabajadores solo se permite");
    });
    it("contenedor con activo false rechaza trabajadores", () => {
        expect(validarArgs("contenedor", { activo: false, trabajadores: 1 })).toBe("trabajadores fuera de 1–4");
        expect(validarArgs("contenedor", { activo: false, trabajadores: 0 })).toBeNull();
    });
});

describe("esDestinoPara: desconectar/contenedor solo a un id de nodo", () => {
    it("rechaza lider, todos y medios genéricos", () => {
        for (const malo of ["lider", "todos", "mac", "oracle-a1", "neurona", "nube-cowork", "gh-actions"]) {
            expect(esDestinoPara("desconectar", malo)).toBe(false);
            expect(esDestinoPara("contenedor", malo)).toBe(false);
        }
    });

    it("acepta un id de nodo concreto; el resto de acciones siguen yendo al líder", () => {
        expect(esDestinoPara("desconectar", "nodo-a1")).toBe(true);
        expect(esDestinoPara("contenedor", "nodo-a1")).toBe(true);
        expect(esDestinoPara("continuar", "lider")).toBe(true);
        expect(esDestinoPara("continuar", "todos")).toBe(true);
        expect(esDestinoPara("continuar", "no un id!!")).toBe(false);
    });
});

describe("latido: en_curso y contenedor (§3)", () => {
    const latido = (datos: Record<string, unknown>): FilaBus => ({ id: 1, t: new Date(AHORA - 60_000).toISOString(), tipo: "mg_latido", datos });

    it("lee en_curso y contenedor tal como los publica el nodo", () => {
        const e = resumirBus(
            [
                latido({
                    nodo: "nodo-a1",
                    medio: "oracle-a1",
                    ts: (AHORA - 60_000) / 1000,
                    en_curso: [
                        { id: "col1012d", fase: "escritura", punto: { rama: "relevo/nodo-a1/col1012d", sha: "abc123", t: 123 } },
                        { id: "col1012e", fase: "tests", punto: null },
                    ],
                    contenedor: { activo: true, trabajadores: 2, apto: true, motivo: "" },
                }),
            ],
            AHORA,
        );
        const n = e.nodos[0];
        expect(n.enCurso).toHaveLength(2);
        expect(n.enCurso[0]).toEqual({ id: "col1012d", fase: "escritura", punto: { rama: "relevo/nodo-a1/col1012d", sha: "abc123", t: 123 } });
        expect(n.enCurso[1].punto).toBeNull();
        expect(n.contenedor).toEqual({ activo: true, agentes: 2, apto: true, motivo: "" });
    });

    it("valores por defecto seguros si el latido no los trae o vienen mal", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", ts: (AHORA - 60_000) / 1000 })], AHORA);
        expect(e.nodos[0].enCurso).toEqual([]);
        expect(e.nodos[0].contenedor).toBeNull();
        const raro = resumirBus(
            [latido({ nodo: "nodo-a1", ts: AHORA / 1000, en_curso: "nada", contenedor: { activo: true } })],
            AHORA,
        );
        expect(raro.nodos[0].enCurso).toEqual([]);
        expect(raro.nodos[0].contenedor).toEqual({ activo: true, agentes: 0, apto: false, motivo: "" });
    });

    it("recorta en_curso a 8 y descarta entradas sin id", () => {
        const largas = Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, fase: "escritura", punto: null }));
        largas.push({ id: "", fase: "x", punto: null });
        const e = resumirBus([latido({ nodo: "nodo-a1", ts: AHORA / 1000, en_curso: largas })], AHORA);
        expect(e.nodos[0].enCurso).toHaveLength(8);
        expect(e.nodos[0].enCurso.every((t) => t.id.length > 0)).toBe(true);
    });
});
