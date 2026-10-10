/**
 * Cómo se conecta /metagenesis al motor (2026-10-10): en la Mac nada cambia; fuera, sesión y
 * membresía primero, y el estado sale de SONDEAR el motor, no de lo que diga la fila.
 */
import { describe, expect, it, vi } from "vitest";
import { comprobarConexion, type DepsConexion } from "../conexion";
import type { FilaMotor, SondaMotor } from "../remoto";

const AHORA = Date.parse("2026-10-10T12:00:00Z");
const MOTOR = "https://ala-bosque-rio.trycloudflare.com";
const PAGINA = "https://starseed-os.vercel.app";

function fila(c: Partial<FilaMotor> = {}): FilaMotor {
    return {
        url: MOTOR,
        encendido: true,
        ultimo_latido: new Date(AHORA - 20_000).toISOString(),
        arrancado_en: null,
        maquina: "Mac-de-Alex",
        motivo: null,
        ...c,
    };
}

function deps(c: Partial<DepsConexion> & { sondas?: Record<string, SondaMotor> } = {}): DepsConexion {
    const sondas = c.sondas ?? { [PAGINA]: { ok: false, tipo: "no-es-motor", estado: 404 }, [MOTOR]: { ok: true } };
    return {
        hostname: "starseed-os.vercel.app",
        origenPagina: PAGINA,
        hostsExtra: [],
        token: async () => "token",
        acceso: async () => ({ miembro: true }),
        leerMotor: async () => ({ ok: true, fila: fila() }),
        sondear: async (base) => sondas[base] ?? { ok: false, tipo: "sin-respuesta" },
        ahora: () => AHORA,
        ...c,
    };
}

describe("comprobarConexion", () => {
    it("en la Mac: local, sin preguntar nada", async () => {
        const token = vi.fn(async () => "t");
        expect(await comprobarConexion(deps({ hostname: "localhost", token }))).toEqual({ fase: "local" });
        expect(token).not.toHaveBeenCalled();
    });

    it("sin sesión → sin-sesion; no miembro → no-miembro (y no se lee el motor)", async () => {
        expect((await comprobarConexion(deps({ token: async () => null }))).fase).toBe("sin-sesion");
        const leerMotor = vi.fn();
        expect((await comprobarConexion(deps({ acceso: async () => ({ miembro: false }), leerMotor }))).fase).toBe("no-miembro");
        expect(leerMotor).not.toHaveBeenCalled();
    });

    it("miembro con la Mac encendida → conectado por el túnel", async () => {
        const r = await comprobarConexion(deps());
        expect(r).toMatchObject({ fase: "conectado", base: MOTOR, desde: "tunel", maquina: "Mac-de-Alex" });
    });

    it("si la propia página la sirve la Mac, conecta al mismo origen sin leer la fila", async () => {
        const leerMotor = vi.fn();
        const r = await comprobarConexion(deps({ origenPagina: "http://192.168.1.5:9002", hostname: "192.168.1.5", sondas: { "http://192.168.1.5:9002": { ok: true } }, leerMotor }));
        expect(r).toMatchObject({ fase: "conectado", base: "http://192.168.1.5:9002", desde: "esta-pagina" });
        expect(leerMotor).not.toHaveBeenCalled();
    });

    it("túnel publicado que no contesta → mac-apagada con el último latido", async () => {
        const r = await comprobarConexion(deps({ sondas: { [MOTOR]: { ok: false, tipo: "sin-respuesta", estado: 530 } } }));
        expect(r).toMatchObject({ fase: "mac-apagada", latidoHaceMs: 20_000 });
    });

    it("la fila dice apagada → mac-apagada con su motivo, sin sondear ninguna URL", async () => {
        const sondear = vi.fn(async (): Promise<SondaMotor> => ({ ok: false, tipo: "no-es-motor", estado: 404 }));
        const r = await comprobarConexion(deps({ leerMotor: async () => ({ ok: true, fila: fila({ encendido: false, url: null, motivo: "la Mac paró el túnel" }) }), sondear }));
        expect(r).toMatchObject({ fase: "mac-apagada", motivo: "la Mac paró el túnel" });
        expect(sondear).toHaveBeenCalledTimes(1); // solo la del mismo origen
    });

    it("una URL publicada que no es de túnel admitido nunca recibe el token", async () => {
        const sondear = vi.fn(async (): Promise<SondaMotor> => ({ ok: false, tipo: "no-es-motor", estado: 404 }));
        await comprobarConexion(deps({ leerMotor: async () => ({ ok: true, fila: fila({ url: "https://evil.example.com" }) }), sondear }));
        expect(sondear.mock.calls.map((c) => (c as unknown[])[0])).toEqual([PAGINA]);
    });

    it("el motor rechaza la sesión → rechazado; sin tabla → sin-tabla", async () => {
        expect(await comprobarConexion(deps({ sondas: { [MOTOR]: { ok: false, tipo: "rechazado", estado: 403 } } }))).toEqual({ fase: "rechazado", estado: 403 });
        expect((await comprobarConexion(deps({ leerMotor: async () => ({ ok: false, sinTabla: true, motivo: "falta" }) }))).fase).toBe("sin-tabla");
    });
});
