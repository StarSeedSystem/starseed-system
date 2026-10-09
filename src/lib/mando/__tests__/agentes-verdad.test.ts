import { describe, expect, it } from "vitest";

import { escritoresDePs, unLatidoPorTarea } from "../lector-local";
import { detalleDeMedidor } from "../medidores";

// (2026-10-09) Alex: «basta de ilusiones». Lo que Genesis dice de un agente se contrasta con
// el proceso real, y lo que dice de un fallo, con quién lo está arreglando.
describe("escritoresDePs: quién escribe de verdad", () => {
    const ps = [
        "14675   13:11 /Users/alex/.opencode/bin/opencode run RAIZ DEL REPOSITORIO: `/Users/alex/Documents/starseed-wt/CAMR1005Dc`. Usa grep y cat con catálogo",
        "32563   07:49 /Users/alex/.opencode/bin/opencode /Users/alex/.local/share/opencode/bin/vscode-eslint/server/out/eslintServer.js --stdio",
        "39380 1-02:03:04 /usr/local/bin/codex exec --cd /Users/alex/Documents/starseed-wt/PT1009Cb arregla",
        "70038   25:07 /opt/homebrew/bin/python3 -u /Users/alex/.local/bin/starseed-enjambre.py cola-auto-1.json",
        "  501 00:02 grep opencode run starseed-wt/FALSO",
    ].join("\n");

    it("cuenta `opencode run` aunque el prompt diga «grep» o «cat», y lo ata a su tarea", () => {
        const e = escritoresDePs(ps);
        expect(e.CAMR1005Dc).toEqual({ pid: 14675, minutos: 13 });
    });

    it("el ayudante eslint de opencode, el orquestador y un grep NO son escritores", () => {
        expect(Object.keys(escritoresDePs(ps)).sort()).toEqual(["CAMR1005Dc", "PT1009Cb"]);
    });

    it("lee etime con días", () => {
        expect(escritoresDePs(ps).PT1009Cb.minutos).toBe(26 * 60 + 3);
    });
});

describe("un latido por tarea", () => {
    it("manda el que avanzó más tarde", () => {
        const l = unLatidoPorTarea([
            { tarea: "A", quietoSegundos: 600, cola: "vieja" },
            { tarea: "A", quietoSegundos: 20, cola: "viva" },
            { tarea: "B", quietoSegundos: 5, cola: "x" },
        ]);
        expect(l).toHaveLength(2);
        expect(l.find((x) => x.tarea === "A")?.cola).toBe("viva");
    });
});

describe("medidor «fallidas»: lo que falló y nadie ha resuelto", () => {
    const ahora = Date.parse("2026-10-08T18:00:00");
    const progreso = {
        PT1009Cb: { estado: "fallo_tsc", nota: "director: reintento gratuito 2/8", t: "2026-10-08 17:38:15" },
        CAMR1005Db: { estado: "fallo_tsc", nota: "2 errores tsc", t: "2026-10-08 16:39:06" },
        CAMR1005Dc: { estado: "pendiente", t: "2026-10-08 17:32:21" },
        X1: { estado: "fallo_tests", t: "2026-10-08 10:00:00" },
        X1b: { estado: "commit", t: "2026-10-08 11:00:00" },
        VIEJA: { estado: "fallo", t: "2026-09-20 10:00:00" },
        ENMAIN: { estado: "fallo_tsc", t: "2026-10-08 12:00:00" },
    };
    const d = detalleDeMedidor("fallidas", { progreso, asuntosDeMain: "Ola 1 · ENMAIN: hecho a mano" }, ahora);

    it("cuenta las recientes sin resolver, no las ya integradas por una sucesora, ni las viejas, ni las de main", () => {
        expect(d.filas.map((f) => f.id).sort()).toEqual(["CAMR1005Db", "PT1009Cb"]);
    });

    it("dice quién la retoma", () => {
        expect(d.filas.find((f) => f.id === "CAMR1005Db")?.porque).toBe("la rehace CAMR1005Dc (pendiente)");
        expect(d.filas.find((f) => f.id === "PT1009Cb")?.porque).toContain("intento 2 de 8");
        expect(d.resumen).toBe("2 sin resolver en 3 días · 2 ya con reparación en marcha");
    });

    it("lee lo que el director ya decidió aunque el vigilante no lo haya aplicado (2026-10-09)", () => {
        const p = {
            CAMR1005F: { estado: "commit", t: "2026-10-08 17:45:04" },
            CAMR1005Fb: { estado: "fallo_tsc", nota: "2 errores tsc", t: "2026-10-08 17:18:24" },
            CPA1007Kb: { estado: "fallo_tests", nota: "vitest falla", t: "2026-10-08 17:47:29" },
            OTRA: { estado: "fallo_tsc", nota: "3 errores tsc", t: "2026-10-08 17:00:00" },
        };
        const correcciones = {
            CAMR1005Fb: { estado: "sustituida", nota: "superada: el mismo encargo entró en main con CAMR1005F" },
            CPA1007Kb: { estado: "pendiente", nota: "director: escalada a Codex (suscripción, sin créditos) 1/2 tras 8 intentos gratuitos" },
            OTRA: { estado: "bloqueante", nota: "director: escalada agotada tras 10 intentos: requiere una persona" },
        };
        const r = detalleDeMedidor("fallidas", { progreso: p, correcciones }, ahora);
        expect(r.filas.map((f) => f.id).sort()).toEqual(["CPA1007Kb", "OTRA"]);
        expect(r.filas.find((f) => f.id === "CPA1007Kb")?.porque).toContain("modelo capaz: escalada a Codex");
        expect(r.filas.find((f) => f.id === "OTRA")?.porque).toMatch(/^necesita una persona/);
        expect(r.resumen).toBe("2 sin resolver en 3 días · 1 ya con reparación en marcha · 1 necesita a alguien");
    });
});
