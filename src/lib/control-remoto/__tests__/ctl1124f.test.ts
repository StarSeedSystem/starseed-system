import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RegistroSesiones } from "@/lib/control-remoto/registro-sesiones";
import { SesionHacia } from "@/lib/control-remoto/canal";
import type { RespuestaOrden, Args } from "@/lib/control-remoto/orden";
import type { MandarSesion } from "@/lib/control-remoto/registro-sesiones";

describe("CTL1124F: Terminar control no reabre solo", () => {
    function crearRegistro(): RegistroSesiones {
        return new RegistroSesiones(
            () => Date.now(),
            (ms) => new Promise((r) => setTimeout(r, 0))
        );
    }

    function crearMandarMock(respuestas: Map<string, RespuestaOrden>) {
        return vi.fn(async (_para: string, nombre: string, _args: Args, o: { sesion?: string | null }) => {
            const clave = `${nombre}:${o.sesion ?? "sin-sesion"}`;
            const r = respuestas.get(clave);
            if (r) return r;
            return { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-respuesta" };
        });
    }

    it("SesionHacia.latir para el latido cuando recibe terminado-por-el-dueno", async () => {
        const registro = crearRegistro();
        const respuestas = new Map<string, RespuestaOrden>();
        respuestas.set("abrir-sesion:sin-sesion", { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
        respuestas.set("leer-estado:token-123", { tipo: "respuesta", nonce: "", ok: false, motivo: "terminado-por-el-dueno" });
        const mandar = crearMandarMock(respuestas);
        const sesion = new SesionHacia("neurona-1", mandar as any, registro);
        await sesion.abrir(true);
        expect(sesion.tokenExistente()).toBe("token-123");

        const resultado = await sesion.latir();
        expect(resultado).toBe(false);
        expect(sesion.tokenExistente()).toBeNull();
    });

    it("SesionHacia.latir para el latido cuando recibe limite-cumplido", async () => {
        const registro = crearRegistro();
        const respuestas = new Map<string, RespuestaOrden>();
        respuestas.set("abrir-sesion:sin-sesion", { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
        respuestas.set("leer-estado:token-123", { tipo: "respuesta", nonce: "", ok: false, motivo: "limite-cumplido" });
        const mandar = crearMandarMock(respuestas);
        const sesion = new SesionHacia("neurona-1", mandar as any, registro);
        await sesion.abrir(true);

        const resultado = await sesion.latir();
        expect(resultado).toBe(false);
        expect(sesion.tokenExistente()).toBeNull();
    });

    it("SesionHacia.latir NO para el latido cuando recibe sin-sesion (reabre automáticamente)", async () => {
        const registro = crearRegistro();
        let llamadaAbrir = 0;
        const mandar = vi.fn(async (_para: string, nombre: string, _args: Args, o: { sesion?: string | null }) => {
            if (nombre === "abrir-sesion") {
                llamadaAbrir++;
                if (llamadaAbrir === 1) {
                    return { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } };
                }
                return { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-456", nivel: "controlar" } };
            }
            if (nombre === "leer-estado" && o.sesion === "token-123") {
                return { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-sesion" };
            }
            if (nombre === "leer-estado" && o.sesion === "token-456") {
                return { tipo: "respuesta", nonce: "", ok: true, motivo: "ok" };
            }
            return { tipo: "respuesta", nonce: "", ok: false, motivo: "sin-respuesta" };
        });
        const sesion = new SesionHacia("neurona-1", mandar as any, registro);
        await sesion.abrir(true);
        const tokenOriginal = sesion.tokenExistente();

        const resultado = await sesion.latir();
        expect(resultado).toBe(true);
        expect(sesion.tokenExistente()).toBe("token-456");
        expect(sesion.tokenExistente()).not.toBe(tokenOriginal);
    });

    it("RegistroSesiones.tokenDe devuelve null para neurona sin sesión", () => {
        const registro = new RegistroSesiones();
        expect(registro.tokenDe("neurona-inexistente")).toBeNull();
    });

    it("RegistroSesiones.terminar elimina la sesión y devuelve true", async () => {
        const registro = crearRegistro();
        const respuestas = new Map<string, RespuestaOrden>();
        respuestas.set("abrir-sesion:sin-sesion", { tipo: "respuesta", nonce: "", ok: true, motivo: "ok", resultado: { sesion: "token-123", nivel: "controlar" } });
        respuestas.set("pantalla-parar:token-123", { tipo: "respuesta", nonce: "", ok: true, motivo: "ok" });
        respuestas.set("cerrar-sesion:token-123", { tipo: "respuesta", nonce: "", ok: true, motivo: "ok" });
        const mandar = crearMandarMock(respuestas);
        const sesion = new SesionHacia("neurona-1", mandar as any, registro);
        await sesion.abrir(true);
        expect(registro.tokenDe("neurona-1")).toBe("token-123");

        const resultado = await registro.terminar("neurona-1", mandar as any);
        expect(resultado).toBe(true);
        expect(registro.tokenDe("neurona-1")).toBeNull();
    });

    it("SesionHacia.tokenExistente devuelve el token del registro sin abrir sesión", () => {
        const registro = new RegistroSesiones();
        const sesion = new SesionHacia("test-neurona", async () => ({ tipo: "respuesta", nonce: "", ok: false, motivo: "sin-respuesta" }) as any, registro);
        expect(typeof sesion.tokenExistente).toBe("function");
        expect(sesion.tokenExistente()).toBeNull();
    });
});