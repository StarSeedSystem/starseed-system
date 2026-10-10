/**
 * MetaGenesis remoto (2026-10-10): la consola fuera de la Mac manda `/api/mando/*` al motor por
 * el túnel, con el token de la sesión y sin cookies. Nada más se reescribe y el token solo va a
 * un motor válido.
 */
import { describe, expect, it, vi } from "vitest";
import {
    abiertoEnLaMac,
    cabecerasConToken,
    crearFetchRemoto,
    hostsExtraDeEntorno,
    leerFilaMotor,
    LATIDO_VIEJO_MS,
    motorUrlValida,
    reescribirUrlMando,
    textoHace,
    veredictoSonda,
    type FilaMotor,
    type ModoRemoto,
} from "../remoto";

const PAGINA = "https://starseed-os.vercel.app";
const MOTOR = "https://ala-bosque-rio.trycloudflare.com";

describe("reescritura de URLs del mando", () => {
    it("lleva /api/mando/* del origen de la página al motor, con su consulta", () => {
        expect(reescribirUrlMando("/api/mando/medidores?clave=agentes", MOTOR, PAGINA)).toBe(`${MOTOR}/api/mando/medidores?clave=agentes`);
        expect(reescribirUrlMando(`${PAGINA}/api/mando/estado`, MOTOR, PAGINA)).toBe(`${MOTOR}/api/mando/estado`);
        expect(reescribirUrlMando("/api/mando", MOTOR, PAGINA)).toBe(`${MOTOR}/api/mando`);
        expect(reescribirUrlMando("/api/mando/agentes/a%2Fb/log", `${MOTOR}/`, PAGINA)).toBe(`${MOTOR}/api/mando/agentes/a%2Fb/log`);
    });

    it("no toca otras rutas, otros orígenes ni intentos de salirse con ..", () => {
        expect(reescribirUrlMando("/api/ai/openrouter", MOTOR, PAGINA)).toBeNull();
        expect(reescribirUrlMando("/api/mandos/x", MOTOR, PAGINA)).toBeNull();
        expect(reescribirUrlMando("https://otra.web/api/mando/estado", MOTOR, PAGINA)).toBeNull();
        expect(reescribirUrlMando("/api/mando/../ai/openrouter", MOTOR, PAGINA)).toBeNull();
        expect(reescribirUrlMando("/genesis", MOTOR, PAGINA)).toBeNull();
    });
});

describe("URL del motor", () => {
    it("solo https de *.trycloudflare.com, sin ruta, puerto ni usuario", () => {
        expect(motorUrlValida(MOTOR)).toBe(MOTOR);
        expect(motorUrlValida(`${MOTOR}/`)).toBe(MOTOR);
        expect(motorUrlValida("http://ala.trycloudflare.com")).toBeNull();
        expect(motorUrlValida("https://ala.trycloudflare.com/api")).toBeNull();
        expect(motorUrlValida("https://ala.trycloudflare.com:8443")).toBeNull();
        expect(motorUrlValida("https://yo:clave@ala.trycloudflare.com")).toBeNull();
        expect(motorUrlValida("https://trycloudflare.com.malo.net")).toBeNull();
        expect(motorUrlValida("https://a.b.trycloudflare.com")).toBeNull();
        expect(motorUrlValida("https://evil.example.com")).toBeNull();
        expect(motorUrlValida(null)).toBeNull();
    });

    it("admite hosts extra declarados y el propio origen de la página", () => {
        expect(motorUrlValida("https://motor.starseed.example", { hostsExtra: ["motor.starseed.example"] })).toBe("https://motor.starseed.example");
        expect(motorUrlValida("http://192.168.1.5:9002", { origenPagina: "http://192.168.1.5:9002" })).toBe("http://192.168.1.5:9002");
        expect(hostsExtraDeEntorno(" Motor.Starseed.example , mal formado,") ).toEqual(["motor.starseed.example"]);
    });

    it("la página abierta en la Mac se reconoce por el bucle local", () => {
        expect(abiertoEnLaMac("localhost")).toBe(true);
        expect(abiertoEnLaMac("127.0.0.1")).toBe(true);
        expect(abiertoEnLaMac("starseed-os.vercel.app")).toBe(false);
        expect(abiertoEnLaMac("192.168.1.5")).toBe(false);
    });
});

describe("cabecera del token", () => {
    it("pone Authorization: Bearer y sustituye cualquier otra", () => {
        const h = cabecerasConToken({ "Content-Type": "application/json", Authorization: "Bearer viejo" }, "nuevo-token");
        expect(h.get("authorization")).toBe("Bearer nuevo-token");
        expect(h.get("content-type")).toBe("application/json");
        expect(cabecerasConToken(undefined, null).has("authorization")).toBe(false);
    });
});

function fetchFalso(respuestas: number[] = [200]) {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        llamadas.push({ url: String(input instanceof Request ? input.url : input), init: init ?? {} });
        return new Response("{}", { status: respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)] });
    });
    return { f: f as unknown as typeof fetch, llamadas };
}

describe("fetch en modo remoto", () => {
    const modo = (token = "token-uno"): ModoRemoto => ({ base: MOTOR, token: vi.fn(async (forzar?: boolean) => (forzar ? "token-dos" : token)) });

    it("sin modo remoto es el fetch de siempre", async () => {
        const { f, llamadas } = fetchFalso();
        const g = crearFetchRemoto(f, () => null, () => PAGINA);
        await g("/api/mando/estado");
        expect(llamadas[0]!.url).toBe("/api/mando/estado");
    });

    it("GET y POST de /api/mando van al motor con el token y sin cookies", async () => {
        const { f, llamadas } = fetchFalso();
        const g = crearFetchRemoto(f, () => modo(), () => PAGINA);
        await g("/api/mando/medidores?clave=tokens", { cache: "no-store" });
        await g("/api/mando/reintentar", { method: "POST", body: JSON.stringify({ ids: ["a"] }), headers: { "Content-Type": "application/json" } });
        expect(llamadas.map((l) => l.url)).toEqual([`${MOTOR}/api/mando/medidores?clave=tokens`, `${MOTOR}/api/mando/reintentar`]);
        for (const l of llamadas) {
            expect(new Headers(l.init.headers).get("authorization")).toBe("Bearer token-uno");
            expect(l.init.credentials).toBe("omit");
        }
        expect(new Headers(llamadas[1]!.init.headers).get("content-type")).toBe("application/json");
        expect(llamadas[1]!.init.method).toBe("POST");
    });

    it("otras rutas pasan intactas y sin token", async () => {
        const { f, llamadas } = fetchFalso();
        const g = crearFetchRemoto(f, () => modo(), () => PAGINA);
        await g("/api/ai/openrouter", { method: "POST", body: "{}" });
        expect(llamadas[0]!.url).toBe("/api/ai/openrouter");
        expect(new Headers(llamadas[0]!.init.headers).has("authorization")).toBe(false);
    });

    it("un Request del mando se desarma y viaja al motor con su método y cuerpo", async () => {
        const { f, llamadas } = fetchFalso();
        const g = crearFetchRemoto(f, () => modo(), () => PAGINA);
        await g(new Request(`${PAGINA}/api/mando/colas`, { method: "PUT", body: "hola" }));
        expect(llamadas[0]!.url).toBe(`${MOTOR}/api/mando/colas`);
        expect(llamadas[0]!.init.method).toBe("PUT");
        expect(new TextDecoder().decode(llamadas[0]!.init.body as ArrayBuffer)).toBe("hola");
    });

    it("tras un 401 renueva el token y reintenta UNA vez", async () => {
        const { f, llamadas } = fetchFalso([401, 200]);
        const m = modo();
        const g = crearFetchRemoto(f, () => m, () => PAGINA);
        const r = await g("/api/mando/estado");
        expect(r.status).toBe(200);
        expect(llamadas).toHaveLength(2);
        expect(new Headers(llamadas[1]!.init.headers).get("authorization")).toBe("Bearer token-dos");
    });

    it("en el mismo origen (la Mac sirve la página) no se quitan las cookies", async () => {
        const { f, llamadas } = fetchFalso();
        const g = crearFetchRemoto(f, () => ({ base: "http://192.168.1.5:9002", token: async () => "t" }), () => "http://192.168.1.5:9002");
        await g("/api/mando/estado");
        expect(llamadas[0]!.url).toBe("http://192.168.1.5:9002/api/mando/estado");
        expect(llamadas[0]!.init.credentials).toBeUndefined();
    });
});

describe("fila del motor y sonda", () => {
    const AHORA = Date.parse("2026-10-10T12:00:00Z");
    const fila = (cambios: Partial<FilaMotor> = {}): FilaMotor => ({
        url: MOTOR,
        encendido: true,
        ultimo_latido: new Date(AHORA - 30_000).toISOString(),
        arrancado_en: new Date(AHORA - 3_600_000).toISOString(),
        maquina: "Mac-de-Alex",
        motivo: null,
        ...cambios,
    });

    it("latido reciente y URL válida → merece sondear", () => {
        expect(leerFilaMotor(fila(), AHORA)).toEqual({ prometedora: true, latidoHaceMs: 30_000, motivo: "" });
    });

    it("apagada, sin fila, URL extraña o latido viejo → dice por qué y cuánto hace", () => {
        expect(leerFilaMotor(null, AHORA).prometedora).toBe(false);
        expect(leerFilaMotor(fila({ encendido: false, url: null, motivo: "la Mac paró el túnel" }), AHORA).motivo).toBe("la Mac paró el túnel");
        expect(leerFilaMotor(fila({ url: "https://evil.example.com" }), AHORA).prometedora).toBe(false);
        const vieja = leerFilaMotor(fila({ ultimo_latido: new Date(AHORA - LATIDO_VIEJO_MS - 1).toISOString() }), AHORA);
        expect(vieja.prometedora).toBe(false);
        expect(vieja.latidoHaceMs).toBe(LATIDO_VIEJO_MS + 1);
    });

    it("textos de «hace»", () => {
        expect(textoHace(null)).toBe("nunca");
        expect(textoHace(12_000)).toBe("hace 12 s");
        expect(textoHace(3 * 60_000)).toBe("hace 3 min");
        expect(textoHace(2 * 3_600_000)).toBe("hace 2 h");
        expect(textoHace(4 * 86_400_000)).toBe("hace 4 días");
    });

    it("veredicto de la sonda por código", () => {
        expect(veredictoSonda(200)).toEqual({ ok: true });
        expect(veredictoSonda(401)).toMatchObject({ ok: false, tipo: "rechazado" });
        expect(veredictoSonda(403)).toMatchObject({ ok: false, tipo: "rechazado" });
        expect(veredictoSonda(404)).toMatchObject({ ok: false, tipo: "no-es-motor" });
        expect(veredictoSonda(530)).toMatchObject({ ok: false, tipo: "sin-respuesta" });
        expect(veredictoSonda(null)).toMatchObject({ ok: false, tipo: "sin-respuesta" });
    });
});
