import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const destino = vi.hoisted(() => ({ valor: null as null | { base: string; via: "env" | "fijo" | "tunel"; latenciaMs: number } }));

vi.mock("@/lib/astraura/destino-nube", () => ({ destinoNube: async () => destino.valor }));
vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { GET } from "../route";

type Nodo = { id: string; tipo: string; url: string | null; vivo: boolean; latenciaMs: number | null; ramLibreMb: number | null };

async function pedir(q = ""): Promise<Nodo[]> {
    const r = await GET(new Request(`http://localhost:9002/api/astraura/nodos${q}`));
    return ((await r.json()) as { nodos: Nodo[] }).nodos;
}

describe("/api/astraura/nodos dice la verdad de cada nodo (2026-10-09)", () => {
    const fetchOriginal = globalThis.fetch;
    beforeEach(() => {
        destino.valor = null;
        delete process.env.STARSEED_LOCAL;
    });
    afterEach(() => {
        globalThis.fetch = fetchOriginal;
    });

    it("la nube sale caída si ningún destino responde (antes: vivo fijo)", async () => {
        const nodos = await pedir();
        const nube = nodos.find((n) => n.id === "nube-astraura");
        expect(nube?.vivo).toBe(false);
        expect(nube?.url).toBeNull();
    });

    it("la nube viva va por el proxy del OS, nunca con la URL cruda del túnel", async () => {
        destino.valor = { base: "https://algo.trycloudflare.com", via: "tunel", latenciaMs: 120 };
        const nube = (await pedir()).find((n) => n.id === "nube-astraura");
        expect(nube).toMatchObject({ vivo: true, url: "/api/ai/astraura-158", latenciaMs: 120 });
    });

    it("en la Mac sale el Astraura local con su latencia y la RAM que ve el turnero", async () => {
        process.env.STARSEED_LOCAL = "1";
        globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
            const u = String(url);
            if (u.endsWith("/api/ping")) return new Response(JSON.stringify({ ok: true, vivo: true }));
            if (u.endsWith("/api/cola")) return new Response(JSON.stringify({ ram_libre_mb: 1343.6 }));
            return new Response("{}", { status: 404 });
        }) as typeof fetch;
        const local = (await pedir("?privacidad=privada")).find((n) => n.id === "local-astraura");
        expect(local).toMatchObject({ tipo: "local", vivo: true, ramLibreMb: 1344 });
    });

    it("fuera de la Mac no se sondea el 127.0.0.1", async () => {
        const espia = vi.fn();
        globalThis.fetch = espia as unknown as typeof fetch;
        const nodos = await pedir();
        expect(nodos.some((n) => n.id === "local-astraura")).toBe(false);
        expect(espia).not.toHaveBeenCalled();
    });
});
