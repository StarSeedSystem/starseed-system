/**
 * Destino de la nube de Astraura sin Google Cloud (2026-09-25): la web y la app llegan a la
 * Astraura de la Mac por el túnel que ella publica en Supabase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { destinoNube, invalidarDestino, tunelAceptable } from "../destino-nube";

const TUNEL = "https://uno-dos-tres.trycloudflare.com";
const MUERTA = "https://astraura-muerta.run.app";

describe("tunelAceptable", () => {
    it("solo https de Cloudflare (o hosts permitidos), sin ruta ni consulta", () => {
        expect(tunelAceptable(TUNEL)).toBe(true);
        expect(tunelAceptable(TUNEL + "/")).toBe(true);
        expect(tunelAceptable("http://uno.trycloudflare.com")).toBe(false);
        expect(tunelAceptable("https://evil.example.com")).toBe(false);
        expect(tunelAceptable("https://trycloudflare.com.evil.com")).toBe(false);
        expect(tunelAceptable(TUNEL + "/api")).toBe(false);
        expect(tunelAceptable(TUNEL + "?x=1")).toBe(false);
        expect(tunelAceptable("https://mi.nodo.org", ["mi.nodo.org"])).toBe(true);
        expect(tunelAceptable(null)).toBe(false);
    });
});

describe("destinoNube", () => {
    const entorno = { ...process.env };

    beforeEach(() => {
        invalidarDestino();
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
        process.env.ASTRAURA_CLOUD_URL = MUERTA;
        process.env.ASTRAURA_158_URL = MUERTA;
    });

    afterEach(() => {
        process.env = { ...entorno };
        vi.unstubAllGlobals();
        invalidarDestino();
    });

    function simular(tunel: string | null, sanos: string[]) {
        const fetchFalso = vi.fn(async (entrada: string | URL) => {
            const url = String(entrada);
            if (url.includes("/rest/v1/astraura_state")) {
                return new Response(JSON.stringify(tunel ? [{ data: { url: tunel } }] : []), { status: 200 });
            }
            const base = url.replace(/\/api\/(status|ping)$/, "");
            return new Response("{}", { status: sanos.includes(base) ? 200 : 503 });
        });
        vi.stubGlobal("fetch", fetchFalso);
        return fetchFalso;
    }

    it("con la nube de Google caída, usa el túnel publicado por la Mac", async () => {
        simular(TUNEL, [TUNEL]);
        expect(await destinoNube()).toMatchObject({ base: TUNEL, via: "tunel" });
    });

    it("la nube propia, si está sana, sigue mandando", async () => {
        simular(TUNEL, [MUERTA, TUNEL]);
        expect(await destinoNube()).toMatchObject({ base: MUERTA, via: "env" });
    });

    it("un túnel publicado con host no permitido se ignora", async () => {
        simular("https://evil.example.com", ["https://evil.example.com"]);
        expect(await destinoNube()).toBeNull();
    });

    it("sin nada sano devuelve null y no lanza", async () => {
        simular(null, []);
        expect(await destinoNube()).toBeNull();
    });

    it("(G2 · 2026-09-26) sin ninguna variable de entorno declarada, NO hay upstream de Cloud Run por defecto: null sin sondear nada fijo", async () => {
        delete process.env.ASTRAURA_CLOUD_URL;
        delete process.env.ASTRAURA_158_URL;
        const fetchFalso = simular(null, []); // sin túnel publicado tampoco
        expect(await destinoNube()).toBeNull();
        // La ÚNICA llamada debe ser la lectura de Supabase (`astraura_state`):
        // cero candidatos → cero sondas de salud. Antes había un candidato fijo
        // de Cloud Run que SIEMPRE se sondeaba, muerto o no.
        const llamadas = fetchFalso.mock.calls.map((c) => String(c[0]));
        expect(llamadas.some((u) => u.includes("astraura_state"))).toBe(true);
        expect(llamadas.some((u) => u.endsWith("/api/ping") || u.endsWith("/api/status"))).toBe(false);
        expect(llamadas.some((u) => u.includes("run.app"))).toBe(false);
    });

    it("(G2) caché NULO se reintenta a los ~10s, no al minuto entero", async () => {
        vi.useFakeTimers();
        try {
            delete process.env.ASTRAURA_CLOUD_URL;
            delete process.env.ASTRAURA_158_URL;
            const fetchFalso = simular(null, []);
            expect(await destinoNube()).toBeNull();
            const llamadasTrasPrimera = fetchFalso.mock.calls.length;
            // Aún dentro de los 10 s: caché nulo sigue vigente, no vuelve a sondear.
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await destinoNube()).toBeNull();
            expect(fetchFalso.mock.calls.length).toBe(llamadasTrasPrimera);
            // Pasados los 10 s: vuelve a sondear (nueva llamada a Supabase).
            await vi.advanceTimersByTimeAsync(6_000);
            expect(await destinoNube()).toBeNull();
            expect(fetchFalso.mock.calls.length).toBeGreaterThan(llamadasTrasPrimera);
        } finally {
            vi.useRealTimers();
        }
    });

    it("un destino que responde /api/status pero no /api/ping (no es un backend completo) no se elige", async () => {
        // 25-09: el destino de nube de producción daba 200 en /api/status y 404 en /api/ping y
        // en todas las rutas de chat; se elegía y cada mensaje terminaba en 404.
        vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => {
            const url = String(entrada);
            if (url.includes("/rest/v1/astraura_state")) {
                return new Response(JSON.stringify([{ data: { url: TUNEL } }]), { status: 200 });
            }
            if (url === `${MUERTA}/api/status`) return new Response("{}", { status: 200 });
            if (url === `${MUERTA}/api/ping`) return new Response('{"detail":"Not Found"}', { status: 404 });
            if (url === `${TUNEL}/api/ping`) return new Response("{}", { status: 200 });
            return new Response("", { status: 503 });
        }));
        expect(await destinoNube()).toMatchObject({ base: TUNEL, via: "tunel" });
    });
});
