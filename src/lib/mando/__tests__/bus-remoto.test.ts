import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as busRemoto from "../bus-remoto";

import {
    REFRESCO_MS,
    estadoBusRemoto,
    filasDelBus,
    filasRecientes,
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
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
    console.log(`BEFORE EACH: STARSEED_NUBE_PAUSADA=${process.env.STARSEED_NUBE_PAUSADA}`);
    reiniciarBusRemoto();
    // Reiniciar el estado de la nube pausada (solo en test)
    if (typeof (globalThis as any).reiniciarEstadoNube === 'function') {
        (globalThis as any).reiniciarEstadoNube();
    }
    // Reset the override for the pause file path
    busRemoto.setOverridePausaFilePath(null);
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
    // Limpiar variable de entorno de pausa
    delete process.env.STARSEED_NUBE_PAUSADA;
    // Reset the override
    busRemoto.setOverridePausaFilePath(null);
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

describe("nube pausada", () => {
    const crearArchivoPausa = async (ruta: string, contenido: object) => {
        console.log(`TEST: creating pause file at ${ruta} with content ${JSON.stringify(contenido)}`);
        const { writeFile } = await import("fs/promises");
        await writeFile(ruta, JSON.stringify(contenido), 'utf-8');
        console.log(`TEST: pause file created at ${ruta}`);
    };

    it("no consulta a Supabase cuando la nube está pausada (hasta: null)", async () => {
        const rutaPausa = "/tmp/nube-pausada.json";
        busRemoto.setOverridePausaFilePath(rutaPausa);
        console.log(`TEST: setting overridePausaFilePath to ${busRemoto.overridePausaFilePath}`);
        await crearArchivoPausa(rutaPausa, { hasta: null });
        console.log(`TEST: after creating pause file, about to call filasDelBus`);

        // Primera carga: debe leer de memoria (vacía inicialmente) y no hacer petición
        const primera = await filasDelBus(AHORA);
        expect(primera).toEqual([]);
        expect(urls).toHaveLength(0); // ninguna petición a Supabase
        expect(estadoBusRemoto(AHORA).motivo).toBe("nube en pausa: el bus remoto no se consulta");

        // Segunda carga dentro de los 180 s: tampoco debe hacer petición
        await filasDelBus(AHORA + 10_000);
        expect(urls).toHaveLength(0);

        // Incluso después de 180 s, todavía no debe hacer petición porque la nube está pausada
        await filasDelBus(AHORA + REFRESCO_MS + 1);
        expect(urls).toHaveLength(0);
    });

    it("no consulta a Supabase cuando la nube está pausada (fecha futura)", async () => {
        const fechaFutura = new Date(AHORA + 60 * 60_000).toISOString(); // 1 hora en el futuro
        const rutaPausa = "/tmp/nube-pausada.json";
        busRemoto.setOverridePausaFilePath(rutaPausa);
        await crearArchivoPausa(rutaPausa, { hasta: fechaFutura });

        const primera = await filasDelBus(AHORA);
        expect(primera).toEqual([]);
        expect(urls).toHaveLength(0);
        expect(estadoBusRemoto(AHORA).motivo).toBe("nube en pausa: el bus remoto no se consulta");
    });

    it("sí consulta a Supabase cuando la nube no está pausada (fecha pasada)", async () => {
        const fechaPasada = new Date(AHORA - 60 * 60_000).toISOString(); // 1 hora en el pasado
        const rutaPausa = "/tmp/nube-pausada.json";
        busRemoto.setOverridePausaFilePath(rutaPausa);
        await crearArchivoPausa(rutaPausa, { hasta: fechaPasada });

        // Simulamos una respuesta exitosa
        respuestas = [{ status: 200, cuerpo: [fila(1, "commit", hace(0))] }];

        const primera = await filasDelBus(AHORA);
        expect(primera.length).toBe(1);
        expect(primera[0].id).toBe(1);
        expect(urls).toHaveLength(1); // se hizo una petición
        expect(estadoBusRemoto(AHORA).motivo).toBeNull(); // no hay motivo de pausa
    });

    it("trata como no pausada si no se puede leer el archivo de pausa", async () => {
        const rutaPausa = "/tmp/archivo-inexistente.json";
        busRemoto.setOverridePausaFilePath(rutaPausa);
        // No creamos el archivo, así que la lectura fallará

        respuestas = [{ status: 200, cuerpo: [fila(1, "commit", hace(0))] }];

        const primera = await filasDelBus(AHORA);
        expect(primera.length).toBe(1);
        expect(urls).toHaveLength(1); // se hizo una petición pese a que la variable de entorno apunta a un archivo que no existe
        expect(estadoBusRemoto(AHORA).motivo).toBeNull();
    });

    it("trata como no pausada si el archivo de pausa tiene JSON inválido", async () => {
        const rutaPausa = "/tmp/nube-pausada.json";
        busRemoto.setOverridePausaFilePath(rutaPausa);
        const { writeFile } = await import("fs/promises");
        await writeFile(rutaPausa, "no es json", 'utf-8');

        respuestas = [{ status: 200, cuerpo: [fila(1, "commit", hace(0))] }];

        const primera = await filasDelBus(AHORA);
        expect(primera.length).toBe(1);
        expect(urls).toHaveLength(1);
        expect(estadoBusRemoto(AHORA).motivo).toBeNull();
    });

    it("dos refreshes seguidos dentro de 180 s hacen una sola ronda (cuando no está pausada)", async () => {
        // Aseguramos que no esté pausada
        busRemoto.setOverridePausaFilePath(null);

        respuestas = [
            { status: 200, cuerpo: [fila(10, "commit", hace(3600_000)), fila(9, "inicio", hace(7200_000))] },
            { status: 200, cuerpo: [fila(11, "arranque", hace(60_000), { cola: "cola-1", tareas: [] })] },
            { status: 200, cuerpo: [fila(12, "latido", hace(30_000))] },
        ];
        const primera = await filasDelBus(AHORA);
        expect(primera.map((f) => f.id)).toEqual([12, 11, 10, 9]);
        expect(urls).toHaveLength(3);

        // Segundo refresh dentro de los 180 s: no debe hacer nuevas peticiones
        await filasDelBus(AHORA + 10_000);
        expect(urls).toHaveLength(3);

        // Tercer refresh después de 180 s: debe hacer una nueva ronda de peticiones
        respuestas = [{ status: 200, cuerpo: [fila(13, "fallo", hace(0))] }];
        const luego = await filasDelBus(AHORA + REFRESCO_MS + 1);
        expect(urls).toHaveLength(4); // 3 iniciales + 1 de la nueva ronda
        expect(luego[0].id).toBe(13);
    });
});