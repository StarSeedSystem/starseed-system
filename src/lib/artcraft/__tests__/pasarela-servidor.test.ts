// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
    _ponerEjecutor,
    _ponerLanzador,
    _ponerRegistro,
    _ponerTopes,
    directorioTrabajo,
    estadoArtcraft,
    llamarArtcraft,
    unshareDisponible,
    type HijoMcp,
    type Lanzador,
    type LlamadaPasarela,
} from "../pasarela-servidor";

/** Hijo MCP falso: contesta o se queda callado, y recuerda qué le escribieron. */
class FalsoHijo implements HijoMcp {
    bin = "";
    args: string[] = [];
    env: Record<string, string> = {};
    cwd = "";
    escrito: string[] = [];
    muerto = false;
    basura = false;
    respondiendo = true;
    aplazadas: number[] = [];
    private enSalida: ((t: string) => void)[] = [];
    private alMorir: ((c: number | null) => void)[] = [];

    escribir(linea: string): void {
        this.escrito.push(linea);
        if (this.basura) {
            this.basura = false;
            const enorme = "x".repeat(35 * 1024 * 1024 + 7);
            for (const cb of this.enSalida) cb(enorme);
        }
        const m = JSON.parse(linea) as { id?: number; method?: string };
        if (typeof m.id !== "number") return;
        if (!this.respondiendo) {
            this.aplazadas.push(m.id);
            return;
        }
        this.contestar(m.id, m.method === "initialize" ? { serverInfo: { name: "figcraft" } } : { content: [{ type: "text", text: "hecho" }], isError: false });
    }
    contestar(id: number, result: unknown): void {
        for (const cb of this.enSalida) cb(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
    }
    aLaSalida(cb: (t: string) => void): void {
        this.enSalida.push(cb);
    }
    alFinal(cb: (c: number | null) => void): void {
        this.alMorir.push(cb);
    }
    terminar(): void {
        this.muerto = true;
    }
}

const hijos: FalsoHijo[] = [];
const lineas: string[] = [];
let modo: "responde" | "calla" | "enorme" = "responde";
let pathOriginal = "";
let datosDir = "";
let binDir = "";

const lanzadorFalso: Lanzador = (bin, args, op) => {
    const h = new FalsoHijo();
    h.bin = bin;
    h.args = args;
    h.env = op.env;
    h.cwd = op.cwd;
    if (modo === "calla") h.respondiendo = false;
    if (modo === "enorme") h.basura = true;
    hijos.push(h);
    return h;
};

const llamada = (extra: Partial<LlamadaPasarela> = {}): LlamadaPasarela => ({
    app: "figcraft",
    herramienta: "list_commands",
    parametros: {},
    origen: "agente",
    ambito: "personal",
    rol: null,
    contexto: "prueba-artcraft",
    ...extra,
});
const constela = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n));
const raicesDe = (args: string[]): string[] => args.filter((a) => a.startsWith("--automation-"));
const CLAVE_FALSA = "STARA_PRUEBA";

beforeAll(async () => {
    binDir = await fs.mkdtemp(path.join(os.tmpdir(), "artcraft-cli-"));
    for (const app of ["figcraft", "gridcraft", "deckcraft"]) {
        await fs.writeFile(path.join(binDir, `${app}-cli`), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    binDir = await fs.realpath(binDir);
    pathOriginal = process.env.PATH ?? "";
    process.env.PATH = `${binDir}${path.delimiter}${pathOriginal}`;
    datosDir = await fs.mkdtemp(path.join(os.tmpdir(), "artcraft-datos-"));
    process.env.STARSEED_DATOS_DIR = datosDir;
    process.env[`${CLAVE_FALSA}_API_KEY`] = ["va", "lor"].join("");
    process.env[`${CLAVE_FALSA}_TOKEN`] = ["va", "lor"].join("");
    process.env[`${CLAVE_FALSA}_SECRET`] = ["va", "lor"].join("");
    _ponerEjecutor(async () => ({ stdout: "figcraft-cli 0.10.0\n", stderr: "", code: 0 }));
    _ponerRegistro((l) => lineas.push(l));
});

afterAll(() => {
    _ponerEjecutor(null);
    _ponerLanzador(null);
    _ponerRegistro(null);
    _ponerTopes(null);
    process.env.PATH = pathOriginal;
    delete process.env.STARSEED_DATOS_DIR;
    delete process.env[`${CLAVE_FALSA}_API_KEY`];
    delete process.env[`${CLAVE_FALSA}_TOKEN`];
    delete process.env[`${CLAVE_FALSA}_SECRET`];
    return fs.rm(datosDir, { recursive: true, force: true });
});

beforeEach(() => {
    _ponerLanzador(lanzadorFalso);
});

afterEach(() => {
    _ponerLanzador(null);
    _ponerTopes(null);
    hijos.length = 0;
    lineas.length = 0;
    modo = "responde";
});

describe("Pasarela ArtCraft en servidor", () => {
    it("discovera la CLI del PATH: versión y sitio sin el home real", async () => {
        const est = await estadoArtcraft("figcraft", true);
        expect(est.instalado).toBe(true);
        expect(est.version).toBe("0.10.0");
        expect(est.donde).toContain("artcraft-cli");
        expect(est.donde).not.toContain(os.homedir());
    });

    it("figcraft y deckcraft llevan las raíces de automación; gridcraft no", async () => {
        const dir = (await directorioTrabajo("figcraft", "prueba-artcraft"))!;
        await llamarArtcraft(llamada());
        const handshake = hijos[0].escrito.find((l) => l.includes("initialize"));
        expect(handshake).toBeTruthy();
        expect(JSON.parse(handshake!)).toMatchObject({ method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "starseed-os" } } });
        expect(hijos[0].args).toContain("mcp");
        expect(raicesDe(hijos[0].args)).toHaveLength(3);
        expect(hijos[0].args).toEqual(expect.arrayContaining(["--automation-read-root", dir.lectura, "--automation-write-root", dir.escritura]));
        await llamarArtcraft(llamada({ app: "gridcraft" }));
        expect(raicesDe(hijos[1].args)).toEqual([]);
        await llamarArtcraft(llamada({ app: "deckcraft" }));
        expect(raicesDe(hijos[2].args)).not.toEqual([]);
    });

    it("en Linux con unshare corre sin red; si no hay, sinRed es false", async () => {
        const r = await llamarArtcraft(llamada());
        const hay = process.platform === "linux" && !!(await unshareDisponible());
        if (hay) {
            expect(hijos[0].bin).toBe("/usr/bin/unshare");
            expect(hijos[0].args.slice(0, 2)).toEqual(["-n", "--"]);
            expect(hijos[0].args).toEqual(expect.arrayContaining(["mcp"]));
            expect(r.sinRed).toBe(true);
        } else {
            expect(r.sinRed).toBeFalsy();
        }
    });

    it("el entorno del hijo es mínimo: ni *_KEY, ni *_TOKEN, ni *_SECRET", async () => {
        await llamarArtcraft(llamada());
        const env = hijos[0].env;
        const malas = Object.keys(env).filter((k) => /(_KEY|_TOKEN|_SECRET)$/.test(k));
        expect(env.HOME).toBe((await directorioTrabajo("figcraft", "prueba-artcraft"))!.raiz);
        expect(malas).toEqual([]);
        expect(Object.keys(env).sort()).toEqual(["HOME", "LANG", "PATH"]);
    });

    it("el contexto con ../ se rechaza sin lanzar nada", async () => {
        expect(await llamarArtcraft(llamada({ contexto: "../fuera" }))).toMatchObject({ ok: false, status: 400 });
        expect(await llamarArtcraft(llamada({ contexto: "Sala_Rara" }))).toMatchObject({ ok: false, status: 400 });
        expect(hijos).toHaveLength(0);
    });

    it("la política se evalúa ANTES de lanzar: collab.share → 403 sin hijos", async () => {
        const r = await llamarArtcraft(llamada({ herramienta: "run_command", parametros: { commands: [[["collab"], [".share"]].flat().join("")] } }));
        expect(r).toMatchObject({ ok: false, status: 403 });
        expect(hijos).toHaveLength(0);
    });

    it("escritura de un agente en un ámbito compartido → 409 de confirmación, sin hijos", async () => {
        const r = await llamarArtcraft(llamada({ app: "gridcraft", herramienta: "write_range", parametros: { rango: "A1:B2", valores: [[1]] }, ambito: "grupo", rol: "dueno" }));
        expect(r).toMatchObject({ ok: false, status: 409, confirmar: true });
        expect(hijos).toHaveLength(0);
    });

    it("una línea enorme corta el cliente, no despacha más y la llamada falla", async () => {
        modo = "enorme";
        const r = await llamarArtcraft(llamada({ parametros: { nota: "cualquiera" } }));
        expect(r).toMatchObject({ ok: false, status: 500 });
        expect(r.motivo).toContain("32 MiB");
        expect(hijos[0].muerto).toBe(true);
    });

    it("el tiempo agotado mata al proceso (504)", async () => {
        _ponerTopes(120);
        modo = "calla";
        const r = await llamarArtcraft(llamada({ origen: "mano", ambito: "personal", rol: "dueno" }));
        expect(r).toMatchObject({ ok: false, status: 504 });
        expect(hijos[0].muerto).toBe(true);
    });

    it("la tercera llamada a la vez se queda fuera (429)", async () => {
        modo = "calla";
        const p1 = llamarArtcraft(llamada({ contexto: "prueba-artcraft-a" }));
        await constela(50);
        const p2 = llamarArtcraft(llamada({ contexto: "prueba-artcraft-b" }));
        await constela(50);
        expect(hijos).toHaveLength(2);
        expect(await llamarArtcraft(llamada({ contexto: "prueba-artcraft-c" }))).toMatchObject({ ok: false, status: 429 });
        // ahora contestan: las dos sueltas terminan y el contador queda libre
        hijos.forEach((h) => {
            h.respondiendo = true;
            h.aplazadas.forEach((id) => h.contestar(id, { content: [] }));
        });
        modo = "responde";
        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);
        expect(await llamarArtcraft(llamada({ contexto: "prueba-artcraft-d" }))).toMatchObject({ ok: true });
    });

    it("el registro lleva app, herramienta, huella de 12 hex y estado; nunca los parámetros", async () => {
        await llamarArtcraft(llamada({ parametros: { nombre: "secreto-que-no-debe-salir" } }));
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toMatch(/^artcraft app=figcraft herramienta=list_commands huella=[0-9a-f]{12} estado=hecho$/);
        expect(lineas.join("\n")).not.toContain("secreto-que-no-debe-salir");
    });
});



