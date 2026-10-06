import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    REFRESCO_MS,
    estadoBusRemoto,
    filasDelBus,
    filasRecientes,
    nubeEnPausa,
    pausaPorEstado,
    reiniciarBusRemoto,
} from "../bus-remoto";

const AHORA = Date.parse("2026-09-25T12:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

function fila(id: number, tipo: string, t: string, datos: unknown = {}) {
    return { id, t, quien: "enjambre", tipo, tarea: "P1", texto: tipo, datos };
}

let urls: string[] = [];
let respuestas: Array<{ status: number; cuerpo: unknown }> = [];
let dirPausa = "";
const fetchOriginal = globalThis.fetch;

/** La nube NO pausada: la variable apunta a un archivo que no existe. */
function sinPausa(): void {
    process.env.STARSEED_NUBE_PAUSADA = join(dirPausa, "no-existe.json");
}

/** Escribe el archivo de pausa con el contenido dado y apunta la variable a él. */
async function conPausa(contenido: Record<string, unknown>): Promise<string> {
    const ruta = join(dirPausa, "nube-pausada.json");
    await writeFile(ruta, JSON.stringify(contenido), "utf8");
    process.env.STARSEED_NUBE_PAUSADA = ruta;
    return ruta;
}

beforeEach(() => {
    dirPausa = mkdtempSync(join(tmpdir(), "bus-remoto-"));
    sinPausa();
    reiniciarBusRemoto();
    urls = [];
    respuestas = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-publica-de-prueba";
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL) => {
        urls.push(String(entrada));
        const r = respuestas.shift() ?? { status: 200, cuerpo: [] };
        return new Response(JSON.stringify(r.cuerpo), { status: r.status });
    }) as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = fetchOriginal;
    delete process.env.STARSEED_NUBE_PAUSADA;
    rmSync(dirPausa, { recursive: true, force: true });
});

describe("bus remoto con dieta de tráfico", () => {
    it("carga una vez (acotada) y después solo pide lo nuevo, cada ≥ 180 s", async () => {
        respuestas = [
            { status: 200, cuerpo: [fila(10, "commit", hace(3600_000)), fila(9, "inicio", hace(7200_000))] },
            { status: 200, cuerpo: [fila(11, "arranque", hace(60_000), { cola: "cola-1", tareas: [] })] },
            { status: 200, cuerpo: [fila(12, "latido", hace(30_000))] },
        ];
        const primera = await filasDelBus(AHORA);
        expect(primera.map((f) => f.id)).toEqual([12, 11, 10, 9]);
        expect(urls).toHaveLength(3);
        expect(urls[0]).toContain("tipo=not.in.(latido,tunel,arranque)");
        expect(urls[1]).toContain("tipo=eq.arranque");
        expect(urls[2]).toContain("tipo=eq.latido");

        await filasDelBus(AHORA + 10_000);
        expect(urls).toHaveLength(3); // dentro de los 180 s: ni una petición

        respuestas = [{ status: 200, cuerpo: [fila(13, "fallo", hace(0))] }];
        const luego = await filasDelBus(AHORA + REFRESCO_MS + 1);
        expect(urls).toHaveLength(4);
        expect(urls[3]).toContain("id=gt.12");
        expect(luego[0].id).toBe(13);
    });

    it("con Supabase restringido (402) deja de preguntar 30 min y sirve lo que tiene", async () => {
        respuestas = [{ status: 402, cuerpo: { message: "restricted" } }];
        expect(await filasDelBus(AHORA)).toEqual([]);
        expect(estadoBusRemoto(AHORA).pausadoHasta).toBe(AHORA + 30 * 60_000);
        await filasDelBus(AHORA + 10 * 60_000);
        await filasDelBus(AHORA + 29 * 60_000);
        expect(urls).toHaveLength(1);
        expect(estadoBusRemoto(AHORA).motivo).toMatch(/402/);
    });

    it("varias rutas a la vez comparten una sola petición", async () => {
        await Promise.all([filasDelBus(AHORA), filasDelBus(AHORA), filasRecientes(null, 3600_000, AHORA)]);
        expect(urls).toHaveLength(3); // la carga inicial, una sola vez
    });

    it("filtra por tipo y antigüedad y olvida latidos viejos", async () => {
        respuestas = [
            { status: 200, cuerpo: [fila(3, "commit", hace(5 * 3600_000)), fila(2, "aviso", hace(60_000))] },
            { status: 200, cuerpo: [] },
            { status: 200, cuerpo: [fila(4, "latido", hace(20 * 60_000))] },
        ];
        const avisos = await filasRecientes(["aviso", "commit"], 3600_000, AHORA);
        expect(avisos.map((f) => f.id)).toEqual([2]);
        expect((await filasDelBus(AHORA)).some((f) => f.tipo === "latido")).toBe(false);
    });

    it("pausas: 402 → 30 min, 429/5xx → 5 min, sin red → 2 min, bien → 0", () => {
        expect(pausaPorEstado(402)).toBe(30 * 60_000);
        expect(pausaPorEstado(429)).toBe(5 * 60_000);
        expect(pausaPorEstado(503)).toBe(5 * 60_000);
        expect(pausaPorEstado("red")).toBe(2 * 60_000);
        expect(pausaPorEstado(200)).toBe(0);
    });
});

describe("nube en pausa", () => {
    it("con pausa (hasta: null) no pregunta a Supabase y sirve lo que hay", async () => {
        await conPausa({ hasta: null });
        respuestas = [{ status: 200, cuerpo: [fila(10, "commit", hace(3600_000))] }];
        expect(await filasDelBus(AHORA)).toEqual([]);
        expect(urls).toHaveLength(0);
        expect(estadoBusRemoto(AHORA).motivo).toBe("nube en pausa: el bus remoto no se consulta");
        // ni aunque pase el refresco de 180 s
        await filasDelBus(AHORA + REFRESCO_MS + 10_000);
        expect(urls).toHaveLength(0);
    });

    it("con pausa con fecha futura tampoco pregunta", async () => {
        await conPausa({ hasta: new Date(AHORA + 3600_000).toISOString() });
        await filasDelBus(AHORA);
        expect(urls).toHaveLength(0);
        expect(await nubeEnPausa(AHORA)).toBe(true);
    });

    it("sin archivo, con fecha pasada o ilegible sí pregunta", async () => {
        expect(await nubeEnPausa(AHORA)).toBe(false); // sin archivo
        respuestas = [
            { status: 200, cuerpo: [fila(10, "commit", hace(3600_000))] },
            { status: 200, cuerpo: [] },
            { status: 200, cuerpo: [] },
        ];
        const primera = await filasDelBus(AHORA);
        expect(urls).toHaveLength(3);
        expect(primera.map((f) => f.id)).toEqual([10]);

        reiniciarBusRemoto();
        await conPausa({ hasta: new Date(AHORA - 1000).toISOString() }); // fecha pasada
        expect(await nubeEnPausa(AHORA)).toBe(false);

        reiniciarBusRemoto();
        await conPausa({ hasta: "no es una fecha" });
        expect(await nubeEnPausa(AHORA)).toBe(false);

        reiniciarBusRemoto();
        const ruta = join(dirPausa, "nube-pausada.json");
        await writeFile(ruta, "{ json roto", "utf8");
        process.env.STARSEED_NUBE_PAUSADA = ruta;
        expect(await nubeEnPausa(AHORA)).toBe(false);
    });

    it("la pausa se cachea 60 s: quitar el archivo no se nota al instante", async () => {
        await conPausa({ hasta: null });
        expect(await nubeEnPausa(AHORA)).toBe(true);
        rmSync(process.env.STARSEED_NUBE_PAUSADA as string, { force: true });
        expect(await nubeEnPausa(AHORA + 30_000)).toBe(true); // dentro de la caché
        expect(await nubeEnPausa(AHORA + 61_000)).toBe(false); // caché caducada
    });
});
