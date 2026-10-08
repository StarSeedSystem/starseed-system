/**
 * Destino de la nube de Astraura sin Google Cloud (2026-09-25): la web y la app llegan a la
 * Astraura de la Mac por el túnel que ella publica en Supabase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { destinoFijoAceptable, destinoNube, invalidarDestino, tunelAceptable } from "../destino-nube";

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

    function simular(tunel: string | null, sanos: string[], fijo: string | null = null) {
        const fetchFalso = vi.fn(async (entrada: string | URL) => {
            const url = String(entrada);
            if (url.includes("/rest/v1/astraura_state")) {
                const valor = url.includes("key=eq.destino_fijo") ? fijo : tunel;
                return new Response(JSON.stringify(valor ? [{ data: { url: valor } }] : []), { status: 200 });
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
                const valor = url.includes("key=eq.destino_fijo") ? null : TUNEL;
                return new Response(JSON.stringify(valor ? [{ data: { url: valor } }] : []), { status: 200 });
            }
            if (url === `${MUERTA}/api/status`) return new Response("{}", { status: 200 });
            if (url === `${MUERTA}/api/ping`) return new Response('{"detail":"Not Found"}', { status: 404 });
            if (url === `${TUNEL}/api/ping`) return new Response("{}", { status: 200 });
            return new Response("", { status: 503 });
        }));
        expect(await destinoNube()).toMatchObject({ base: TUNEL, via: "tunel" });
    });

    describe("destino fijo (Oracle Always Free)", () => {
        const FIJO = "https://astraura.132-226-240-1.sslip.io"; // IP de mentira, de ejemplo

        it("un servidor fijo publicado manda antes que el túnel de la Mac", async () => {
            simular(TUNEL, [FIJO, TUNEL], FIJO);
            expect(await destinoNube()).toMatchObject({ base: FIJO, via: "fijo" });
        });

        it("la nube propia (ASTRAURA_CLOUD_URL), sana, sigue delante del fijo", async () => {
            simular(TUNEL, [MUERTA, FIJO, TUNEL], FIJO);
            expect(await destinoNube()).toMatchObject({ base: MUERTA, via: "env" });
        });

        it("sin fijo publicado (o caído) se vuelve al túnel", async () => {
            simular(TUNEL, [TUNEL], "https://astraura.10-0-0-9.sslip.io");
            expect(await destinoNube()).toMatchObject({ base: TUNEL, via: "tunel" });
        });

        it("un fijo publicado inválido se ignora y no se sondea", async () => {
            const fetchFalso = simular(TUNEL, [TUNEL], "https://evil.example.com");
            expect(await destinoNube()).toMatchObject({ base: TUNEL, via: "tunel" });
            expect(fetchFalso.mock.calls.some((c) => String(c[0]).includes("evil.example.com"))).toBe(false);
        });
    });
});

describe("destinoFijoAceptable", () => {
    const SSLIP = "https://astraura.132-226-240-1.sslip.io";

    it("https obligatorio, host de túnel o sslip.io, sin ruta, usuario, consulta ni fragmento", () => {
        expect(destinoFijoAceptable(SSLIP)).toBe(true);
        expect(destinoFijoAceptable(SSLIP + "/")).toBe(true);
        expect(destinoFijoAceptable("https://uno.trycloudflare.com")).toBe(true);
        expect(destinoFijoAceptable("https://mi.nodo.org", ["mi.nodo.org"])).toBe(true);
        expect(destinoFijoAceptable("http://astraura.1-2-3-4.sslip.io")).toBe(false);
        expect(destinoFijoAceptable("https://sslip.io.evil.com")).toBe(false);
        expect(destinoFijoAceptable("https://evil.example.com")).toBe(false);
        expect(destinoFijoAceptable(SSLIP + "/api")).toBe(false);
        expect(destinoFijoAceptable(SSLIP + "?x=1")).toBe(false);
        expect(destinoFijoAceptable(SSLIP + "/#a")).toBe(false);
        expect(destinoFijoAceptable("https://usu:clave@astraura.1-2-3-4.sslip.io")).toBe(false);
        expect(destinoFijoAceptable(null)).toBe(false);
    });
});
