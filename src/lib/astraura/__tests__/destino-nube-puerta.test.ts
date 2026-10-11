/**
 * Destino de la nube por la puerta de datos del A1 (PDA1012 · fase 2, §10.1.5 del contrato): el
 * servidor de Next lee `destino_fijo` y `tunel_publico` de la puerta (ficha `astraura`) y solo va a
 * `astraura_state` en Supabase si la puerta no está, no responde o aún no lo tiene. Fallan si se
 * desconecta la puerta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { destinoNube, invalidarDestino, publicadoEnLaPuerta, tunelAceptable } from "../destino-nube";

const TUNEL = "https://uno-dos-tres.trycloudflare.com";
const FIJO = "https://astraura.1-2-3-4.sslip.io";
const PUERTA = "https://datos.prueba.example";
const FICHA = ["pd", "_", "x".repeat(43)].join("");

describe("destino de la nube por la puerta de datos", () => {
    const entorno = { ...process.env };
    let lecturasSupabase = 0;
    let lecturasPuerta: string[] = [];
    let cabeceras: Record<string, string>[] = [];

    function simular(opciones: { puerta: Record<string, string | null | 404>; supabase: Record<string, string | null>; sanos: string[] }) {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (entrada: string | URL, init?: RequestInit) => {
                const url = String(entrada);
                if (url.startsWith(PUERTA)) {
                    lecturasPuerta.push(url);
                    cabeceras.push((init?.headers ?? {}) as Record<string, string>);
                    const clave = url.split("/").pop() ?? "";
                    const v = opciones.puerta[clave];
                    if (v === 404 || v === undefined) return new Response(JSON.stringify({ error: "sin estado publicado" }), { status: 404 });
                    return new Response(JSON.stringify({ clave, data: { url: v }, updated_at: new Date().toISOString() }), { status: 200 });
                }
                if (url.includes("/rest/v1/astraura_state")) {
                    lecturasSupabase++;
                    const clave = url.includes("key=eq.destino_fijo") ? "destino_fijo" : "tunel_publico";
                    const v = opciones.supabase[clave];
                    return new Response(JSON.stringify(v ? [{ data: { url: v } }] : []), { status: 200 });
                }
                const base = url.replace(/\/api\/(status|ping)$/, "");
                return new Response("{}", { status: opciones.sanos.includes(base) ? 200 : 503 });
            }),
        );
    }

    beforeEach(() => {
        invalidarDestino();
        lecturasSupabase = 0;
        lecturasPuerta = [];
        cabeceras = [];
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
        delete process.env.ASTRAURA_CLOUD_URL;
        delete process.env.ASTRAURA_158_URL;
        process.env.PUERTA_DATOS_URL = PUERTA;
        process.env.PUERTA_DATOS_FICHA_ASTRAURA = FICHA;
    });

    afterEach(() => {
        process.env = { ...entorno };
        vi.unstubAllGlobals();
        invalidarDestino();
    });

    it("con la puerta sana, el destino sale de la puerta y astraura_state no se lee", async () => {
        simular({ puerta: { destino_fijo: FIJO, tunel_publico: TUNEL }, supabase: {}, sanos: [FIJO, TUNEL] });
        const d = await destinoNube();
        expect(d?.base).toBe(FIJO);
        expect(d?.via).toBe("fijo");
        expect(lecturasPuerta).toHaveLength(2);
        expect(lecturasSupabase).toBe(0);
        // La ficha viaja como Bearer; nunca en la URL.
        expect(cabeceras[0].Authorization).toBe(`Bearer ${FICHA}`);
        expect(lecturasPuerta.every((u) => !u.includes(FICHA))).toBe(true);
    });

    it("lo retirado en la puerta (url null) cuenta como retirado: no se pregunta a Supabase", async () => {
        simular({ puerta: { destino_fijo: null, tunel_publico: TUNEL }, supabase: { destino_fijo: FIJO }, sanos: [FIJO, TUNEL] });
        const d = await destinoNube();
        expect(d?.base).toBe(TUNEL);
        expect(lecturasSupabase).toBe(0);
    });

    it("si la puerta aún no lo tiene (404) o no responde, se lee Supabase como antes", async () => {
        simular({ puerta: { destino_fijo: 404, tunel_publico: 404 }, supabase: { tunel_publico: TUNEL }, sanos: [TUNEL] });
        const d = await destinoNube();
        expect(d?.base).toBe(TUNEL);
        expect(lecturasSupabase).toBe(2);
    });

    it("sin PUERTA_DATOS_URL (Vercel) ni ficha, nada cambia: Supabase", async () => {
        delete process.env.PUERTA_DATOS_URL;
        simular({ puerta: {}, supabase: { tunel_publico: TUNEL }, sanos: [TUNEL] });
        const d = await destinoNube();
        expect(d?.base).toBe(TUNEL);
        expect(lecturasPuerta).toHaveLength(0);
        expect(lecturasSupabase).toBe(2);
    });

    it("una URL de puerta que no es https no se usa", async () => {
        process.env.PUERTA_DATOS_URL = "http://datos.prueba.example";
        expect(await publicadoEnLaPuerta("tunel_publico", tunelAceptable)).toEqual({ hay: false });
    });

    it("lo que diga la puerta pasa la misma lista blanca", async () => {
        simular({ puerta: { tunel_publico: "https://evil.example.com" }, supabase: {}, sanos: [] });
        expect(await publicadoEnLaPuerta("tunel_publico", tunelAceptable)).toEqual({ hay: true, url: null });
    });
});
