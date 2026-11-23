/**
 * CTL1117A · S1 (doble apertura), S2 («el Mac cierra su propia sesión»), S3 (retroceso tras un rechazo terminal) y S4
 * (pedir controlar con una sesión viva): una sesión por neurona, compartida, y un cierre que solo cierra la suya.
 */
import { describe, expect, it } from "vitest";
import { ESPERA_TERMINAL_MS, REUSO_MAX_MS, RegistroSesiones, type MandarSesion } from "../registro-sesiones";
import type { RespuestaOrden } from "../orden";

const T1 = "1".repeat(32);
const T2 = "2".repeat(32);
const ok = (sesion: string, nivel = "controlar"): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado: { sesion, nivel } });
const no = (motivo: string): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: false, motivo });

function banco(respuestas: RespuestaOrden[], demoraMs = 0) {
    const enviadas: { nombre: string; sesion?: string | null }[] = [];
    let i = 0;
    const mandar: MandarSesion = async (nombre, _a, o) => {
        enviadas.push({ nombre, sesion: o.sesion });
        if (demoraMs) await new Promise((r) => setTimeout(r, demoraMs));
        if (nombre === "cerrar-sesion") return ok("x");
        return respuestas[Math.min(i++, respuestas.length - 1)];
    };
    return { mandar, enviadas };
}

describe("S1 · una sola apertura en vuelo", () => {
    it("dos aperturas a la vez mandan UNA `abrir-sesion` y las dos reciben la misma sesión (antes la segunda salía «sin-indicador-nativo»)", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([ok(T1)], 20);
        const [a, b] = await Promise.all([r.abrir("tableta", mandar), r.abrir("tableta", mandar)]);
        expect(enviadas.filter((e) => e.nombre === "abrir-sesion")).toHaveLength(1);
        expect(a.ok && b.ok).toBe(true);
        expect((a.resultado as { sesion: string }).sesion).toBe(T1);
        expect((b.resultado as { sesion: string }).sesion).toBe(T1);
    });

    it("si la apertura en vuelo es rechazada, quien esperaba recibe el mismo rechazo (no manda otra)", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([no("sin-indicador-nativo")], 10);
        const [a, b] = await Promise.all([r.abrir("tableta", mandar), r.abrir("tableta", mandar)]);
        expect(enviadas).toHaveLength(1);
        expect(a.motivo).toBe("sin-indicador-nativo");
        expect(b.motivo).toBe("sin-indicador-nativo");
    });
});

describe("S4 · pedir controlarla con una sesión viva", () => {
    it("reutiliza la sesión viva sin mandar otra orden de apertura (la imagen no se corta)", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([ok(T1)]);
        await r.abrir("tableta", mandar);
        const otra = await r.abrir("tableta", mandar);
        expect(enviadas).toHaveLength(1);
        expect(otra).toMatchObject({ ok: true, resultado: { sesion: T1, reutilizada: true } });
    });

    it("una sesión sin usar más de lo que el aparato sostiene se vuelve a abrir (y el aparato la trata como la misma si lo es)", async () => {
        let t = 1_000;
        const r = new RegistroSesiones(() => t);
        const { mandar, enviadas } = banco([ok(T1), ok(T1)]);
        await r.abrir("tableta", mandar);
        t += REUSO_MAX_MS + 1;
        await r.abrir("tableta", mandar);
        expect(enviadas.filter((e) => e.nombre === "abrir-sesion")).toHaveLength(2);
    });

    it("`usada` mantiene viva la sesión que se lee a menudo", async () => {
        let t = 1_000;
        const r = new RegistroSesiones(() => t);
        const { mandar, enviadas } = banco([ok(T1)]);
        await r.abrir("tableta", mandar);
        for (let i = 0; i < 5; i++) {
            t += REUSO_MAX_MS - 1000;
            r.usada("tableta");
            await r.abrir("tableta", mandar);
        }
        expect(enviadas).toHaveLength(1);
    });
});

describe("S2 · un cierre solo cierra SU sesión", () => {
    it("la ventana vieja que se cierra no cierra la sesión que la nueva sigue usando", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([ok(T1)]);
        await r.abrir("tableta", mandar); // ventana vieja
        await r.abrir("tableta", mandar); // ventana nueva (reutiliza)
        await r.soltar("tableta", T1, mandar); // se cierra la vieja
        expect(enviadas.some((e) => e.nombre === "cerrar-sesion")).toBe(false);
        expect(r.tokenDe("tableta")).toBe(T1);
        await r.soltar("tableta", T1, mandar); // se cierra la nueva: ahora sí
        expect(enviadas.filter((e) => e.nombre === "cerrar-sesion")).toEqual([{ nombre: "cerrar-sesion", sesion: T1 }]);
        expect(r.tokenDe("tableta")).toBeNull();
    });

    it("el banco de llamadas (débil) usa la sesión pero no impide que la ventana la cierre, y no la cierra si la ventana sigue", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([ok(T1)]);
        await r.abrir("tableta", mandar); // ventana
        await r.abrir("tableta", mandar, { debil: true }); // banco
        await r.soltar("tableta", T1, mandar, false); // el banco acaba: la ventana sigue
        expect(enviadas.some((e) => e.nombre === "cerrar-sesion")).toBe(false);
        await r.soltar("tableta", T1, mandar); // la ventana acaba
        expect(enviadas.filter((e) => e.nombre === "cerrar-sesion")).toHaveLength(1);
    });

    it("cerrar con un token viejo nunca toca la sesión nueva: manda el cierre con el token viejo y deja la nueva viva", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([ok(T1), ok(T2)]);
        await r.abrir("tableta", mandar);
        r.olvidar("tableta", T1); // el aparato dijo «sin-sesion»
        await r.abrir("tableta", mandar, { forzar: true }); // sesión nueva
        await r.soltar("tableta", T1, mandar); // la ventana vieja acaba tarde
        expect(enviadas.filter((e) => e.nombre === "cerrar-sesion")).toEqual([{ nombre: "cerrar-sesion", sesion: T1 }]);
        expect(r.tokenDe("tableta")).toBe(T2);
    });
});

describe("S3 · rechazo terminal: se dice y se espera con retroceso", () => {
    it("un reintento automático no insiste tras «permiso-apagado»: espera 30 s, luego el doble; una persona sí puede volver a pedir", async () => {
        let t = 10_000;
        const r = new RegistroSesiones(() => t);
        const { mandar, enviadas } = banco([no("permiso-apagado")]);
        await r.abrir("tableta", mandar, { auto: true });
        const durante = await r.abrir("tableta", mandar, { auto: true });
        expect(enviadas).toHaveLength(1);
        expect(durante.motivo).toBe("permiso-apagado");
        expect(r.enEspera("tableta")?.hasta).toBe(10_000 + ESPERA_TERMINAL_MS);
        t += ESPERA_TERMINAL_MS + 1;
        await r.abrir("tableta", mandar, { auto: true });
        expect(enviadas).toHaveLength(2);
        expect(r.enEspera("tableta")?.hasta).toBe(t + ESPERA_TERMINAL_MS * 2);
        // una persona pulsa «Reabrir»: se pide aunque haya espera.
        await r.abrir("tableta", mandar);
        expect(enviadas).toHaveLength(3);
    });

    it("un rechazo que no es terminal (p. ej. «limite») no abre espera", async () => {
        const r = new RegistroSesiones();
        const { mandar, enviadas } = banco([no("limite"), ok(T1)]);
        await r.abrir("tableta", mandar, { auto: true });
        await r.abrir("tableta", mandar, { auto: true });
        expect(enviadas).toHaveLength(2);
        expect(r.enEspera("tableta")).toBeNull();
    });

    it("un rechazo transitorio de transporte reintenta una sola vez tras 450 ms", async () => {
        const esperas: number[] = [];
        const r = new RegistroSesiones(() => Date.now(), async (ms) => {
            esperas.push(ms);
        });
        const { mandar, enviadas } = banco([no("sin-enlace"), ok(T1)]);
        const res = await r.abrir("tableta", mandar);
        expect(res.ok).toBe(true);
        expect(esperas).toEqual([450]);
        expect(enviadas.filter((e) => e.nombre === "abrir-sesion")).toHaveLength(2);
    });
});
