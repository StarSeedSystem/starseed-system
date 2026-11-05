/**
 * /api/mando/lanzamientos — GET devuelve estado, auto, versión y filas;
 * POST valida y escribe peticiones en archivos temporales.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));

vi.mock("@/lib/version/os-release", () => ({
    NATIVE_VERSION: "0.3.0",
}));

import { GET, POST } from "../route";

let dirHome = "";
let dirRoot = "";
const URL_RUTA = "http://localhost:9002/api/mando/lanzamientos";

beforeAll(() => {
    dirHome = mkdtempSync(path.join(os.tmpdir(), "lanzamientos-home-"));
    dirRoot = mkdtempSync(path.join(os.tmpdir(), "lanzamientos-root-"));
    process.env.HOME = dirHome;
    process.env.STARSEED_ROOT = dirRoot;

    // Crear estructura de directorios
    const dirProduccion = path.join(dirHome, ".starseed", "produccion");
    mkdirSync(dirProduccion, { recursive: true });
    mkdirSync(path.join(dirRoot, "config"), { recursive: true });

    // Estado del director
    writeFileSync(
        path.join(dirProduccion, "lanzamientos-estado.json"),
        JSON.stringify({
            fase: "lanzado",
            version: "0.3.0",
            detalle: "v0.3.0 lanzada y verificada en cada medio",
            t: Date.now() / 1000,
            medios: {
                web: { estado: "al-dia", version: "2026.10.09" },
                pwa: { estado: "al-dia", version: "2026.10.09" },
                macos: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
                windows: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
                linux: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
                android: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
                ios: { estado: "no-disponible", version: "0.3.0", faltan: [], pequenos: [] },
                canales: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
                libreria: { estado: "al-dia", version: "0.3.0", faltan: [], pequenos: [] },
            },
            historial: [{ t: Date.now() / 1000, tipo: "lanzado", version: "0.3.0" }],
        }),
    );

    // Interruptor auto
    writeFileSync(
        path.join(dirProduccion, "lanzamientos.json"),
        JSON.stringify({ auto: true, quien: "genesis", desde: new Date().toISOString() }),
    );

    // Config con auto_por_defecto
    writeFileSync(
        path.join(dirRoot, "config", "lanzamientos.json"),
        JSON.stringify({ auto_por_defecto: false, colas: ["cola-versiones-1105.json"] }),
    );
});

afterAll(() => {
    delete process.env.HOME;
    delete process.env.STARSEED_ROOT;
    rmSync(dirHome, { recursive: true, force: true });
    rmSync(dirRoot, { recursive: true, force: true });
});

function post(cuerpo: unknown, cabeceras: Record<string, string> = { "content-type": "application/json" }) {
    return POST(new Request(URL_RUTA, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) }));
}

const dirProduccion = () => path.join(dirHome, ".starseed", "produccion");

describe("/api/mando/lanzamientos", () => {
    it("GET devuelve estado, auto, versionPublicada, filas y tono sin rutas del disco", async () => {
        const r = await GET(new Request(URL_RUTA));
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toBe("no-store");
        const texto = await r.text();
        expect(texto).not.toContain(dirHome);
        expect(texto).not.toContain(dirRoot);
        const { estado, auto, versionPublicada, filas, tono } = JSON.parse(texto);
        expect(auto).toBe(true);
        expect(versionPublicada).toBe("0.3.0");
        expect(tono).toBe("normal");
        expect(Array.isArray(filas)).toBe(true);
        expect(filas.length).toBe(9);
        const macos = filas.find((f: { clave: string }) => f.clave === "macos");
        expect(macos).toMatchObject({ clave: "macos", etiqueta: "macOS", version: "0.3.0", estado: "al-dia" });
    });

    it("GET con estado vacío devuelve filas con estado por defecto", async () => {
        writeFileSync(path.join(dirProduccion(), "lanzamientos-estado.json"), "{}");
        const r = await GET(new Request(URL_RUTA));
        expect(r.status).toBe(200);
        const { filas, tono } = await r.json();
        expect(filas.length).toBe(9);
        expect(filas.every((f: { estado: string }) => f.estado === "al-dia")).toBe(true);
        expect(tono).toBe("normal");
    });

    it("GET con fase atascado devuelve tono peligro", async () => {
        writeFileSync(
            path.join(dirProduccion(), "lanzamientos-estado.json"),
            JSON.stringify({ fase: "atascado", detalle: "algo falló", medios: {} }),
        );
        const r = await GET(new Request(URL_RUTA));
        const { tono } = await r.json();
        expect(tono).toBe("peligro");
    });

    it("GET con medio atascado devuelve tono peligro", async () => {
        writeFileSync(
            path.join(dirProduccion(), "lanzamientos-estado.json"),
            JSON.stringify({ fase: "compilando", medios: { macos: { estado: "atascado" } } }),
        );
        const r = await GET(new Request(URL_RUTA));
        const { tono } = await r.json();
        expect(tono).toBe("peligro");
    });

    it("GET con fase activa devuelve tono aviso", async () => {
        writeFileSync(
            path.join(dirProduccion(), "lanzamientos-estado.json"),
            JSON.stringify({ fase: "compilando", medios: {} }),
        );
        const r = await GET(new Request(URL_RUTA));
        const { tono } = await r.json();
        expect(tono).toBe("aviso");
    });

    it("POST auto=true escribe lanzamientos.json y devuelve ok", async () => {
        const r = await post({ accion: "auto", activo: false });
        expect(r.status).toBe(200);
        const { ok, auto } = await r.json();
        expect(ok).toBe(true);
        expect(auto).toBe(false);
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos.json"), "utf8"));
        expect(disco.auto).toBe(false);
    });

    it("POST auto sin booleano devuelve 400", async () => {
        const r = await post({ accion: "auto", activo: "sí" });
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/Falta «activo»/);
    });

    it("POST regenerar web escribe autopublicar-peticion.json con accion revisar", async () => {
        const r = await post({ accion: "regenerar", medio: "web" });
        expect(r.status).toBe(200);
        const { ok, accion, medio } = await r.json();
        expect(ok).toBe(true);
        expect(accion).toBe("regenerar");
        expect(medio).toBe("web");
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "autopublicar-peticion.json"), "utf8"));
        expect(disco.accion).toBe("revisar");
        expect(disco.quien).toBe("genesis");
    });

    it("POST regenerar medio nativo escribe lanzamientos-peticion.json", async () => {
        const r = await post({ accion: "regenerar", medio: "macos" });
        expect(r.status).toBe(200);
        const { ok, accion, medio } = await r.json();
        expect(ok).toBe(true);
        expect(accion).toBe("regenerar");
        expect(medio).toBe("macos");
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos-peticion.json"), "utf8"));
        expect(disco.accion).toBe("regenerar");
        expect(disco.medio).toBe("macos");
        expect(disco.quien).toBe("genesis");
    });

    it("POST regenerar medio inválido devuelve 400", async () => {
        const r = await post({ accion: "regenerar", medio: "invalido" });
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/no se puede regenerar/);
    });

    it("POST regenerar sin medio devuelve 400", async () => {
        const r = await post({ accion: "regenerar" });
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/Falta el medio/);
    });

    it("POST lanzar escribe lanzamientos-peticion.json", async () => {
        const r = await post({ accion: "lanzar" });
        expect(r.status).toBe(200);
        const { ok, accion } = await r.json();
        expect(ok).toBe(true);
        expect(accion).toBe("lanzar");
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos-peticion.json"), "utf8"));
        expect(disco.accion).toBe("lanzar");
    });

    it("POST pausar escribe lanzamientos-peticion.json", async () => {
        const r = await post({ accion: "pausar" });
        expect(r.status).toBe(200);
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos-peticion.json"), "utf8"));
        expect(disco.accion).toBe("pausar");
    });

    it("POST reanudar escribe lanzamientos-peticion.json", async () => {
        const r = await post({ accion: "reanudar" });
        expect(r.status).toBe(200);
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos-peticion.json"), "utf8"));
        expect(disco.accion).toBe("reanudar");
    });

    it("POST reintentar escribe lanzamientos-peticion.json", async () => {
        const r = await post({ accion: "reintentar" });
        expect(r.status).toBe(200);
        const disco = JSON.parse(readFileSync(path.join(dirProduccion(), "lanzamientos-peticion.json"), "utf8"));
        expect(disco.accion).toBe("reintentar");
    });

    it("POST acción desconocida devuelve 400", async () => {
        const r = await post({ accion: "inventada" });
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/Acción desconocida/);
    });

    it("POST cuerpo inválido devuelve 400", async () => {
        const r = await POST(new Request(URL_RUTA, { method: "POST", headers: { "content-type": "application/json" }, body: "no-json" }));
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/Cuerpo JSON inválido/);
    });
});