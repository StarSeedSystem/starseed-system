// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAVE_CORTE, fetchGuardado, leerAvisoConsumo, leerContadores } from "../guardian";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("guardián de la pestaña (con ventana)", () => {
    it("fetchGuardado usa el guardián: tras un 402, la siguiente no toca la red y queda persistido", async () => {
        const red = vi.fn(async () => new Response('{"message":"exceed_egress_quota"}', { status: 402 }));
        vi.stubGlobal("fetch", red);
        const url = "https://proyecto.supabase.co/rest/v1/os_mesh_relay?select=*";

        expect((await fetchGuardado(url)).status).toBe(402);
        const segunda = await fetchGuardado(url, { method: "GET" });
        expect(segunda.status).toBe(402);
        expect(((await segunda.json()) as { code: string }).code).toBe("starseed_freno");
        expect(red).toHaveBeenCalledTimes(1);

        expect(leerContadores().corteHasta).not.toBeNull();
        expect(leerContadores().porRuta["/rest/v1/os_mesh_relay"].n).toBe(1);
        expect(leerAvisoConsumo().corte).toBe(true);
        expect(leerAvisoConsumo()).toBe(leerAvisoConsumo());
        expect(window.localStorage.getItem(CLAVE_CORTE)).toContain('"fallos":1');
        const diag = (window as unknown as { __starseedConsumo?: { contadores: () => unknown } }).__starseedConsumo;
        expect(typeof diag?.contadores).toBe("function");
    });
});
