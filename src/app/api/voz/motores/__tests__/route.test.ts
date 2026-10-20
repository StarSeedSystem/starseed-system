/**
 * /api/voz/motores detrás de la puerta común de Genesis (2026-10-20 · COL1012Md).
 * Antes solo miraba STARSEED_MANDO=1: con Genesis publicado en el A1 cualquiera habría podido pedir el
 * reinicio del motor de voz. Ahora el veto del guardián manda en GET y en POST, y no se toca nada si veta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const veto = vi.hoisted(() => ({ actual: null as Response | null }));
const motores = vi.hoisted(() => ({ leer: vi.fn(), reiniciar: vi.fn() }));

vi.mock("@/lib/mando/guardian", () => ({
    guardianMando: vi.fn(async () => veto.actual),
}));

vi.mock("@/lib/voces/motores", () => ({
    TAMANOS_VALIDOS: ["Q4_K_M", "Q8_0"],
    leerMotores: motores.leer,
    reiniciarConModelo: motores.reiniciar,
}));

function post(cuerpo: unknown) {
    return new Request("http://127.0.0.1:9002/api/voz/motores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
    });
}

describe("/api/voz/motores", () => {
    beforeEach(() => {
        veto.actual = null;
        motores.leer.mockReset().mockResolvedValue({ cargado: "Q4_K_M" });
        motores.reiniciar.mockReset().mockResolvedValue({ ok: true });
    });

    it("sin veto, GET lee los motores", async () => {
        const { GET } = await import("../route");
        const r = await GET(new Request("http://127.0.0.1:9002/api/voz/motores"));
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ cargado: "Q4_K_M" });
    });

    it("con veto (sin sesión), GET no lee nada", async () => {
        veto.actual = Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        const { GET } = await import("../route");
        const r = await GET(new Request("http://127.0.0.1:9002/api/voz/motores"));
        expect(r.status).toBe(401);
        expect(motores.leer).not.toHaveBeenCalled();
    });

    it("con veto, POST no reinicia el motor, ni siquiera con un tamaño válido", async () => {
        veto.actual = Response.json({ error: "MetaGenesis es solo para desarrolladores de StarSeed OS con permiso." }, { status: 403 });
        const { POST } = await import("../route");
        const r = await POST(post({ tamano: "Q8_0" }));
        expect(r.status).toBe(403);
        expect(motores.reiniciar).not.toHaveBeenCalled();
    });

    it("sin veto, POST sigue validando el tamaño con la lista blanca", async () => {
        const { POST } = await import("../route");
        expect((await POST(post({ tamano: "Q2_K" }))).status).toBe(400);
        expect(motores.reiniciar).not.toHaveBeenCalled();
        const ok = await POST(post({ tamano: "Q8_0" }));
        expect(ok.status).toBe(200);
        expect(motores.reiniciar).toHaveBeenCalledWith("Q8_0");
    });

    it("la consola apagada (404 del guardián) también cierra la ruta", async () => {
        veto.actual = new Response("Not Found", { status: 404 });
        const { GET } = await import("../route");
        expect((await GET(new Request("http://127.0.0.1:9002/api/voz/motores"))).status).toBe(404);
    });
});
