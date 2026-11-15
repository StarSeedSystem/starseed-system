/** BAN1115O: contrato de la ruta del canal del banco de llamadas (la app de la Mac lee la orden y publica su estado). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET, POST } from "../route";

let base: string;
const peticion = (metodo: string, cuerpo?: unknown, cab: Record<string, string> = {}) =>
    new Request("http://127.0.0.1:47610/api/banco-llamadas", { method: metodo, headers: { host: "127.0.0.1:47610", ...cab }, body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });
const informe = { v: 1, llave: true, objetivo: "e0b9faf2-aaaa-bbbb-cccc-123456789abc", codigo: "AB 12", sesion: { estado: "aceptada", motivo: null, t: 1 }, armada: null };

beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "ban1115o-"));
    process.env.STARSEED_PRODUCCION_DIR = base;
    process.env.STARSEED_BANCO_SIN_SO = "1";
});
afterEach(async () => {
    delete process.env.STARSEED_PRODUCCION_DIR;
    delete process.env.STARSEED_BANCO_SIN_SO;
    await fs.rm(base, { recursive: true, force: true });
});

describe("GET /api/banco-llamadas", () => {
    it("sin carpeta del banco no sirve nada y no la crea", async () => {
        const j = await (await GET(peticion("GET"))).json();
        expect(j).toEqual({ disponible: false });
        await expect(fs.stat(path.join(base, "banco-llamadas"))).rejects.toThrow();
    });
    it("con carpeta devuelve orden, calma y app; lo que pesa más de 64 kB cuenta como ausente", async () => {
        const d = path.join(base, "banco-llamadas");
        await fs.mkdir(d);
        await fs.writeFile(path.join(d, "orden.json"), JSON.stringify({ n: 1 }));
        await fs.writeFile(path.join(d, "calma.json"), "x".repeat(70_000));
        const j = await (await GET(peticion("GET"))).json();
        expect(j).toEqual({ disponible: true, orden: { n: 1 }, calma: null, app: null });
    });
    it("fuera de macOS responde «no disponible»", async () => {
        delete process.env.STARSEED_BANCO_SIN_SO;
        await fs.mkdir(path.join(base, "banco-llamadas"));
        const j = await (await GET(peticion("GET"))).json();
        if (process.platform !== "darwin") expect(j).toEqual({ disponible: false });
    });
    it("una petición que no es de esta máquina no lee nada", async () => {
        await fs.mkdir(path.join(base, "banco-llamadas"));
        const r = new Request("http://192.168.1.5:3000/api/banco-llamadas", { headers: { host: "192.168.1.5:3000" } });
        expect(await (await GET(r)).json()).toEqual({ disponible: false });
    });
});

describe("POST /api/banco-llamadas", () => {
    it("escribe app.json solo si la carpeta ya existe", async () => {
        const sin = await POST(peticion("POST", informe));
        expect(sin.status).toBe(404);
        await expect(fs.stat(path.join(base, "banco-llamadas"))).rejects.toThrow();
        await fs.mkdir(path.join(base, "banco-llamadas"));
        const r = await POST(peticion("POST", informe));
        expect(r.status).toBe(200);
        const app = JSON.parse(await fs.readFile(path.join(base, "banco-llamadas", "app.json"), "utf8"));
        expect(app.llave).toBe(true);
        expect(app.sesion.estado).toBe("aceptada");
        expect((await fs.readdir(path.join(base, "banco-llamadas"))).filter((f) => f.includes("tmp"))).toEqual([]);
    });
    it("rechaza lo que no es un informe, lo grande y el origen ajeno", async () => {
        await fs.mkdir(path.join(base, "banco-llamadas"));
        expect((await POST(peticion("POST", { v: 2 }))).status).toBe(400);
        expect((await POST(peticion("POST", "x".repeat(5_000)))).status).toBe(400);
        expect((await POST(peticion("POST", informe, { origin: "https://otra-web.example" }))).status).toBe(404);
        expect((await POST(peticion("POST", informe, { origin: "http://127.0.0.1:47610" }))).status).toBe(200);
    });
});
