/**
 * /api/mando/medidores?clave=versiones (VER1105D): lee el estado del director de lanzamientos
 * desde ~/.starseed/produccion/lanzamientos-estado.json y devuelve el detalle del medidor.
 * Sin red, solo disco temporal.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));

import { GET } from "../route";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const URL_RUTA = "http://localhost:9002/api/mando/medidores?clave=versiones";
let raiz = "";
let casa = "";
const antes = { root: process.env.STARSEED_ROOT, home: process.env.HOME };
const archivoEstado = () => path.join(casa, ".starseed", "produccion", "lanzamientos-estado.json");
const detalle = async () => {
    const r = await GET(new Request(URL_RUTA));
    return { status: r.status, cuerpo: (await r.json()) as { detalle?: DetalleMedidor; error?: string } };
};

const estadoBase = {
    fase: "compilando",
    detalle: "compilando v0.4.0 en GitHub",
    version: "0.4.0",
    pasos: [
        { fase: "esperando-lista", t: Date.now() - 3600_000, detalle: "lista terminada" },
        { fase: "esperando-publicacion", t: Date.now() - 3000_000, detalle: "espero publicación" },
        { fase: "preparando", t: Date.now() - 2400_000, detalle: "preparo v0.4.0" },
        { fase: "etiquetando", t: Date.now() - 1800_000, detalle: "etiqueta v0.4.0 subida" },
        { fase: "compilando", t: Date.now() - 600_000, detalle: "compilando v0.4.0 en GitHub" },
    ],
    jobs: [
        { medio: "macos", job: "macos · macos-latest", estado: "en-curso", url: "https://github.com/.../jobs/1", inicio: "2026-11-05T10:00:00Z" },
        { medio: "windows", job: "windows · windows-latest", estado: "en-cola", url: "https://github.com/.../jobs/2" },
    ],
    medios: {
        web: { estado: "al-dia", faltan: [], pequenos: [] },
        pwa: { estado: "al-dia", faltan: [], pequenos: [] },
        macos: { estado: "generando", faltan: [], pequenos: [] },
        windows: { estado: "en-cola", faltan: [], pequenos: [] },
        linux: { estado: "en-cola", faltan: [], pequenos: [] },
        android: { estado: "en-cola", faltan: [], pequenos: [] },
        ios: { estado: "no-disponible", faltan: [], pequenos: [] },
        canales: { estado: "en-cola", faltan: [], pequenos: [] },
        libreria: { estado: "en-cola", faltan: [], pequenos: [] },
    },
    run_url: "https://github.com/StarSeedSystem/starseed-system/actions/runs/123",
    release_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0",
    historial: [
        { t: Date.now() - 86400_000 * 2, tipo: "lanzado", version: "0.3.0" },
    ],
    pausado: false,
    tono: "aviso" as const,
};

beforeAll(() => {
    raiz = mkdtempSync(path.join(os.tmpdir(), "medidor-versiones-raiz-"));
    casa = mkdtempSync(path.join(os.tmpdir(), "medidor-versiones-casa-"));
    process.env.STARSEED_ROOT = raiz;
    process.env.HOME = casa;
});
afterAll(() => {
    if (antes.root === undefined) delete process.env.STARSEED_ROOT;
    else process.env.STARSEED_ROOT = antes.root;
    process.env.HOME = antes.home;
    rmSync(raiz, { recursive: true, force: true });
    rmSync(casa, { recursive: true, force: true });
});
beforeEach(() => {
    mkdirSync(path.dirname(archivoEstado()), { recursive: true });
    writeFileSync(archivoEstado(), JSON.stringify(estadoBase));
});

describe("medidor «Versiones» en /api/mando/medidores", () => {
    it("devuelve 200 con las 9 filas, una por medio, con su etiqueta y estado", async () => {
        const { status, cuerpo } = await detalle();
        expect(status).toBe(200);
        const d = cuerpo.detalle!;
        expect(d.filas).toHaveLength(9);
        expect(d.filas.map((f) => f.id)).toEqual([
            "web",
            "pwa",
            "macos",
            "windows",
            "linux",
            "android",
            "ios",
            "canales",
            "libreria",
        ]);
        expect(d.filas[0].titulo).toBe("Sitio web oficial");
        expect(d.filas[2].titulo).toBe("macOS");
        expect(d.filas[6].titulo).toBe("iOS");
    });

    it("el resumen incluye versión publicada, versión en curso, fase y último paso", async () => {
        const { cuerpo } = await detalle();
        const d = cuerpo.detalle!;
        expect(d.resumen).toContain("publicada: v0.3.0");
        expect(d.resumen).toContain("en curso: v0.4.0");
        expect(d.resumen).toContain("compilando");
        expect(d.resumen).toContain("compilando v0.4.0 en GitHub");
    });

    it("el tono viene del estado (aviso en este caso)", async () => {
        const { cuerpo } = await detalle();
        expect(cuerpo.detalle?.tono).toBe("aviso");
    });

    it("iOS en no-disponible añade el motivo en la ficha", async () => {
        const { cuerpo } = await detalle();
        const d = cuerpo.detalle!;
        const ios = d.filas.find((f) => f.id === "ios");
        expect(ios?.porque).toContain("no-disponible");
        expect(ios?.porque).toContain("sin cuenta de Apple Developer");
        expect(ios?.ficha?.some((fc) => fc.aviso)).toBe(true);
    });

    it("un medio atascado con archivos faltantes lo muestra en la ficha", async () => {
        const estadoConFaltantes = {
            ...estadoBase,
            medios: {
                ...estadoBase.medios,
                macos: { estado: "atascado", faltan: ["StarSeed.OS_0.4.0_universal.dmg", "StarSeed.OS_0.4.0_universal.app.tar.gz"], pequenos: [] },
            },
        };
        writeFileSync(archivoEstado(), JSON.stringify(estadoConFaltantes));
        const { cuerpo } = await detalle();
        const d = cuerpo.detalle!;
        const macos = d.filas.find((f) => f.id === "macos");
        expect(macos?.estado).toBe("atascado");
        expect(macos?.porque).toContain("faltan: StarSeed.OS_0.4.0_universal.dmg, StarSeed.OS_0.4.0_universal.app.tar.gz");
        expect(macos?.ficha?.some((fc) => fc.etiqueta === "Faltan" && fc.aviso)).toBe(true);
    });

    it("un medio con archivos pequeños lo muestra en la ficha", async () => {
        const estadoConPequenos = {
            ...estadoBase,
            medios: {
                ...estadoBase.medios,
                windows: { estado: "atascado", faltan: [], pequenos: ["StarSeed.OS_0.4.0_x64-setup.exe"] },
            },
        };
        writeFileSync(archivoEstado(), JSON.stringify(estadoConPequenos));
        const { cuerpo } = await detalle();
        const d = cuerpo.detalle!;
        const windows = d.filas.find((f) => f.id === "windows");
        expect(windows?.porque).toContain("pequeños: StarSeed.OS_0.4.0_x64-setup.exe");
        expect(windows?.ficha?.some((fc) => fc.etiqueta === "Tamaño insuficiente" && fc.aviso)).toBe(true);
    });

    it("sin estado del director (archivo ilegible) devuelve aviso y mensaje explicativo", async () => {
        writeFileSync(archivoEstado(), "{ esto no es json");
        const { status, cuerpo } = await detalle();
        expect(status).toBe(200);
        expect(cuerpo.detalle?.filas).toHaveLength(0);
        expect(cuerpo.detalle?.resumen).toBe("sin datos del director de lanzamientos");
        expect(cuerpo.detalle?.aviso).toContain("No se pudo leer el estado de lanzamientos");
        expect(cuerpo.detalle?.vacio).toBe("Sin estado del director de lanzamientos.");
        expect(cuerpo.detalle?.acciones.map((a) => a.clase)).toEqual(["ir-a"]);
        expect(cuerpo.detalle?.acciones[0].destino).toBe("lanzamientos");
    });

    it("la acción siempre lleva al Centro de Versiones", async () => {
        const { cuerpo } = await detalle();
        expect(cuerpo.detalle?.acciones).toHaveLength(1);
        expect(cuerpo.detalle?.acciones[0].clase).toBe("ir-a");
        expect(cuerpo.detalle?.acciones[0].destino).toBe("lanzamientos");
    });
});