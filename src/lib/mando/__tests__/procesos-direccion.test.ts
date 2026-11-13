/**
 * (MED1113A) Procesos de la dirección: la lectura, la vida medida, «Qué corre ahora» y que la pastilla, la
 * ventana y «Comprobar ahora» digan el MISMO número de agentes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sanearEnMarcha, vistaEnMarcha, type EnMarcha } from "../en-marcha";
import { cifraDePastilla, detalleDeMedidor, type DatosMedidores } from "../medidores";
import {
    agentesDeDireccion,
    estadoAhora,
    leerEstadoDireccion,
    VIDA_DIRECCION_MIN,
    vistaDireccion,
    type LecturaDireccion,
} from "../procesos-direccion";

const AHORA = Date.parse("2026-11-13T05:00:00Z");
const hace = (min: number) => AHORA - min * 60_000;
const PUENTE = path.resolve(__dirname, "../../../../scripts/puente");

function proceso(id: string, estado: string, senalMin: number | null, extra: Record<string, unknown> = {}) {
    return {
        id,
        titulo: `Trabajo de ${id}`,
        modelo: "claude-opus-5-5",
        tipo: "agente",
        donde: `~/Documents/starseed-opus/OPUS1106-${id}`,
        rama: `opus1106/${id}`,
        fase: null,
        desdeMs: hace(120),
        estado,
        senal: senalMin === null ? null : "cambios en su árbol",
        ultimaSenalMs: senalMin === null ? null : hace(senalMin),
        cerradoMs: null,
        porque: "cambios en su árbol",
        relevable: false,
        ...extra,
    };
}

const LECTURA: LecturaDireccion = leerEstadoDireccion({
    generadoMs: AHORA,
    procesos: [
        proceso("GEN1113A", "activo", 3),
        proceso("LLA1113B", "activo", 12, { fase: "esperando la puerta" }),
        proceso("FIX1112G", "en-silencio", 294),
        proceso("GEN1113F", "terminado", null, { cerradoMs: hace(50), porque: "marcador .listo" }),
    ],
}) as LecturaDireccion;

describe("lectura de procesos_direccion.py", () => {
    it("pasa la lista blanca: sin rutas absolutas, ids con forma de id y estados conocidos", () => {
        const l = leerEstadoDireccion({
            generadoMs: AHORA,
            procesos: [
                proceso("OK1", "activo", 1, { titulo: "lee /Users/alex/secreto.txt", donde: "/Users/alex/Documents/x" }),
                proceso("../malo", "activo", 1),
                proceso("RARO", "inventado", 1),
            ],
        });
        expect(l?.procesos.map((p) => p.id)).toEqual(["OK1"]);
        expect(l?.procesos[0].titulo).toBe("lee [ruta]");
        expect(l?.procesos[0].donde).toBe("sin árbol declarado");
        expect(leerEstadoDireccion({ procesos: "no" })).toBeNull();
    });

    it("usa el mismo umbral de vida que el script de Python", () => {
        const py = readFileSync(path.join(PUENTE, "procesos_direccion.py"), "utf8");
        expect(Number(/^VIDA_MIN = (\d+)/m.exec(py)?.[1])).toBe(VIDA_DIRECCION_MIN);
    });

    it("recalcula la vida a la hora de mirar: una lectura vieja no deja a nadie «activo» de más", () => {
        const p = LECTURA.procesos[0];
        expect(estadoAhora(p, AHORA).estado).toBe("activo");
        const luego = estadoAhora(p, AHORA + 40 * 60_000);
        expect(luego).toEqual({ estado: "en-silencio", silencioDesdeMs: hace(3) });
        expect(estadoAhora(LECTURA.procesos[3], AHORA + 99 * 60_000).estado).toBe("terminado");
    });
});

describe("vista de la dirección", () => {
    it("separa activos, en silencio (con su hora) y terminados", () => {
        const v = vistaDireccion(LECTURA, AHORA);
        expect(v.activos.map((p) => p.id)).toEqual(["GEN1113A", "LLA1113B"]);
        expect(v.enSilencio.map((p) => p.id)).toEqual(["FIX1112G"]);
        expect(v.enSilencio[0].linea).toMatch(/^en silencio desde las \d\d:\d\d \(hace 294 min; última señal: cambios en su árbol\) · no cuenta como activo$/);
        expect(v.terminados[0].linea).toMatch(/^terminado a las \d\d:\d\d \(marcador \.listo\)$/);
        expect(v.texto).toBe("2 activos · 1 en silencio · 1 terminado hace poco (activo = señal en los últimos 30 min)");
    });

    it("sin lectura lo dice; vacía dice qué terminó último", () => {
        expect(vistaDireccion(null, AHORA).estado).toBe("sin-datos");
        const solo = leerEstadoDireccion({ generadoMs: AHORA, procesos: [LECTURA.procesos[3]] });
        expect(vistaDireccion(solo, AHORA).texto).toMatch(/^ningún proceso de la dirección abierto · el último en terminar fue GEN1113F a las \d\d:\d\d$/);
    });

    it("solo los activos son latidos para los medidores, con su señal y su árbol", () => {
        const a = agentesDeDireccion(LECTURA, AHORA);
        expect(a.map((x) => x.tarea)).toEqual(["GEN1113A", "LLA1113B"]);
        expect(a[1]).toMatchObject({ donde: "direccion", fase: "esperando la puerta", minutos: 120, quietoSegundos: 720, senal: "cambios en su árbol" });
    });
});

describe("Qué corre ahora con la dirección", () => {
    const EN: EnMarcha = { generadoMs: AHORA, carril: null, puerta: null, publicacion: null, direccion: LECTURA };

    it("los cuenta como vivos y nombra a los callados", () => {
        const v = vistaEnMarcha(EN, AHORA);
        expect(v.vivos).toBe(2);
        expect(v.frase).toBe("Corre ahora: 2 agentes de la dirección. Ojo: 1 de la dirección en silencio (FIX1112G).");
    });

    it("dice cuándo no se pudo medir (null) y no lo confunde con «nada»", () => {
        expect(vistaEnMarcha({ ...EN, direccion: null }, AHORA).frase).toContain("no se pudo medir los procesos de la dirección");
        expect(vistaEnMarcha({ ...EN, direccion: undefined }, AHORA).frase).not.toContain("no se pudo medir");
    });

    it("viaja a otra neurona por la lista blanca", () => {
        const s = sanearEnMarcha(JSON.parse(JSON.stringify(EN)));
        expect(s?.direccion?.procesos.map((p) => p.id)).toEqual(["GEN1113A", "LLA1113B", "FIX1112G", "GEN1113F"]);
    });
});

describe("pastilla, ventana y comprobación: el mismo número", () => {
    const enMarcha: EnMarcha = { generadoMs: AHORA, carril: null, puerta: null, publicacion: null, direccion: LECTURA };
    const datos: Partial<DatosMedidores> = {
        progreso: { RANCIA1: { estado: "en_curso", t: "2026-11-12 20:00" } } as DatosMedidores["progreso"],
        titulos: {},
        latidos: [
            { tarea: "PET1", fase: "escribiendo", modelo: "nvidia/glm", minutos: 4, donde: "mac", quietoSegundos: 5, cola: "cola-auto-1" },
            ...agentesDeDireccion(LECTURA, AHORA),
        ],
        escritores: { PET1: { pid: 123 } } as unknown as DatosMedidores["escritores"],
        enMarcha,
    };

    it("«Agentes»: cuenta = filas = «N en total», y los callados van en el aviso", () => {
        const d = detalleDeMedidor("agentes", datos, AHORA);
        expect(d.filas.map((f) => f.id.split(" · ")[0])).toEqual(["PET1", "GEN1113A", "LLA1113B"]);
        expect(cifraDePastilla(d)).toBe(3);
        expect(d.cuenta).toBe(d.filas.length);
        expect(d.resumen).toMatch(/^3 en total · 1 escribiendo · 2 de la dirección/);
        expect(d.filas[1]).toMatchObject({ estado: "trabajando", quien: "claude-opus-5-5 · dirección" });
        expect(d.filas[1].porque).toContain("no se entrega al enjambre");
        expect(d.aviso).toContain("Dirección: 1 en silencio");
        expect(d.aviso).toContain("FIX1112G");
    });

    it("«En curso»: la pastilla cuenta lo que alguien hace; la rancia va en la ventana pero no en la cifra", () => {
        const d = detalleDeMedidor("en-curso", datos, AHORA);
        expect(d.filas.map((f) => f.id)).toEqual(["RANCIA1", "PET1", "GEN1113A", "LLA1113B"]);
        expect(cifraDePastilla(d)).toBe(3);
        expect(d.resumen).toMatch(/^3 en marcha · 3 agente\(s\) sobre ellas/);
    });

    it("«Comprobar ahora» lee la misma cifra y las mismas filas de la dirección", () => {
        const d = detalleDeMedidor("agentes", datos, AHORA);
        const programa = [
            "import json,sys",
            `sys.path.insert(0, ${JSON.stringify(PUENTE)})`,
            "import comprobar_medidor as C",
            "d=json.load(sys.stdin)",
            "h={'procesos':{'opencode':[1],'codex':[],'escritores_por_tarea':{'PET1':1}},'agentes_nube':0,'fases':{},'direccion':['GEN1113A','LLA1113B']}",
            "a=C.analizar_agentes('agentes',d,h)",
            "v=C.cotejar_agentes('agentes',d,h)[0]",
            "print(json.dumps({'dice':C.agentes_que_dice('agentes',d),'direccion':a['direccion'],'estado':v['estado']}))",
        ].join("\n");
        const salida = JSON.parse(execFileSync("python3", ["-c", programa], { input: JSON.stringify(d), encoding: "utf8" }));
        expect(salida).toEqual({ dice: cifraDePastilla(d), direccion: ["GEN1113A", "LLA1113B"], estado: "vivo" });
    });

    it("«Ola activa» vacía no dice «nada trabaja» si la dirección tiene agentes", () => {
        const d = detalleDeMedidor("ola-activa", datos, AHORA);
        expect(d.vacio).toContain("La dirección tiene 2 agentes activos fuera de las olas");
    });
});
