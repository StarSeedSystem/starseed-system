import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPS_OFICIALES } from "../apps-oficiales";
import { CACHE_VERSION_MS, claveCacheVersion, etiquetaVersion, obtenerUltimaVersion } from "../ultima-version";

// Entorno node: un localStorage mínimo en memoria para la caché.
function almacenEnMemoria(): Storage {
    const m = new Map<string, string>();
    return {
        get length() {
            return m.size;
        },
        clear: () => m.clear(),
        getItem: (k) => m.get(k) ?? null,
        key: (i) => [...m.keys()][i] ?? null,
        removeItem: (k) => void m.delete(k),
        setItem: (k, v) => void m.set(k, String(v)),
    };
}

const RESPUESTA_V3 = {
    tag_name: "v3.0.0",
    published_at: "2026-10-01T10:00:00Z",
    html_url: "https://github.com/StarSeedSystem/generador_frecuencias/releases/tag/v3.0.0",
    assets: [{ name: "OmniFrequency.apk", browser_download_url: "https://github.com/x/OmniFrequency.apk", size: 6_000_000 }],
};

function fetchQueResponde(json: unknown, status = 200) {
    return vi.fn(async () => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } }));
}

const AHORA = Date.parse("2026-09-25T12:00:00Z");

beforeEach(() => {
    vi.stubGlobal("localStorage", almacenEnMemoria());
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("obtenerUltimaVersion", () => {
    it("lee el último release de GitHub y lo guarda en caché", async () => {
        const f = fetchQueResponde(RESPUESTA_V3);
        const r = await obtenerUltimaVersion("omnifrecuencias", { fetch: f, ahora: AHORA });
        expect(r?.origen).toBe("github");
        expect(r?.release.tag).toBe("v3.0.0");
        expect(f).toHaveBeenCalledWith(
            "https://api.github.com/repos/StarSeedSystem/generador_frecuencias/releases/latest",
            expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
        );
        expect(localStorage.getItem(claveCacheVersion("omnifrecuencias"))).toContain("v3.0.0");
    });

    it("con caché fresca (menos de 6 h) no pregunta a GitHub", async () => {
        await obtenerUltimaVersion("omnifrecuencias", { fetch: fetchQueResponde(RESPUESTA_V3), ahora: AHORA });
        const f = fetchQueResponde({});
        const r = await obtenerUltimaVersion("omnifrecuencias", { fetch: f, ahora: AHORA + CACHE_VERSION_MS - 1 });
        expect(r).toMatchObject({ origen: "cache", release: { tag: "v3.0.0" } });
        expect(f).not.toHaveBeenCalled();
    });

    it("una caché fresca pero más vieja que la versión que el OS ya conoce se vuelve a pedir", async () => {
        const respaldo = APPS_OFICIALES["starseed-os"].respaldo;
        localStorage.setItem(
            claveCacheVersion("starseed-os"),
            JSON.stringify({ guardada: AHORA, release: { ...respaldo, tag: "v0.0.1" } }),
        );
        const f = fetchQueResponde({ message: "API rate limit exceeded" }, 403);
        const r = await obtenerUltimaVersion("starseed-os", { fetch: f, ahora: AHORA + 1000 });
        expect(f).toHaveBeenCalledTimes(1);
        // Sin GitHub, gana el respaldo (la versión compilada), no la caché atrasada.
        expect(r).toMatchObject({ origen: "respaldo", release: { tag: respaldo.tag } });
    });

    it("con caché vieja vuelve a preguntar y, si GitHub falla, usa la caché vieja antes que el respaldo", async () => {
        await obtenerUltimaVersion("omnifrecuencias", { fetch: fetchQueResponde(RESPUESTA_V3), ahora: AHORA });
        const f = fetchQueResponde({ message: "API rate limit exceeded" }, 403);
        const r = await obtenerUltimaVersion("omnifrecuencias", { fetch: f, ahora: AHORA + CACHE_VERSION_MS + 1 });
        expect(f).toHaveBeenCalledTimes(1);
        expect(r).toMatchObject({ origen: "cache", release: { tag: "v3.0.0" } });
    });

    it("sin caché y sin GitHub devuelve el respaldo medido a mano", async () => {
        const r = await obtenerUltimaVersion("audiomorphic", {
            fetch: vi.fn(async () => {
                throw new TypeError("sin red");
            }),
            ahora: AHORA,
        });
        expect(r).toEqual({ release: APPS_OFICIALES.audiomorphic.respaldo, origen: "respaldo" });
    });

    it("corta a los N ms si GitHub no contesta (timeout) y usa el respaldo", async () => {
        const colgado = vi.fn(
            (_url: string | URL | Request, init?: RequestInit) =>
                new Promise<Response>((_ok, fallo) => {
                    init?.signal?.addEventListener("abort", () => fallo(new DOMException("abortado", "AbortError")));
                }),
        );
        const inicio = Date.now();
        const r = await obtenerUltimaVersion("audiomorphic", { fetch: colgado as unknown as typeof fetch, ahora: AHORA, timeoutMs: 30 });
        expect(r?.origen).toBe("respaldo");
        expect(Date.now() - inicio).toBeLessThan(2000);
    });

    it("una respuesta sin forma de release no se da por buena", async () => {
        const r = await obtenerUltimaVersion("audiomorphic", { fetch: fetchQueResponde({ hola: 1 }), ahora: AHORA });
        expect(r?.origen).toBe("respaldo");
        expect(localStorage.getItem(claveCacheVersion("audiomorphic"))).toBeNull();
    });

    it("dos peticiones a la vez comparten una sola llamada a GitHub", async () => {
        const f = fetchQueResponde(RESPUESTA_V3);
        const [a, b] = await Promise.all([
            obtenerUltimaVersion("omnifrecuencias", { fetch: f, ahora: AHORA }),
            obtenerUltimaVersion("omnifrecuencias", { fetch: f, ahora: AHORA }),
        ]);
        expect(f).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
    });

    it("un id que no es de app oficial devuelve null sin tocar la red", async () => {
        const f = fetchQueResponde(RESPUESTA_V3);
        expect(await obtenerUltimaVersion("cafe", { fetch: f })).toBeNull();
        expect(f).not.toHaveBeenCalled();
    });

    it("sobrevive a un localStorage que lanza (modo privado)", async () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("bloqueado");
            },
            setItem: () => {
                throw new Error("bloqueado");
            },
        });
        const r = await obtenerUltimaVersion("omnifrecuencias", { fetch: fetchQueResponde(RESPUESTA_V3), ahora: AHORA });
        expect(r?.origen).toBe("github");
    });
});

describe("etiquetaVersion", () => {
    it("«v2.0.0 · publicada el 22 sep»", () => {
        expect(etiquetaVersion({ tag: "v2.0.0", publicado: "2026-09-22T19:46:49Z" })).toBe("v2.0.0 · publicada el 22 sep");
        expect(etiquetaVersion({ tag: "1.2.0", publicado: "" })).toBe("v1.2.0");
        expect(etiquetaVersion({ tag: "v1", publicado: "no es fecha" })).toBe("v1");
    });
});
