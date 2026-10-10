/**
 * El guardián de /api/mando/* ante MetaGenesis por el túnel (2026-10-10), con Supabase simulado:
 *   · sin token y por el túnel → 401 (nunca pasa como local, aunque la Mac tenga STARSEED_LOCAL=1);
 *   · miembro con token → pasa, y la segunda lectura en menos de 60 s no vuelve a llamar a Supabase;
 *   · no miembro con token → 403.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const llamadas = { getUser: 0, rpc: 0 };
let miembro = true;

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        auth: {
            getUser: async (token?: string) => {
                llamadas.getUser += 1;
                return token ? { data: { user: { id: `cuenta-${token.length}` } }, error: null } : { data: { user: null }, error: new Error("sin sesión") };
            },
        },
        rpc: async () => {
            llamadas.rpc += 1;
            return { data: miembro, error: null };
        },
    }),
}));

vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: new Error("sin cookie") }) },
        rpc: async () => ({ data: false, error: null }),
    }),
}));

function jwt(sufijo: string): string {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return [b64({ alg: "none" }), b64({ sub: sufijo, exp: Math.floor(Date.now() / 1000) + 3600 }), `firma${sufijo}`].join(".");
}

function porElTunel(token?: string) {
    const h: Record<string, string> = {
        host: "ala-bosque-rio.trycloudflare.com",
        "cf-connecting-ip": "203.0.113.7",
        "cf-ray": "8c1f-MAD",
        "x-forwarded-for": "203.0.113.7",
        origin: "https://starseed-os.vercel.app",
    };
    if (token) h.authorization = `Bearer ${token}`;
    return new Request("http://127.0.0.1:9012/api/mando/estado", { headers: h });
}

describe("guardián por el túnel de MetaGenesis", () => {
    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("STARSEED_MANDO", "1");
        vi.stubEnv("STARSEED_LOCAL", "1");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-de-prueba");
        llamadas.getUser = 0;
        llamadas.rpc = 0;
        miembro = true;
        vi.resetModules();
    });
    afterEach(() => vi.unstubAllEnvs());

    it("sin token → 401: el túnel no es la propia máquina", async () => {
        const { guardianMando } = await import("../guardian");
        const r = await guardianMando(porElTunel());
        expect(r?.status).toBe(401);
    });

    it("miembro con token → pasa; la segunda lectura no vuelve a preguntar a Supabase", async () => {
        const { guardianMando } = await import("../guardian");
        const token = jwt("miembro");
        expect(await guardianMando(porElTunel(token))).toBeNull();
        expect(await guardianMando(porElTunel(token))).toBeNull();
        expect(llamadas).toEqual({ getUser: 1, rpc: 1 });
    });

    it("no miembro con token → 403 (y también se recuerda)", async () => {
        miembro = false;
        const { guardianMando } = await import("../guardian");
        const token = jwt("ajeno");
        expect((await guardianMando(porElTunel(token)))?.status).toBe(403);
        expect((await guardianMando(porElTunel(token)))?.status).toBe(403);
        expect(llamadas.rpc).toBe(1);
    });
});
