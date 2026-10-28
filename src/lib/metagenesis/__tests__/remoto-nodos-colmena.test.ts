/**
 * Pruebas de COL1012B: órdenes «desconectar»/«contenedor» y campos nuevos del latido (`en_curso`,
 * `contenedor`) en el módulo puro de la pantalla. Mismas reglas que el nodo Python (COL1012A).
 * Contrato: architecture/colmena-relevo-contenedores.md §3.
 */
import { describe, it, expect } from "vitest";
import { hardwareDesdeNodo } from "@/lib/cerebros/procesos";
import { botonesDeNodo, lineaDeNodo } from "@/lib/metagenesis/colmena-tarjeta";
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
});

describe("validarArgs: órdenes de la colmena", () => {
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

    it("contenedor con activo false rechaza trabajadores (fuera de rango cae primero en 1–4)", () => {
        expect(validarArgs("contenedor", { activo: false })).toBeNull();
        expect(validarArgs("contenedor", { activo: false, trabajadores: 1 })).toBe("trabajadores solo se permite si activo es True");
        expect(validarArgs("contenedor", { activo: false, trabajadores: 0 })).toBe("trabajadores fuera de 1–4");
        expect(validarArgs("contenedor", { activo: false, trabajadores: 2 })).toContain("trabajadores solo se permite");
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

describe("latido tal como lo publica el nodo Python: la colmena va DENTRO de `salud`", () => {
    const latido = (datos: Record<string, unknown>): FilaBus => ({ id: 1, t: new Date(AHORA - 60_000).toISOString(), tipo: "mg_latido", datos });
    const salud = {
        ram_libre_mb: 4000,
        ram_total_mb: 8192,
        nucleos: 8,
        carga: 1.5,
        disco_gb: 100,
        en_curso: [{ id: "col1012d", fase: "escribiendo", punto: { rama: "ola/col1012d", sha: "abc123", t: (AHORA - 5 * 60_000) / 1000 } }],
        contenedor: { activo: false, agentes: 3, apto: true, motivo: "3 agente(s) por la memoria y los núcleos." },
        desconectando: false,
        relevo: false,
    };

    it("lee en_curso, contenedor y la capacidad de `salud` (si no, la tarjeta no vería nada de un nodo real)", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", medio: "oracle-a1", ts: (AHORA - 60_000) / 1000, salud })], AHORA);
        const n = e.nodos[0];
        expect(n.enCurso.map((t) => t.id)).toEqual(["col1012d"]);
        expect(n.contenedor).toEqual({ activo: false, agentes: 3, apto: true, motivo: "3 agente(s) por la memoria y los núcleos." });
        expect(n).toMatchObject({ ram_total_mb: 8192, nucleos: 8, carga: 1.5, desconectando: false, relevo: false, informaTrabajo: true });
    });

    it("de ese latido salen la línea y los botones de la tarjeta, con el último punto en segundos", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", medio: "oracle-a1", ts: (AHORA - 60_000) / 1000, salud })], AHORA);
        const n = e.nodos[0];
        expect(lineaDeNodo(n, AHORA)).toEqual(["3 agentes · puede ser contenedor", "1 tarea en curso · Último punto de control hace 5 min"]);
        const b = botonesDeNodo(n, [], AHORA);
        expect(b.desconectar).toMatchObject({ visible: true, habilitado: false });
        expect(b.contenedor).toMatchObject({ visible: true, habilitado: false, etiqueta: "Usar como contenedor (3 agentes)" });
        const e2 = resumirBus([latido({ nodo: "nodo-a1", medio: "oracle-a1", ts: (AHORA - 60_000) / 1000, salud: { ...salud, relevo: true } })], AHORA);
        const b2 = botonesDeNodo(e2.nodos[0], [], AHORA);
        expect(b2.desconectar).toMatchObject({ habilitado: true, confirmar: true });
        expect(b2.contenedor).toMatchObject({ habilitado: true, etiqueta: "Usar como contenedor (3 agentes)" });
    });

    it("la raíz del latido manda sobre `salud` (el contrato también la describe así)", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", ts: AHORA / 1000, en_curso: [], salud })], AHORA);
        expect(e.nodos[0].enCurso).toEqual([]);
    });

    it("`en_curso` publicado como null (la medida falló) no se confunde con «sin trabajo»", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", ts: AHORA / 1000, salud: { ...salud, en_curso: null, contenedor: null } })], AHORA);
        expect(e.nodos[0]).toMatchObject({ enCurso: [], contenedor: null, informaTrabajo: false });
        expect(botonesDeNodo(e.nodos[0], [], AHORA).desconectar.habilitado).toBe(false);
    });

    it("un latido sin la colmena (nodo viejo) no inventa nada", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", ts: AHORA / 1000, salud: { disco_gb: 10 } })], AHORA);
        expect(e.nodos[0]).toMatchObject({ enCurso: [], contenedor: null, informaTrabajo: false, relevo: false, desconectando: false });
    });

    it("Cerebros › Procesos recibe por fin la RAM total, los núcleos y la carga de cada nodo", () => {
        const e = resumirBus([latido({ nodo: "nodo-a1", medio: "oracle-a1", ts: AHORA / 1000, salud })], AHORA);
        const h = hardwareDesdeNodo(e.nodos[0], AHORA);
        expect(h).toMatchObject({ id: "nodo-a1", ramTotalMb: 8192, ramUsadaMb: 8192 - 4000, nucleos: 8, carga: 1.5 });
    });
});
