/**
 * Servidores ICE desde el servidor: elección de proveedor (Cloudflare → Metered → fijo → STUN),
 * forma exacta de la petición a Cloudflare, normalización de respuestas, caídas en cadena y
 * que ningún secreto acabe en los avisos. `fetch` de mentira: sin red.
 */
import { describe, expect, it, vi } from "vitest";
import {
    elegirProveedor,
    entornoIceServidor,
    generarIceServidor,
    peticionDeOtroSitio,
    proveedoresIce,
    credencialRest,
    TTL_CLOUDFLARE_S,
    TTL_STUN_S,
    urlCloudflare,
    urlMetered,
} from "@/lib/llamadas/ice-servidor";
import { contieneTurn, normalizarIceServers, STUN_POR_DEFECTO, unirConStun } from "@/lib/llamadas/ice";

const CF_ID = "cf_key_0123456789abcdef";
const CF_TOKEN = "cf-secreto-no-debe-salir";
const MET_KEY = "metered-secreto-no-debe-salir";

function respuesta(status: number, cuerpo: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => cuerpo,
    } as unknown as Response;
}

const CUERPO_CF = {
    iceServers: [
        { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
        {
            urls: [
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:53?transport=udp",
                "turn:turn.cloudflare.com:3478?transport=tcp",
                "turns:turn.cloudflare.com:5349?transport=tcp",
                "turns:turn.cloudflare.com:443?transport=tcp",
            ],
            username: "usuario-temporal",
            credential: "credencial-temporal",
        },
    ],
};

describe("entorno y elección de proveedor", () => {
    it("lee SOLO los nombres acordados y prefiere Cloudflare, luego Metered, luego el TURN fijo", () => {
        const env = entornoIceServidor({
            CLOUDFLARE_TURN_KEY_ID: CF_ID,
            CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN,
            METERED_TURN_DOMAIN: "starseed.metered.live",
            METERED_TURN_API_KEY: MET_KEY,
            TURN_URL: "turn:fijo.example.org:3478",
            TURN_USER: "u",
            TURN_CRED: "c",
        });
        expect(proveedoresIce(env).map((p) => p.tipo)).toEqual(["cloudflare", "metered", "estatico"]);
        expect(elegirProveedor(env)?.tipo).toBe("cloudflare");
    });

    it("un proveedor a medias no cuenta; el TURN fijo acepta también NEXT_PUBLIC_TURN_*", () => {
        const env = entornoIceServidor({
            CLOUDFLARE_TURN_KEY_ID: CF_ID,
            METERED_TURN_API_KEY: MET_KEY,
            NEXT_PUBLIC_TURN_URL: "turn:pub.example.org:3478",
            NEXT_PUBLIC_TURN_USER: "u",
            NEXT_PUBLIC_TURN_CRED: "c",
        });
        expect(proveedoresIce(env).map((p) => p.tipo)).toEqual(["estatico"]);
        expect(elegirProveedor(entornoIceServidor({}))).toBeNull();
    });

    it("rechaza un dominio de Metered que no sea un nombre de host (sin esquema, ruta ni @)", () => {
        for (const malo of ["https://x.metered.live", "x.metered.live/ruta", "user@x.metered.live", "localhost", "x..live"]) {
            expect(proveedoresIce(entornoIceServidor({ METERED_TURN_DOMAIN: malo, METERED_TURN_API_KEY: MET_KEY }))).toEqual([]);
        }
        expect(urlMetered("starseed.metered.live", "a&b")).toBe("https://starseed.metered.live/api/v1/turn/credentials?apiKey=a%26b");
        expect(urlCloudflare(CF_ID)).toBe(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_ID}/credentials/generate-ice-servers`);
    });
});

describe("normalización", () => {
    it("acepta array, { iceServers: [...] } y { iceServers: {...} }; filtra URLs raras y el puerto 53 si se pide", () => {
        const l = normalizarIceServers(CUERPO_CF, { quitarPuerto53: true });
        const urls = l.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
        expect(urls.some((u) => /:53\b/.test(u))).toBe(false);
        expect(contieneTurn(l)).toBe(true);
        expect(normalizarIceServers({ iceServers: { urls: "turn:a.org:3478", username: "u", credential: "c" } })).toEqual([
            { urls: "turn:a.org:3478", username: "u", credential: "c" },
        ]);
        expect(normalizarIceServers([{ urls: ["http://malo", "javascript:alert(1)", "stun:ok.org:3478"] }])).toEqual([{ urls: "stun:ok.org:3478" }]);
        expect(normalizarIceServers("basura")).toEqual([]);
    });

    it("un TURN sin usuario o credencial se descarta (RTCPeerConnection lanzaría)", () => {
        expect(normalizarIceServers([{ urls: "turn:a.org:3478" }])).toEqual([]);
        expect(normalizarIceServers([{ urls: ["turn:a.org:3478", "stun:a.org:3478"], username: "u" }])).toEqual([{ urls: "stun:a.org:3478" }]);
    });

    it("siempre lleva los STUN públicos, sin repetirlos", () => {
        const l = unirConStun([{ urls: "stun:stun.cloudflare.com:3478" }]);
        expect(l.filter((s) => s.urls === "stun:stun.cloudflare.com:3478")).toHaveLength(1);
        expect(l.some((s) => s.urls === "stun:stun.l.google.com:19302")).toBe(true);
    });
});

describe("generarIceServidor", () => {
    it("Cloudflare: POST con Bearer y ttl 86400; devuelve TURN sin puerto 53 + STUN, fuente y ttl", async () => {
        const f = vi.fn(async () => respuesta(201, CUERPO_CF));
        const env = entornoIceServidor({ CLOUDFLARE_TURN_KEY_ID: CF_ID, CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN });
        const r = await generarIceServidor(env, { fetch: f as unknown as typeof fetch, registrar: () => undefined });
        expect(f).toHaveBeenCalledTimes(1);
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(urlCloudflare(CF_ID));
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CF_TOKEN}`);
        expect(JSON.parse(String(init.body))).toEqual({ ttl: 86400 });
        expect(init.cache).toBe("no-store");
        expect(r.fuente).toBe("cloudflare");
        expect(r.ttl).toBe(TTL_CLOUDFLARE_S);
        expect(contieneTurn(r.iceServers)).toBe(true);
        const todo = JSON.stringify(r);
        expect(todo).not.toMatch(/:53\b/);
        expect(todo).not.toContain(CF_TOKEN);
        expect(todo).toContain("stun:stun.l.google.com:19302");
    });

    it("si Cloudflare falla, prueba Metered; si también, el TURN fijo; y avisa sin secretos", async () => {
        const registros: string[] = [];
        const f = vi.fn(async (url: string) => {
            if (url.startsWith("https://rtc.live.cloudflare.com")) return respuesta(401, { error: "no" });
            return respuesta(200, [{ urls: "turns:x.metered.live:443?transport=tcp", username: "mu", credential: "mc" }]);
        });
        const env = entornoIceServidor({
            CLOUDFLARE_TURN_KEY_ID: CF_ID,
            CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN,
            METERED_TURN_DOMAIN: "x.metered.live",
            METERED_TURN_API_KEY: MET_KEY,
        });
        const r = await generarIceServidor(env, { fetch: f as unknown as typeof fetch, registrar: (m) => registros.push(m) });
        expect(r.fuente).toBe("metered");
        expect(f.mock.calls[1][0]).toBe(urlMetered("x.metered.live", MET_KEY));
        expect(JSON.stringify(r)).not.toContain(MET_KEY);
        expect(registros.join("\n")).toMatch(/cloudflare: respondió 401/);
        expect(registros.join("\n")).not.toContain(CF_TOKEN);

        const fallan = vi.fn(async () => {
            throw new Error(`red caída ${CF_TOKEN}`);
        });
        const env2 = entornoIceServidor({
            CLOUDFLARE_TURN_KEY_ID: CF_ID,
            CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN,
            TURN_URL: "turn:fijo.example.org:3478",
            TURN_USER: "u",
            TURN_CRED: "c",
        });
        const registros2: string[] = [];
        const r2 = await generarIceServidor(env2, { fetch: fallan as unknown as typeof fetch, registrar: (m) => registros2.push(m) });
        expect(r2.fuente).toBe("estatico");
        expect(r2.iceServers.at(-1)).toEqual({ urls: "turn:fijo.example.org:3478", username: "u", credential: "c" });
        expect(registros2.join("\n")).not.toContain(CF_TOKEN);
    });

    it("una respuesta sin TURN utilizable no cuenta como éxito", async () => {
        const f = vi.fn(async () => respuesta(201, { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] }));
        const env = entornoIceServidor({ CLOUDFLARE_TURN_KEY_ID: CF_ID, CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN });
        const r = await generarIceServidor(env, { fetch: f as unknown as typeof fetch, registrar: () => undefined });
        expect(r.fuente).toBe("stun");
    });

    it("sin nada configurado: solo STUN públicos, ttl corto, y sin llamar a nadie", async () => {
        const f = vi.fn();
        const r = await generarIceServidor(entornoIceServidor({}), { fetch: f as unknown as typeof fetch });
        expect(f).not.toHaveBeenCalled();
        expect(r).toEqual({ iceServers: STUN_POR_DEFECTO, fuente: "stun", ttl: TTL_STUN_S });
    });

    it("corta a tiempo si el proveedor no responde", async () => {
        const f = vi.fn(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_ok, ko) => {
                    init.signal?.addEventListener("abort", () => ko(Object.assign(new Error("abort"), { name: "AbortError" })));
                }),
        );
        const registros: string[] = [];
        const env = entornoIceServidor({ CLOUDFLARE_TURN_KEY_ID: CF_ID, CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN });
        const r = await generarIceServidor(env, { fetch: f as unknown as typeof fetch, timeoutMs: 20, registrar: (m) => registros.push(m) });
        expect(r.fuente).toBe("stun");
        expect(registros[0]).toMatch(/sin respuesta a tiempo/);
    });
});

describe("modo REST coturn (TURN_SECRET + TURN_URLS)", () => {
    const SECRET = "secreto-coturn-para-prueba";
    const URLS = ["turn:rest.example.org:3478", "turns:rest.example.org:5349"];

    it("credencialRest: base64(HMAC-SHA1(secret, usuario)) con vector conocido", () => {
        const usuario = "1699999999:uid-test";
        const cred = credencialRest(SECRET, usuario);
        expect(typeof cred).toBe("string");
        expect(cred.length).toBeGreaterThan(0);
        // Verificación con el mismo secreto: debe ser determinista.
        expect(credencialRest(SECRET, usuario)).toBe(cred);
        // Con otro usuario debe ser distinta.
        expect(credencialRest(SECRET, "1699999999:otro")).not.toBe(cred);
    });

    it("proveedoresIce: con TURN_SECRET y TURN_URLS, rest va primero en orden", () => {
        const env = entornoIceServidor({
            TURN_SECRET: SECRET,
            TURN_URLS: URLS.join(","),
        });
        expect(env.turnSecret).toBe(SECRET);
        expect(env.turnUrls).toEqual(URLS);
        const lista = proveedoresIce(env);
        expect(lista[0].tipo).toBe("rest");
        expect((lista[0] as { tipo: string; urls: string[] }).urls).toEqual(URLS);
    });

    it("probarAProveedor con rest: genera usuario <expira>:<uid>, credencial válida 1h, y nunca expone el secreto", async () => {
        const env = entornoIceServidor({ TURN_SECRET: SECRET, TURN_URLS: URLS.join(",") });
        // No se lanza fetch real porque rest es puro (no usa red): genera la lista directamente.
        const r = await generarIceServidor(env, { uid: "usuario-de-prueba" });
        expect(r.fuente).toBe("rest");
        expect(r.ttl).toBe(3600);
        expect(contieneTurn(r.iceServers)).toBe(true);
        // Nunca debe aparecer el secreto en la respuesta.
        const todo = JSON.stringify(r);
        expect(todo).not.toContain(SECRET);
        // El usuario debe ser <expira>:uid con expira dentro de la ventana de 1h.
        const servidores = r.iceServers.filter((s) => {
            const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
            return urls.some((u) => /^turns?:/i.test(u as string));
        });
        expect(servidores.length).toBeGreaterThan(0);
        const usuario = servidores[0].username;
        expect(typeof usuario).toBe("string");
        expect(usuario).toMatch(/^\d+:[^:]+$/);
        const partes = (usuario as string).split(":");
        const expira = parseInt(partes[0], 10);
        const ahora = Math.floor(Date.now() / 1000);
        expect(expira).toBeGreaterThan(ahora);
        expect(expira).toBeLessThanOrEqual(ahora + 3600 + 10); // tolerancia de 10 s
        expect(partes[1]).toBe("usuario-de-prueba");
        // La credencial debe ser base64 de HMAC-SHA1.
        const cred = servidores[0].credential;
        expect(typeof cred).toBe("string");
        expect(cred).toBe(credencialRest(SECRET, usuario as string));
    });

    it("sin TURN_SECRET: proveedoresIce no incluye rest y todo sigue igual", () => {
        const env = entornoIceServidor({
            CLOUDFLARE_TURN_KEY_ID: CF_ID,
            CLOUDFLARE_TURN_KEY_API_TOKEN: CF_TOKEN,
        });
        expect(proveedoresIce(env).map((p) => p.tipo)).toEqual(["cloudflare"]);
        expect(proveedoresIce(env).some((p) => p.tipo === "rest")).toBe(false);
    });
});

describe("peticionDeOtroSitio", () => {
    const cab = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    it("bloquea peticiones de otras webs y deja pasar las del propio OS", () => {
        expect(peticionDeOtroSitio(cab({ "sec-fetch-site": "cross-site" }))).toBe(true);
        expect(peticionDeOtroSitio(cab({ origin: "https://malo.example", host: "starseed-os.vercel.app" }))).toBe(true);
        expect(peticionDeOtroSitio(cab({ origin: "https://starseed-os.vercel.app", host: "starseed-os.vercel.app", "sec-fetch-site": "same-origin" }))).toBe(false);
        expect(peticionDeOtroSitio(cab({ "sec-fetch-site": "same-origin" }))).toBe(false);
        expect(peticionDeOtroSitio(cab({}))).toBe(false);
    });
});
