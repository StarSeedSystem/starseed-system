import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    agruparCommits,
    aplicarArchivo,
    aprobacionesDelDirector,
    basePruebas,
    buildsDeRun,
    construirVersiones,
    esRunDePruebas,
    leerLanzador,
    leerLogGit,
    marcarComprobacion,
    normalizarComprobaciones,
    numeroDePrueba,
    planDeAprobacion,
    registroDeAprobacion,
    resumenComprobaciones,
    resumenPruebas,
    validarPeticionPruebas,
    type FuentesPruebas,
    type JobGh,
    type RunGh,
} from "@/lib/mando/lanzamientos-pruebas";

const AHORA = Date.parse("2026-11-11T10:00:00Z");
const SHA35 = "60907b03b89f4d1d40f564131aa3f33eaeea6177";
const SHA36 = "a8051ea953" + "0".repeat(30);
const CABEZA = "c".repeat(40);
const EJEMPLO = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "pruebas-comprobaciones.json"), "utf-8"));

function run(n: number, sha: string, extra: Partial<RunGh> = {}): RunGh {
    return { databaseId: 1000 + n, number: n, headSha: sha, status: "completed", conclusion: "success", createdAt: "2026-11-10T07:00:43Z", url: `https://x/run/${n}`, event: "workflow_dispatch", headBranch: "main", ...extra };
}
function jobs(o: Partial<Record<"mac" | "win" | "lin" | "and" | "pub", Partial<JobGh>>> = {}): JobGh[] {
    const ok = (name: string, extra?: Partial<JobGh>): JobGh => ({ name, status: "completed", conclusion: "success", startedAt: "2026-11-10T07:07:45Z", completedAt: "2026-11-10T07:20:00Z", url: `https://x/job/${name}`, ...extra });
    return [
        ok("canal de pruebas · versión y prerelease"),
        ok("servidor local · next build (standalone)"),
        ok("${{ matrix.system }} · ios", { conclusion: "skipped" }),
        ok("os · android", o.and),
        ok("os · windows-latest", o.win),
        ok("os · macos-latest", o.mac),
        ok("os · ubuntu-24.04", o.lin),
        ok("canal de pruebas · latest-prueba.json y limpieza", o.pub),
    ];
}
function fuentes(extra: Partial<FuentesPruebas> = {}): FuentesPruebas {
    return { ahora: AHORA, nativa: "0.5.0", runs: [], lanzadores: [], archivo: { formato: 1, pruebas: {} }, manifiestos: { escritorio: null, android: null }, contenido: {}, mainMovido: {}, director: [], ...extra };
}

describe("nombres de las pruebas", () => {
    it("el número se lee igual que en el comando", () => {
        for (const t of ["36", "prueba36", "prueba.36", "0.5.1-prueba.36"]) expect(numeroDePrueba(t)).toBe(36);
        expect(numeroDePrueba("0.5.1")).toBeNull();
        expect(basePruebas("0.5.0")).toBe("0.5.1");
    });
});

describe("lo que trae cada prueba", () => {
    it("agrupa los commits por id de tarea, en su orden, y deja al final lo que no lleva id", () => {
        const commits = leerLogGit([
            `${"1".repeat(40)}\u001fLLA1111B: voz y vídeo comparten el carril`,
            `${"2".repeat(40)}\u001fchore(memoria): aprendizaje`,
            `${"3".repeat(40)}\u001fMLL1111C: todas las vías arriba`,
            `${"4".repeat(40)}\u001f1110L · LLA1111B: un arreglo más`,
        ].join("\n"));
        const g = agruparCommits(commits);
        expect(g.map((x) => [x.tarea, x.commits.length])).toEqual([["LLA1111B", 2], ["MLL1111C", 1], [null, 1]]);
    });
});

describe("el build de cada plataforma", () => {
    it("un run de pruebas se reconoce por el job del plan", () => {
        expect(esRunDePruebas(run(35, SHA35), jobs())).toBe(true);
        expect(esRunDePruebas(run(35, SHA35, { event: "push", headBranch: "v0.5.0" }), jobs())).toBe(false);
        expect(esRunDePruebas(run(35, SHA35), jobs().map((j) => (j.name?.includes("versión y prerelease") ? { ...j, conclusion: "skipped" } : j)))).toBe(false);
    });

    it("todo verde → publicada en macOS, Windows, Linux y Android (iOS omitido no cuenta)", () => {
        const b = buildsDeRun(run(35, SHA35), jobs());
        expect(b.map((x) => [x.plataforma, x.estado])).toEqual([["macos", "publicada"], ["windows", "publicada"], ["linux", "publicada"], ["android", "publicada"]]);
    });

    it("en marcha: compilando desde su inicio, en cola, y escritorio esperando a publicar", () => {
        const b = buildsDeRun(run(36, SHA36, { status: "in_progress", conclusion: null }), jobs({
            and: { status: "in_progress", conclusion: undefined, completedAt: undefined, startedAt: "2026-11-11T09:48:00Z" },
            mac: { status: "queued", conclusion: undefined },
            pub: { status: "queued", conclusion: undefined },
        }));
        const por = Object.fromEntries(b.map((x) => [x.plataforma, x]));
        expect(por.android.estado).toBe("compilando");
        expect(por.macos.estado).toBe("en-cola");
        expect(por.windows.estado).toBe("publicando");
    });

    it("un fallo nombra el job; un omitido por ese fallo también falla", () => {
        const b = buildsDeRun(run(31, SHA35, { conclusion: "failure" }), jobs({
            mac: { conclusion: "failure" },
            pub: { conclusion: "skipped" },
        }));
        const por = Object.fromEntries(b.map((x) => [x.plataforma, x]));
        expect(por.macos).toMatchObject({ estado: "fallo", detalle: "falló «os · macos-latest»" });
        expect(por.windows).toMatchObject({ estado: "fallo", detalle: "compilado, pero no se publicó: falló «os · macos-latest»" });
        expect(por.android.estado).toBe("publicada");
    });

    it("sin jobs (GitHub no respondió) no inventa plataformas y lo dice", () => {
        const [v] = construirVersiones(fuentes({ runs: [{ run: run(35, SHA35), jobs: null }] }));
        expect(v).toBeUndefined(); // sin jobs no se sabe si es de pruebas: no se enseña como tal
    });
});

describe("el registro del lanzador", () => {
    it("lanzado, esperando, expirado y mudo", () => {
        const lanzado = leerLanzador("prueba35", `Tue Nov 10 01:00:41 CST 2026 · 60907b03b8 ya está en origin/main (60907b03b8) · lanzo prueba35\n[{"createdAt":"2026-11-10T07:00:43Z","databaseId":42772308696,"headSha":"${SHA35}","status":"in_progress"}]`, AHORA - 3600_000, AHORA);
        expect(lanzado).toMatchObject({ numero: 35, estado: "lanzado", sha: SHA35, runId: 42772308696 });
        expect(leerLanzador("prueba36", "", AHORA - 600_000, AHORA)).toMatchObject({ estado: "esperando", sha: null });
        expect(leerLanzador("prueba36", "2026-11-11T07:10:01Z · espero a8051ea953 en origin/main · prueba36", AHORA - 600_000, AHORA)?.sha).toBe("a8051ea953");
        expect(leerLanzador("prueba36", "", AHORA - 5 * 3600_000, AHORA)?.estado).toBe("mudo");
        expect(leerLanzador("prueba36", "x · se acabó la espera: a8051ea953 no llegó", AHORA, AHORA)?.estado).toBe("expirado");
    });
});

describe("la lista y su resumen", () => {
    it("ninguna: lo dice", () => {
        expect(construirVersiones(fuentes())).toEqual([]);
        expect(resumenPruebas([], AHORA)).toBe("Sin versiones de prueba");
    });

    it("una en marcha esperando a main, con sus comprobaciones registradas, y las publicadas debajo", () => {
        const archivo = normalizarComprobaciones(EJEMPLO);
        const vs = construirVersiones(fuentes({
            runs: [{ run: run(35, SHA35), jobs: jobs() }, { run: run(34, "7b4026af2ca3495b78b8f349820a2b1ef44e111b"), jobs: jobs() }],
            lanzadores: [leerLanzador("prueba36", "", AHORA - 600_000, AHORA)!],
            archivo,
            manifiestos: { escritorio: "0.5.1-prueba.35", android: "0.5.1-prueba.35" },
        }));
        expect(vs.map((v) => v.numero)).toEqual([36, 35, 34]);
        expect(vs[0].plataformas.every((p) => p.estado === "esperando-main")).toBe(true);
        expect(vs[0].sha).toBe(archivo.pruebas["36"].sha); // el commit lo dio el registro de comprobaciones
        expect(vs[1]).toMatchObject({ version: "0.5.1-prueba.35", publicadaEnTodas: true, vigente: { escritorio: true, android: true } });
        expect(resumenPruebas(vs, AHORA)).toBe("prueba.36 · esperando a main · 3 de 4 comprobaciones (1 falla)");
    });

    it("compilando: «prueba.36 · Android compilando 12 min · …»", () => {
        const vs = construirVersiones(fuentes({
            runs: [{ run: run(36, SHA36, { status: "in_progress", conclusion: null }), jobs: jobs({
                and: { status: "in_progress", conclusion: undefined, startedAt: "2026-11-11T09:48:00Z" },
                mac: { status: "completed" }, pub: { status: "queued", conclusion: undefined },
            }) }],
        }));
        expect(resumenPruebas(vs, AHORA)).toBe("prueba.36 · Android compilando 12 min · sin comprobaciones");
    });

    it("se enseñan como mucho 4 publicadas además de la que está en marcha", () => {
        const runs = [30, 31, 32, 33, 34, 35].map((n) => ({ run: run(n, String(n).repeat(20)), jobs: jobs() }));
        expect(construirVersiones(fuentes({ runs })).map((v) => v.numero)).toEqual([35, 34, 33, 32]);
    });

    it("un lanzamiento pedido que no está entre los runs leídos no se pinta «en cola» para siempre", () => {
        const viejo = leerLanzador("prueba23", `x ya está en origin/main\n[{"databaseId":1,"headSha":"${SHA35}"}]`, AHORA - 3 * 86400_000, AHORA)!;
        const [v] = construirVersiones(fuentes({ lanzadores: [viejo], runs: [{ run: run(35, SHA35), jobs: jobs() }] })).filter((x) => x.numero === 23);
        expect(v.plataformas).toEqual([]);
        expect(v.desconocido.join(" ")).toContain("no está entre los runs");
    });
});

describe("el archivo de comprobaciones", () => {
    it("lee el mismo ejemplo que el comando de Python", () => {
        const a = normalizarComprobaciones(EJEMPLO);
        expect(resumenComprobaciones(a.pruebas["36"].comprobaciones)).toEqual({ total: 4, bien: 2, falla: 1, pendiente: 1 });
    });

    it("marcar cambia estado, quién, cuándo y nota; lo que no existe se dice", () => {
        const a = marcarComprobacion(normalizarComprobaciones(EJEMPLO), 36, "c4", "bien", "alex", "2026-11-11T10:00:00Z", "con cámara");
        expect(a.pruebas["36"].comprobaciones[3]).toMatchObject({ estado: "bien", quien: "alex", nota: "con cámara" });
        expect(EJEMPLO.pruebas["36"].comprobaciones[3].estado).toBe("pendiente"); // puro: no toca la entrada
        expect(() => marcarComprobacion(a, 36, "c9", "bien", "alex", "t")).toThrow(/No existe/);
    });

    it("lo roto se descarta sin romper", () => {
        const a = normalizarComprobaciones({ pruebas: { x: {}, "7": { comprobaciones: [{ id: "c1" }, { id: "c2", texto: "t", estado: "raro" }] } } });
        expect(Object.keys(a.pruebas)).toEqual(["7"]);
        expect(a.pruebas["7"].comprobaciones).toEqual([expect.objectContaining({ id: "c2", estado: "pendiente" })]);
    });
});

describe("peticiones del panel", () => {
    it("marcar y aprobar se validan", () => {
        expect(validarPeticionPruebas({ accion: "marcar", numero: "36", id: "c2", estado: "falla", nota: "x" })).toEqual({ accion: "marcar", numero: 36, id: "c2", estado: "falla", nota: "x" });
        expect(validarPeticionPruebas({ accion: "marcar", numero: 36, id: "../x", estado: "bien" })).toHaveProperty("error");
        expect(validarPeticionPruebas({ accion: "marcar", numero: 36, id: "c1", estado: "regular" })).toHaveProperty("error");
        expect(validarPeticionPruebas({ accion: "aprobar", numero: 35, sha: SHA35 })).toEqual({ accion: "aprobar", numero: 35, sha: SHA35, lanzar_sha: SHA35 });
        expect(validarPeticionPruebas({ accion: "aprobar", numero: 35, sha: "60907b03b8" })).toHaveProperty("error");
        expect(validarPeticionPruebas({ accion: "lanzar", numero: 35 })).toHaveProperty("error");
    });
});

describe("aprobar", () => {
    const base = () => construirVersiones(fuentes({
        runs: [{ run: run(35, SHA35), jobs: jobs() }],
        archivo: { formato: 1, pruebas: { "35": { version: "0.5.1-prueba.35", sha: SHA35, aprobacion: null, comprobaciones: normalizarComprobaciones(EJEMPLO).pruebas["36"].comprobaciones } } },
    }))[0];

    it("las comprobaciones pendientes o que fallan no bloquean: se enseñan", () => {
        const plan = planDeAprobacion(base(), SHA35);
        expect(plan.puede).toBe(true);
        expect(plan.oficial).toBe("0.5.1");
        expect(plan.fallas.map((c) => c.id)).toEqual(["c2"]);
        expect(plan.pendientes.map((c) => c.id)).toEqual(["c4"]);
        expect(plan.lanzar.join("\n")).toMatch(/macOS[\s\S]*Windows[\s\S]*Linux[\s\S]*Android[\s\S]*Web: .*60907b03b8 \(el commit probado\)/);
        expect(plan.lanzarSha).toBe(SHA35);
    });

    it("sin publicar en todas no se puede", () => {
        const v = construirVersiones(fuentes({ runs: [{ run: run(35, SHA35, { status: "in_progress" }), jobs: jobs({ and: { status: "in_progress", conclusion: undefined } }) }] }))[0];
        const plan = planDeAprobacion(v, null);
        expect(plan.puede).toBe(false);
        expect(plan.motivo).toContain("Android");
    });

    it("main avanzó: dice cuánto y qué, y lo que se lanzaría es la cabeza de main", () => {
        const v = construirVersiones(fuentes({
            runs: [{ run: run(35, SHA35), jobs: jobs() }],
            mainMovido: { 35: { cabeza: CABEZA, commits: leerLogGit(`${"9".repeat(40)}\u001fVEN1111D: ventanas`) } },
        }))[0];
        const plan = planDeAprobacion(v, null);
        expect(plan.mainMovido).toMatchObject({ cabeza: CABEZA, total: 1, grupos: [{ tarea: "VEN1111D" }] });
        expect(plan.lanzarSha).toBe(CABEZA);
    });

    it("una segunda pulsación no hace nada nuevo: ya aprobada", () => {
        const v = base();
        const reg = registroDeAprobacion(v, SHA35, "2026-11-11T10:00:00Z");
        expect(reg.comprobaciones).toMatchObject({ total: 4, bien: 2, falla: 1, pendiente: 1 });
        const [aprobada] = aplicarArchivo([v], { formato: 1, pruebas: { "35": { version: v.version!, sha: SHA35, comprobaciones: v.comprobaciones, aprobacion: reg } } });
        const plan = planDeAprobacion(aprobada, null);
        expect(plan.puede).toBe(false);
        expect(plan.motivo).toContain("Ya aprobada");
        expect(resumenPruebas([aprobada], AHORA)).toBe("prueba.35 · aprobada · 3 de 4 comprobaciones (1 falla)");
    });

    it("lo que dice el director de la aprobación llega a su versión", () => {
        const d = aprobacionesDelDirector({ aprobacion: { version: "0.5.1-prueba.35", sha: SHA35, estado: "en-curso", detalle: "lanzo la 0.5.1" } });
        const v = construirVersiones(fuentes({ runs: [{ run: run(35, SHA35), jobs: jobs() }], director: d }))[0];
        expect(v.director?.estado).toBe("en-curso");
        expect(planDeAprobacion(v, null).puede).toBe(false);
    });
});
