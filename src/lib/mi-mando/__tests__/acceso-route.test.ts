import { afterEach, describe, expect, it, vi } from "vitest";

// El guardián real consulta Supabase y el entorno; aquí solo importa que la
// ruta traduzca su decisión a un booleano y nunca devuelva otra cosa.
const guardian = vi.hoisted(() => ({ guardianMando: vi.fn<(req?: Request) => Promise<Response | null>>() }));
vi.mock("@/lib/mando/guardian", () => guardian);

import { GET } from "@/app/api/mando/acceso/route";

afterEach(() => guardian.guardianMando.mockReset());

const peticion = () => new Request("https://starseed-os.vercel.app/api/mando/acceso");

describe("GET /api/mando/acceso", () => {
    it("proyecto: true cuando el guardián deja pasar", async () => {
        guardian.guardianMando.mockResolvedValue(null);
        const r = await GET(peticion());
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ proyecto: true });
        expect(r.headers.get("cache-control")).toContain("no-store");
    });

    it("proyecto: false (y 200) cuando el guardián veta con 404 o 401", async () => {
        guardian.guardianMando.mockResolvedValue(new Response("Not Found", { status: 404 }));
        const r = await GET(peticion());
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ proyecto: false });

        guardian.guardianMando.mockResolvedValue(Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 }));
        expect(await (await GET(peticion())).json()).toEqual({ proyecto: false });
    });

    it("si el guardián falla, la respuesta segura es false", async () => {
        guardian.guardianMando.mockRejectedValue(new Error("sin red"));
        const r = await GET(peticion());
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ proyecto: false });
    });
});
