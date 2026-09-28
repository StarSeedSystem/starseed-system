import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debeBloquear, guardarConfigBloqueo, leerConfigBloqueo, SIN_BLOQUEO, type ConfigBloqueo } from "../politica-bloqueo";

const pin = { metodo: "pin" as const, sal: "s", hash: "h", iteraciones: 1, v: 1 as const };
const base: ConfigBloqueo = { metodo: "pin", alAbrir: true, minutosInactividad: 5, secreto: pin, v: 1 };
const M = (o: Partial<Parameters<typeof debeBloquear>[0]>) => debeBloquear({ cfg: base, desbloqueadoEn: null, ultimaActividad: 0, ocultaDesde: null, ahora: 0, recienAbierta: false, ...o });

beforeEach(() => {
    const d = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe("cuándo bloquear", () => {
    it("nunca sin método", () => expect(M({ cfg: SIN_BLOQUEO, recienAbierta: true })).toBe(false));
    it("al abrir, si así se pidió y no se desbloqueó en esta pestaña", () => {
        expect(M({ recienAbierta: true })).toBe(true);
        expect(M({ recienAbierta: true, desbloqueadoEn: 1, ahora: 2, ultimaActividad: 2 })).toBe(false);
        expect(M({ recienAbierta: true, cfg: { ...base, alAbrir: false } })).toBe(false);
    });
    it("por inactividad o por haber estado oculta el plazo", () => {
        expect(M({ ultimaActividad: 0, ahora: 4 * 60_000 })).toBe(false);
        expect(M({ ultimaActividad: 0, ahora: 5 * 60_000 })).toBe(true);
        expect(M({ ultimaActividad: 9 * 60_000, ocultaDesde: 1, ahora: 9 * 60_000 })).toBe(true);
        expect(M({ cfg: { ...base, minutosInactividad: 0 }, ahora: 99 * 60_000 })).toBe(false);
    });
});

describe("almacén por neurona", () => {
    it("ida y vuelta; sin nada, «ninguno»", () => {
        expect(leerConfigBloqueo("n1").metodo).toBe("ninguno");
        guardarConfigBloqueo("n1", base);
        expect(leerConfigBloqueo("n1")).toMatchObject({ metodo: "pin", minutosInactividad: 5 });
        expect(leerConfigBloqueo("n2").metodo).toBe("ninguno");
    });
    it("la biometría sin PIN de respaldo se rechaza con un motivo claro", () => {
        const passkey = { credencialId: "a", clavePublica: "b", alg: -7 as const, creadaEn: 1, v: 1 as const };
        expect(() => guardarConfigBloqueo("n1", { ...base, metodo: "biometria", passkey })).toThrow(/PIN de respaldo/);
        expect(() => guardarConfigBloqueo("n1", { ...base, metodo: "biometria", passkey, respaldo: pin })).not.toThrow();
    });
});
