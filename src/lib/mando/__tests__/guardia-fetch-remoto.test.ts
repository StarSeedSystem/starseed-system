// @vitest-environment jsdom
/**
 * La guardia de Genesis en MODO REMOTO (2026-10-10): con el modo puesto, las lecturas en cola,
 * los POST y la sonda de la autocuración van al motor de la Mac con el token; al quitarlo, todo
 * vuelve a la página.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOTOR = "https://ala-bosque-rio.trycloudflare.com";

describe("guardia-fetch en modo remoto", () => {
    let llamadas: Array<{ url: string; init?: RequestInit }>;
    let fetchOriginal: typeof fetch;

    beforeEach(() => {
        vi.resetModules();
        llamadas = [];
        fetchOriginal = window.fetch;
        window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            llamadas.push({ url: String(input), init });
            return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch;
    });
    afterEach(() => {
        window.fetch = fetchOriginal;
    });

    it("lecturas, acciones y la sonda van al motor con Bearer; sin modo, a la página", async () => {
        const g = await import("../guardia-fetch");
        g.instalarGuardiaFetchMando();
        g.ponerModoRemoto({ base: MOTOR, token: async () => "token-uno" });
        expect(g.modoRemotoDeGenesis()?.base).toBe(MOTOR);

        await window.fetch("/api/mando/estado");
        await window.fetch("/api/mando/reintentar", { method: "POST", body: "{}" });
        await g.fetchSinGuardia()("/api/mando/latido", { cache: "no-store" });
        await window.fetch("/api/otra/cosa");

        expect(llamadas.map((l) => l.url)).toEqual([
            `${MOTOR}/api/mando/estado`,
            `${MOTOR}/api/mando/reintentar`,
            `${MOTOR}/api/mando/latido`,
            "/api/otra/cosa",
        ]);
        for (const l of llamadas.slice(0, 3)) {
            expect(new Headers(l.init?.headers).get("authorization")).toBe("Bearer token-uno");
            expect(l.init?.credentials).toBe("omit");
        }

        g.ponerModoRemoto(null);
        await window.fetch("/api/mando/estado");
        expect(llamadas.at(-1)!.url).toBe("/api/mando/estado");
    });
});
