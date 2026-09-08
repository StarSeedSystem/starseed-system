import { afterEach, describe, expect, it, vi } from "vitest";

import { saludPorServidor } from "../voces/diagnostico";

// Tests de `saludPorServidor` (Ola 279 · V9 · 2026-09-08): el diagnóstico y el
// catálogo de motores preguntan la salud del demonio al servidor del OS
// (`/api/voz/salud`) y NO a 127.0.0.1 desde el navegador, que falla con
// «Failed to fetch» (bloqueo de red privada) aunque el demonio esté vivo.
// Por eso aquí se espía que NUNCA se toque 127.0.0.1 cuando la ruta responde,
// y que se cae a la sonda directa solo cuando la ruta no existe o falla.

/** Construye una respuesta `Response` de prueba con un cuerpo JSON. */
function respJson(estado: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), {
        status: estado,
        headers: { "Content-Type": "application/json" },
    });
}

/** El `fetch` global por defecto lanza (nunca se debe usar en estas pruebas). */
const fetchRoto = vi.fn(async () => {
    throw new Error("fetch no debería usarse fuera de lo simulado");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
});

describe("saludPorServidor con la ruta del servidor disponible", () => {
    it("devuelve vivo desde /api/voz/salud y NO toca 127.0.0.1", async () => {
        const urls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
            urls.push(String(url));
            if (String(url) === "/api/voz/salud") {
                return respJson(200, { vivo: true, estado: "vivo", modelo: "x" });
            }
            throw new Error(`URL inesperada: ${String(url)}`);
        }));

        const salud = await saludPorServidor();

        expect(salud.vivo).toBe(true);
        expect(salud.estado).toBe("vivo");
        expect(salud.modelo).toBe("x");
        expect(urls).toContain("/api/voz/salud");
        // Ninguna llamada apuntó al bucle local del demonio.
        expect(urls.some((u) => u.includes("127.0.0.1"))).toBe(false);
    });
});

describe("saludPorServidor con la ruta del servidor caída", () => {
    it("cae a la sonda directa al demonio cuando la ruta responde 404", async () => {
        const directo = {
            vivo: true,
            latenciaMs: 12,
            modelo: "omnivoice-base-Q8_0.gguf · demonio 4444",
            estado: "vivo" as const,
            despertandoDesdeMs: null,
            memoriaLibreMb: null,
        };
        vi.doMock("@/lib/aurora/voz-starseed/daemon", () => ({
            saludDaemon: vi.fn().mockResolvedValue(directo),
        }));
        // Recargar tras el mock: `saludPorServidor` debe usar el `saludDaemon` parcheado.
        const { saludPorServidor: saludPorServidorConMock } = await import("../voces/diagnostico");

        vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
            if (String(url) === "/api/voz/salud") return respJson(404, {});
            throw new Error(`URL inesperada: ${String(url)}`);
        }));

        const salud = await saludPorServidorConMock();

        expect(salud.vivo).toBe(true);
        expect(salud.estado).toBe("vivo");
        expect(salud.modelo).toContain("omnivoice-base-Q8_0");
    });

    it("cae a la sonda directa al demonio cuando la red falla", async () => {
        const directo = { vivo: false, latenciaMs: null, modelo: null, estado: "apagado" as const, despertandoDesdeMs: null, memoriaLibreMb: null };
        vi.doMock("@/lib/aurora/voz-starseed/daemon", () => ({
            saludDaemon: vi.fn().mockResolvedValue(directo),
        }));
        const { saludPorServidor: saludPorServidorConMock } = await import("../voces/diagnostico");

        vi.stubGlobal("fetch", vi.fn(async () => {
            throw new TypeError("Failed to fetch");
        }));

        const salud = await saludPorServidorConMock();

        expect(salud.vivo).toBe(false);
        expect(salud.estado).toBe("apagado");
    });
});

// `fetchRoto` queda declarado para dejar claro el contrato: nada de este módulo
// debería invocar una red real en las pruebas.
void fetchRoto;