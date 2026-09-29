/**
 * Sueños profundos en el Mando (2026-09-29): la derivación de estados tiene que coincidir con
 * `scripts/puente/suenos.py estado`, las lentes y áreas no pueden separarse de las del
 * analista y del planificador, y el resto del Mando tiene que tratar `informe` como un cierre
 * que NO es «sin cambios».
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    AREAS_EXTRA_SUENOS,
    LENTES_SUENOS,
    areasSuenos,
    consolidadoDe,
    estadoDeSueno,
    filasDeSesion,
    leerVeredictos,
    validarLanzamiento,
} from "@/lib/mando/suenos-tipos";
import { leerSesion, sinRutas } from "@/lib/mando/suenos";
import { accionesDeTarea, verificacionDe } from "@/lib/mando/medidores";
import { clasificarAgente } from "@/lib/mando/director-datos";
import { tonoNodoTarea } from "@/lib/mando/grafo-disposicion";
import { tareasDeCola } from "@/lib/mando/lector-local";

const RAIZ_REPO = path.resolve(__dirname, "../../../..");

describe("las lentes y las áreas no se separan de Python", () => {
    it("LENTES_SUENOS son las de scripts/enjambre/analista.py, en el mismo orden", () => {
        const py = readFileSync(path.join(RAIZ_REPO, "scripts/enjambre/analista.py"), "utf-8");
        const bloque = py.slice(py.indexOf("LENTES = ["), py.indexOf("IDS_LENTES"));
        const ids = [...bloque.matchAll(/"id": "([a-z-]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(LENTES_SUENOS.map((l) => l.id));
    });

    it("AREAS_EXTRA_SUENOS son las de scripts/puente/suenos_areas.py", () => {
        const py = readFileSync(path.join(RAIZ_REPO, "scripts/puente/suenos_areas.py"), "utf-8");
        const bloque = py.slice(py.indexOf("AREAS_EXTRA = ["), py.indexOf("IDS_EXTRA"));
        const ids = [...bloque.matchAll(/"id": "([a-z-]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(AREAS_EXTRA_SUENOS.map((a) => a.id));
        expect(areasSuenos().map((a) => a.id)).toEqual(expect.arrayContaining(["rito", "memoria", "mando", "gobernanza"]));
    });
});

describe("estados de un sueño", () => {
    it("el veredicto manda; luego el informe; luego el latido; luego el progreso", () => {
        expect(estadoDeSueno({ veredicto: "ajustado", hayInforme: true, orquestadorVivo: false })).toBe("ajustado");
        expect(estadoDeSueno({ hayInforme: true, faseLatido: "analizando", orquestadorVivo: true })).toBe("informe");
        expect(estadoDeSueno({ hayInforme: false, faseLatido: "analizando", orquestadorVivo: true })).toBe("analizando");
        expect(estadoDeSueno({ hayInforme: false, estadoProgreso: "fallo", orquestadorVivo: true })).toBe("fallo");
        expect(estadoDeSueno({ hayInforme: false, estadoProgreso: "en_curso", orquestadorVivo: false })).toBe("interrumpida");
        expect(estadoDeSueno({ hayInforme: false, orquestadorVivo: false })).toBe("pendiente");
    });

    it("veredictos: el último de cada tarea, sin líneas rotas ni estados inventados", () => {
        const v = leerVeredictos([
            JSON.stringify({ tarea: "SA1", estado: "verificado", por: "claude-opus-5.5" }),
            "roto{",
            JSON.stringify({ tarea: "SA1", estado: "ajustado", por: "claude-sonnet" }),
            JSON.stringify({ tarea: "SA2", estado: "inventado" }),
        ].join("\n"));
        expect(v.get("SA1")).toMatchObject({ estado: "ajustado", por: "claude-sonnet" });
        expect(v.has("SA2")).toBe(false);
    });

    it("filas: tokens del informe o del latido, privado por lente y solo tareas de análisis", () => {
        const filas = filasDeSesion({
            tareas: [
                { id: "SA1", tipo: "analisis", area: "voz", lente: "arquitectura-deuda" },
                { id: "SA2", tipo: "analisis", area: "voz", lente: "seguridad-privacidad" },
                { id: "SA3", tipo: "analisis", area: "voz", lente: "pruebas-fiabilidad" },
                { id: "p400A", titulo: "código" },
            ],
            informes: { SA1: { id: "SA1", hallazgos: [{}, {}], segundos: 600, modelos: { sintesis: "nim/moonshotai/kimi-k3" }, tokens: { entrada: 900, salida: 100, llamadas: 3 } } },
            veredictos: new Map(),
            progreso: { SA3: { estado: "fallo", nota: "sin proveedores" } },
            latidos: { SA2: { fase: "analizando", modelo: "llm7/gpt-oss", subfase: "lectura 2/9", desde: 1000, tokens: { entrada: 40, salida: 5, llamadas: 1 } } },
            orquestadorVivo: true,
            ahoraMs: 1_120_000,
        });
        expect(filas.map((f) => f.id)).toEqual(["SA1", "SA2", "SA3"]);
        expect(filas[0]).toMatchObject({ estado: "informe", proveedor: "nim", tokens: 1000, hallazgos: 2, segundos: 600 });
        expect(filas[1]).toMatchObject({ estado: "analizando", privado: true, tokens: 45, subfase: "lectura 2/9", segundos: 120 });
        expect(filas[2]).toMatchObject({ estado: "fallo", nota: "sin proveedores" });
    });
});

describe("consolidado y lanzamiento", () => {
    it("consolidadoDe tolera campos que faltan y quita barras iniciales de las rutas", () => {
        const c = consolidadoDe({ resumen: "r", top: [{ titulo: "Uno", archivo: "/abs/x.ts", ya_encargada: true, accionable: false, jev: "baja · 0.10 (local) · VETO" }, {}] });
        expect(c?.top).toHaveLength(2);
        expect(c?.top[0]).toMatchObject({ titulo: "Uno", archivo: "abs/x.ts", yaEncargada: true, verificacion: "sin_verificar", apariciones: 1, accionable: false, jev: "baja · 0.10 (local) · VETO" });
        expect(c?.top[1].accionable).toBe(true);
        expect(consolidadoDe({})).toBeNull();
    });

    it("validarLanzamiento: horas 0-12 y solo áreas/lentes conocidas", () => {
        expect(validarLanzamiento({ horas: 3.3, areas: ["voz"], lentes: ["coherencia-triada"] })).toEqual({ ok: true, valor: { horas: 3.25, areas: ["voz"], lentes: ["coherencia-triada"] } });
        expect(validarLanzamiento({ horas: 13 }).ok).toBe(false);
        expect(validarLanzamiento({ areas: ["marte"] }).ok).toBe(false);
        expect(validarLanzamiento({ lentes: ["x"] }).ok).toBe(false);
        expect(validarLanzamiento({})).toEqual({ ok: true, valor: { horas: 0, areas: [], lentes: [] } });
    });

    it("sinRutas no deja ni la raíz del repo ni la carpeta personal", () => {
        expect(sinRutas("instala /Users/alex/.local/bin/x en /Users/alex/Documents/os/scripts", "/Users/alex/Documents/os", "/Users/alex"))
            .toBe("instala ~/.local/bin/x en ./scripts");
    });
});

describe("el resto del Mando conoce `informe`", () => {
    it("verificación, acciones, agentes, grafo y colas", () => {
        const v = verificacionDe({ estado: "informe" } as never);
        expect(v.aviso).toBe(false);
        expect(v.texto).toContain("informe escrito");
        expect(accionesDeTarea("informe")).toEqual([]);
        expect(clasificarAgente({ fase: "analizando", avance: 0 }, 10_000)).toBe("analizando");
        expect(tonoNodoTarea("informe")).not.toBe(tonoNodoTarea("sin_cambios"));
        expect(tareasDeCola([{ id: "SA1", tipo: "analisis", titulo: "t" }], "cola-suenos-2026-09-29.json")[0].tipo).toBe("analisis");
    });
});

describe("leerSesion sobre una carpeta de verdad", () => {
    let raiz = "";
    const previa = process.env.STARSEED_ROOT;
    beforeAll(() => {
        raiz = mkdtempSync(path.join(tmpdir(), "suenos-mando-"));
        const dir = path.join(raiz, "starseed_memory_root", "dream", "profundo", "2026-09-29");
        mkdirSync(dir, { recursive: true });
        mkdirSync(path.join(raiz, "starseed_memory_root", "olas"), { recursive: true });
        writeFileSync(path.join(dir, "plan.json"), JSON.stringify({
            tareas: [
                { id: "SA1", tipo: "analisis", area: "voz", lente: "arquitectura-deuda" },
                { id: "SA2", tipo: "analisis", area: "voz", lente: "coherencia-triada" },
            ],
            lanzamientos: [{ t: "2026-09-29 10:00:00", horas: 3, por: "mando" }],
        }));
        writeFileSync(path.join(dir, "voz--arquitectura-deuda.json"), JSON.stringify({ id: "SA1", hallazgos: [{ titulo: "x" }] }));
        writeFileSync(path.join(dir, "verificaciones.jsonl"), JSON.stringify({ tarea: "SA1", estado: "verificado", por: "claude-opus-5.5" }) + "\n");
        writeFileSync(path.join(dir, "INFORME.md"), "# INFORME\n");
        writeFileSync(path.join(dir, "consolidado.json"), JSON.stringify({ resumen: "hecho", top: [{ titulo: "Uno", privado: true }] }));
        writeFileSync(path.join(raiz, "starseed_memory_root", "olas", "cola-suenos-propuesta-2026-09-29.json"), JSON.stringify([{ id: "SP1" }, { id: "SP2" }]));
        process.env.STARSEED_ROOT = raiz;
    });
    afterAll(() => {
        if (previa === undefined) delete process.env.STARSEED_ROOT;
        else process.env.STARSEED_ROOT = previa;
        rmSync(raiz, { recursive: true, force: true });
    });

    it("lee rejilla, veredictos, consolidado y propuesta sin rutas absolutas", async () => {
        const s = await leerSesion(undefined, true);
        expect(s?.sesion).toBe("2026-09-29");
        expect(s?.filas.map((f) => [f.id, f.estado, f.por])).toEqual([["SA1", "verificado", "claude-opus-5.5"], ["SA2", "pendiente", ""]]);
        expect(s?.propuesta).toEqual({ nombre: "suenos-propuesta-2026-09-29", tareas: 2 });
        expect(s?.consolidado?.top[0].privado).toBe(true);
        expect(s?.informeMd).toBe("# INFORME\n");
        expect(s?.ultimoLanzamiento).toEqual({ t: "2026-09-29 10:00:00", horas: 3, por: "mando" });
        expect(JSON.stringify(s)).not.toContain(raiz);
    });

    it("una fecha que no existe no rompe", async () => {
        const s = await leerSesion("2020-01-01");
        expect(s?.total).toBe(0);
    });
});
