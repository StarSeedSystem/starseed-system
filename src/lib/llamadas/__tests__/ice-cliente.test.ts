/**
 * El navegador pide `/api/llamadas/ice` una vez por llamada, lo guarda en memoria hasta que
 * caducan las credenciales y, si falla, sigue solo con STUN. Y la ruta GET: sin caché, con
 * límite por IP y cerrada a otras webs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __olvidarIce, AVISO_SIN_TURN, obtenerIceServidores, RUTA_ICE, STUN_POR_DEFECTO } from "@/lib/llamadas/ice";

function respuesta(status: number, cuerpo: unknown): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => cuerpo } as unknown as Response;
}

const TURN = { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" };

beforeEach(() => __olvidarIce());

describe("obtenerIceServidores", () => {
    it("pide la ruta del OS sin caché y devuelve TURN + STUN con su fuente", async () => {
        const f = vi.fn(async () => respuesta(200, { iceServers: [TURN], fuente: "cloudflare", ttl: 86400 }));
        const r = await obtenerIceServidores({ fetch: f as unknown as typeof fetch });
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(RUTA_ICE);
        expect(init.cache).toBe("no-store");
        expect(init.credentials).toBe("same-origin");
        expect(r.turn).toBe(true);
        expect(r.fuente).toBe("cloudflare");
        expect(r.iceServers.slice(0, 2)).toEqual(STUN_POR_DEFECTO);
        expect(r.iceServers.at(-1)).toEqual({ urls: TURN.urls[0], username: "u", credential: "c" });
    });

    it("una vez por llamada: se guarda hasta un minuto antes del ttl y peticiones simultáneas comparten una", async () => {
        let ahora = 1_000_000;
        const f = vi.fn(async () => respuesta(200, { iceServers: [TURN], fuente: "metered", ttl: 600 }));
        const [a, b] = await Promise.all([
            obtenerIceServidores({ fetch: f as unknown as typeof fetch, ahora: () => ahora }),
            obtenerIceServidores({ fetch: f as unknown as typeof fetch, ahora: () => ahora }),
        ]);
        expect(a).toBe(b);
        expect(f).toHaveBeenCalledTimes(1);
        ahora += 530_000; // 600 s − 60 s de margen = 540 s
        await obtenerIceServidores({ fetch: f as unknown as typeof fetch, ahora: () => ahora });
        expect(f).toHaveBeenCalledTimes(1);
        ahora += 20_000;
        await obtenerIceServidores({ fetch: f as unknown as typeof fetch, ahora: () => ahora });
        expect(f).toHaveBeenCalledTimes(2);
    });

    it("si la ruta falla o responde mal, solo STUN (y no se guarda el fallo)", async () => {
        const falla = vi.fn(async () => {
            throw new Error("sin red");
        });
        const r = await obtenerIceServidores({ fetch: falla as unknown as typeof fetch });
        expect(r).toEqual({ iceServers: STUN_POR_DEFECTO, turn: false, fuente: "stun" });
        const e500 = vi.fn(async () => respuesta(500, {}));
        expect((await obtenerIceServidores({ fetch: e500 as unknown as typeof fetch })).turn).toBe(false);
        const basura = vi.fn(async () => respuesta(200, { iceServers: [{ urls: "turn:x.org" }], fuente: "inventada" }));
        const r3 = await obtenerIceServidores({ fetch: basura as unknown as typeof fetch });
        expect(r3.turn).toBe(false);
        expect(r3.fuente).toBe("stun");
        expect(falla).toHaveBeenCalledTimes(1);
        expect(e500).toHaveBeenCalledTimes(1);
    });

    it("corta si tarda demasiado", async () => {
        const lenta = vi.fn(
            (_u: string, init: RequestInit) =>
                new Promise<Response>((_ok, ko) => init.signal?.addEventListener("abort", () => ko(new Error("abort")))),
        );
        const r = await obtenerIceServidores({ fetch: lenta as unknown as typeof fetch, timeoutMs: 10 });
        expect(r.turn).toBe(false);
    });

    it("el aviso honesto sin TURN es exactamente el acordado", () => {
        expect(AVISO_SIN_TURN).toBe("Sin servidor de retransmisión: en redes muy cerradas puede no conectar.");
    });
});

describe("GET /api/llamadas/ice", () => {
    const fetchOriginal = globalThis.fetch;
    afterEach(() => {
        vi.unstubAllEnvs();
        globalThis.fetch = fetchOriginal;
    });

    async function pedir(cabeceras: Record<string, string> = {}) {
        const { GET } = await import("@/app/api/llamadas/ice/route");
        const { NextRequest } = await import("next/server");
        return GET(new NextRequest("https://os.example/api/llamadas/ice", { headers: cabeceras }));
    }

    it("sin proveedor: STUN, sin caché", async () => {
        vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "");
        vi.stubEnv("METERED_TURN_DOMAIN", "");
        vi.stubEnv("TURN_URL", "");
        vi.stubEnv("NEXT_PUBLIC_TURN_URL", "");
        vi.stubEnv("TURN_SECRET", "");
        vi.stubEnv("TURN_URLS", "");
        const r = await pedir({ "x-forwarded-for": "10.0.0.1", "sec-fetch-site": "same-origin" });
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toMatch(/no-store/);
        const j = await r.json();
        expect(j).toEqual({ iceServers: STUN_POR_DEFECTO, fuente: "stun", ttl: 300 });
    });

    it("con coturn propio (REST): credencial temporal, caché privada de 5 min y nunca el secreto", async () => {
        const secreto = "secreto-" + "de-prueba-coturn";
        vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "");
        vi.stubEnv("METERED_TURN_DOMAIN", "");
        vi.stubEnv("TURN_SECRET", secreto);
        vi.stubEnv("TURN_URLS", "turn:turn.example.org:3478");
        const r = await pedir({ "x-forwarded-for": "10.0.0.9", "sec-fetch-site": "same-origin" });
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toBe("private, max-age=300");
        const texto = JSON.stringify(await r.json());
        expect(texto).toContain('"fuente":"rest"');
        expect(texto).toContain("turn:turn.example.org:3478");
        expect(texto).not.toContain(secreto);
    });

    it("con Cloudflare configurado devuelve sus credenciales temporales (nunca el token)", async () => {
        vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "cf_key_0123456789");
        vi.stubEnv("CLOUDFLARE_TURN_KEY_API_TOKEN", "secreto-de-servidor");
        globalThis.fetch = vi.fn(async () => respuesta(201, { iceServers: [TURN] })) as unknown as typeof fetch;
        const r = await pedir({ "x-forwarded-for": "10.0.0.2" });
        const texto = JSON.stringify(await r.json());
        expect(texto).toContain("turn:turn.cloudflare.com");
        expect(texto).toContain('"fuente":"cloudflare"');
        expect(texto).not.toContain("secreto-de-servidor");
    });

    it("otras webs: 403; demasiadas seguidas desde una IP: 429 con Retry-After", async () => {
        expect((await pedir({ "sec-fetch-site": "cross-site", "x-forwarded-for": "10.0.0.3" })).status).toBe(403);
        vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "");
        let ultima: Response | null = null;
        for (let i = 0; i < 21; i++) ultima = await pedir({ "x-forwarded-for": "10.0.0.9" });
        expect(ultima?.status).toBe(429);
        expect(ultima?.headers.get("retry-after")).toBeTruthy();
    });
});
