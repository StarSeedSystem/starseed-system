/**
 * /api/mando/consumo — GET solo números; POST valida, exige JSON del mismo origen y escribe
 * `presupuestos.json` en la carpeta de datos de la máquina (aquí, un temporal).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));

import { GET, POST } from "../route";
import { PRESUPUESTOS_POR_DEFECTO } from "@/lib/mando/consumo-tipos";

let dir = "";
const URL_RUTA = "http://localhost:9002/api/mando/consumo";

beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "consumo-ruta-"));
    process.env.STARSEED_DATOS_DIR = dir;
    writeFileSync(
        path.join(dir, "consumo.json"),
        JSON.stringify({
            t_utc: new Date().toISOString(),
            hoy: { dia: new Date().toISOString().slice(0, 10), peticiones: 900, bytes_est: 1048576, top: [] },
            freno: { activo: false },
            jev: { coste_hoy: 0.001, saldo: 9 },
        }),
    );
});

afterAll(() => {
    delete process.env.STARSEED_DATOS_DIR;
    rmSync(dir, { recursive: true, force: true });
});

function post(cuerpo: unknown, cabeceras: Record<string, string> = { "content-type": "application/json" }) {
    return POST(new Request(URL_RUTA, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) }));
}

describe("/api/mando/consumo", () => {
    it("GET devuelve los medidores sin rutas del disco", async () => {
        const r = await GET(new Request(URL_RUTA));
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toBe("no-store");
        const texto = await r.text();
        expect(texto).not.toContain(dir);
        const { datos } = JSON.parse(texto);
        expect(datos.supabase.peticiones).toBe(900);
        expect(datos.presupuestos).toEqual(PRESUPUESTOS_POR_DEFECTO);
    });

    it("POST válido escribe los presupuestos y devuelve los datos nuevos", async () => {
        const r = await post({ presupuestos: { ...PRESUPUESTOS_POR_DEFECTO, supabase_peticiones_dia: 20_000, ciclo_inicio: "2026-09-10" } });
        expect(r.status).toBe(200);
        const d = await r.json();
        expect(d.datos.presupuestos.supabase_peticiones_dia).toBe(20_000);
        expect(d.mensaje).toMatch(/vigía/);
        const disco = JSON.parse(readFileSync(path.join(dir, "presupuestos.json"), "utf8"));
        expect(disco).toMatchObject({ supabase_peticiones_dia: 20_000, ciclo_inicio: "2026-09-10" });
    });

    it("POST inválido → 400 con el motivo, y no toca el archivo", async () => {
        const antes = readFileSync(path.join(dir, "presupuestos.json"), "utf8");
        const r = await post({ presupuestos: { ...PRESUPUESTOS_POR_DEFECTO, supabase_mb_dia: 0 } });
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/MB de salida por día/);
        expect(readFileSync(path.join(dir, "presupuestos.json"), "utf8")).toBe(antes);
    });

    it("POST sin JSON o desde otro origen se rechaza", async () => {
        expect((await post(PRESUPUESTOS_POR_DEFECTO, { "content-type": "text/plain" })).status).toBe(415);
        expect(
            (await post(PRESUPUESTOS_POR_DEFECTO, { "content-type": "application/json", origin: "https://malicioso.example" })).status,
        ).toBe(403);
        expect(
            (await post(PRESUPUESTOS_POR_DEFECTO, { "content-type": "application/json", origin: "http://localhost:9002" })).status,
        ).toBe(200);
    });
});
