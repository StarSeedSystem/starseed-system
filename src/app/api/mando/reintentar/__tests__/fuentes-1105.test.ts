// @vitest-environment node
/**
 * (SUP0511H, 05-11) `POST /api/mando/reintentar` lee solo las fuentes de las tareas pedidas y su cadena: ni los
 * logs de todo el progreso ni `eventos.jsonl` entero (el montón de Genesis tenía 600–880 MB de cadenas grandes y
 * `lsof` veía cientos de `olas/logs/*.log` abiertos a la vez durante minutos).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));
vi.mock("@/lib/mando/procesos-orquestador", () => ({ orquestadoresVivos: vi.fn(async () => []) }));
vi.mock("node:child_process", async (original) => ({
    ...(await original<typeof import("node:child_process")>()),
    // `marcarAdelantadas` llama a python3 con el cerrojo del progreso: aquí no se toca la Mac.
    execFile: vi.fn((...args: unknown[]) => {
        const fin = args.at(-1);
        if (typeof fin === "function") (fin as (e: null, a: string, b: string) => void)(null, "", "");
    }),
}));
vi.mock("node:fs/promises", async (original) => {
    const real = await original<typeof import("node:fs/promises")>();
    return { ...real, readFile: vi.fn(real.readFile), open: vi.fn(real.open) };
});

import { open, readFile } from "node:fs/promises";

import { POST } from "../route";
import { eventosDe, finalDe, idsConFuentes, lineaDeEventoUtil } from "@/lib/mando/reintento-fuentes";

const URL_RUTA = "http://localhost:9002/api/mando/reintentar";
let raiz = "";
let olas = "";
const antes = process.env.STARSEED_ROOT;

function escribir(relativa: string, contenido: string) {
    const ruta = path.join(olas, relativa);
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, contenido);
}

function leidos(): string[] {
    const rutas = [...vi.mocked(readFile).mock.calls, ...vi.mocked(open).mock.calls].map((c) => String(c[0]));
    return rutas.filter((r) => r.startsWith(olas)).map((r) => path.relative(olas, r).split(path.sep).join("/"));
}

beforeAll(() => {
    raiz = mkdtempSync(path.join(os.tmpdir(), "reintentar-1105-"));
    process.env.STARSEED_ROOT = raiz;
    olas = path.join(raiz, "starseed_memory_root", "olas");
    escribir("progreso.json", JSON.stringify({
        PRB1105HA: { estado: "pendiente" },
        PRB1105HAb: { estado: "pendiente" },
        PRB1105HC: { estado: "fallo_tests" },
        PRB1105HD: { estado: "commit" },
    }));
    escribir("cola-prueba-1105h.json", JSON.stringify([{ id: "PRB1105HE", titulo: "otra", archivos: [], prompt: "x" }]));
    for (const id of ["PRB1105HA", "PRB1105HAb", "PRB1105HC", "PRB1105HD", "PRB1105HE"]) {
        escribir(`logs/${id}.log`, `inicio ${id}\n` + "relleno\n".repeat(10) + `FAIL expected 1 received 2 · ${id}\n`);
        escribir(`pasos/${id}.jsonl`, `{"paso":"tests","id":"${id}"}\n`);
    }
    escribir("eventos.jsonl", [
        '{"tipo":"revision","tarea":"PRB1105HC","texto":"revisión bloqueante"}',
        '{"tipo":"latido","tarea":"PRB1105HC"}',
        '{"tipo":"revision","tarea":"PRB1105HD","texto":"rechazada"}',
    ].join("\n") + "\n");
    escribir("revisiones.md", "# Revisiones\n");
});

afterAll(() => {
    if (antes === undefined) delete process.env.STARSEED_ROOT;
    else process.env.STARSEED_ROOT = antes;
    rmSync(raiz, { recursive: true, force: true });
});

beforeEach(() => {
    vi.mocked(readFile).mockClear();
    vi.mocked(open).mockClear();
});

function post(cuerpo: unknown) {
    return POST(new Request(URL_RUTA, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
}

describe("POST /api/mando/reintentar · fuentes acotadas (SUP0511H)", () => {
    it("con una tarea pedida solo lee el log y los pasos de su cadena", async () => {
        const r = await post({ ids: ["PRB1105HA"], automatico: true });
        expect(r.status).toBe(200);
        const logs = leidos().filter((x) => x.startsWith("logs/") || x.startsWith("pasos/"));
        expect(logs.sort()).toEqual(["logs/PRB1105HA.log", "logs/PRB1105HAb.log", "pasos/PRB1105HA.jsonl", "pasos/PRB1105HAb.jsonl"]);
    });

    it("no lee eventos.jsonl entero con readFile", async () => {
        await post({ ids: ["PRB1105HA"], automatico: true });
        expect(vi.mocked(readFile).mock.calls.map((c) => String(c[0])).filter((r) => r.endsWith("eventos.jsonl"))).toEqual([]);
    });

    it("sin ids, solo las elegibles (las que fallaron) y su cadena", async () => {
        const r = await post({ automatico: true });
        expect(r.status).toBe(200);
        const logs = leidos().filter((x) => x.startsWith("logs/"));
        expect(logs).toEqual(["logs/PRB1105HC.log"]);
        const d = await r.json() as { reintentadas: string[] };
        expect(d.reintentadas.length).toBe(1);
    });
});

describe("reintento-fuentes (puras y lectores acotados)", () => {
    it("idsConFuentes: los pedidos y los de su misma base", () => {
        expect(idsConFuentes(["SUP0511C"], ["SUP0511C", "SUP0511Cb", "SUP0511Cb-d1", "OTRA1", "SUP0511D"]))
            .toEqual(["SUP0511C", "SUP0511Cb"]);
        expect(idsConFuentes(["NUEVA1"], ["OTRA1"])).toEqual(["NUEVA1"]);
        expect(idsConFuentes([], ["OTRA1"])).toEqual([]);
    });

    it("lineaDeEventoUtil sigue la regla de eventoDe", () => {
        expect(lineaDeEventoUtil('{"t":"revision","tarea":"X1"}', ["X1"])).toBe(true);
        expect(lineaDeEventoUtil('{"t":"latido","tarea":"X1"}', ["X1"])).toBe(false);
        expect(lineaDeEventoUtil('{"t":"Rechazada","tarea":"X2"}', ["X1"])).toBe(false);
    });

    it("finalDe lee como mucho los bytes pedidos y sin la primera línea a medias", async () => {
        const ruta = path.join(raiz, "grande.log");
        writeFileSync(ruta, "a".repeat(5000) + "\n" + "linea final\n");
        expect(await finalDe(ruta, 100)).toBe("linea final\n");
        expect(await finalDe(ruta)).toBe("a".repeat(5000) + "\n" + "linea final\n");
        expect(await finalDe(path.join(raiz, "no-existe.log"))).toBe("");
    });

    it("eventosDe deja solo las líneas útiles para esas tareas", async () => {
        const ruta = path.join(olas, "eventos.jsonl");
        expect(await eventosDe(ruta, ["PRB1105HC"])).toBe('{"tipo":"revision","tarea":"PRB1105HC","texto":"revisión bloqueante"}');
        expect(await eventosDe(ruta, [])).toBe("");
    });
});
