import { describe, expect, it } from "vitest";

import {
    interpretarEstadoEspejo,
    type EstadoEspejoDriveInput,
    type InterpretacionEspejo,
} from "@/lib/mando/drive-carpetas";

describe("interpretarEstadoEspejo", () => {
    const AHORA_FIX = Date.parse("2026-09-20T17:00:00.000Z");

    it("maneja estado nulo o Drive no montado", () => {
        const resNull = interpretarEstadoEspejo(null, AHORA_FIX);
        expect(resNull.tono).toBe("peligro");
        expect(resNull.titulo).toBe("Drive no montado");
        expect(resNull.cuando).toBe("sin montar");

        const resDesmontado = interpretarEstadoEspejo({ montado: false }, AHORA_FIX);
        expect(resDesmontado.tono).toBe("peligro");
        expect(resDesmontado.cuando).toBe("sin montar");
    });

    it("maneja Drive montado sin datos de espejo", () => {
        const resSinEspejo = interpretarEstadoEspejo({ montado: true, espejo: null }, AHORA_FIX);
        expect(resSinEspejo.tono).toBe("aviso");
        expect(resSinEspejo.titulo).toBe("Sin espejo");
        expect(resSinEspejo.cuando).toBe("nunca");
    });

    it("interpreta espejo al día (hace 12 min)", () => {
        const hace12min = new Date(AHORA_FIX - 12 * 60 * 1000).toISOString();
        const res = interpretarEstadoEspejo({
            montado: true,
            espejo: { ruta: "~/Drive", ultimoEspejo: hace12min, mb: 19.1 },
        }, AHORA_FIX);

        expect(res.tono).toBe("ok");
        expect(res.titulo).toBe("Espejo al día");
        expect(res.cuando).toBe("hace 12 min");
        expect(res.detalle).toContain("hace 12 min");
    });

    it("interpreta espejo de hoy (hace 5 h)", () => {
        const hace5h = new Date(AHORA_FIX - 5 * 3600 * 1000).toISOString();
        const res = interpretarEstadoEspejo({
            montado: true,
            espejo: { ruta: "~/Drive", ultimoEspejo: hace5h, mb: 200 },
        }, AHORA_FIX);

        expect(res.tono).toBe("aviso");
        expect(res.titulo).toBe("Espejo de hoy");
        expect(res.cuando).toBe("hace 5 h");
    });

    it("interpreta espejo atrasado (sin espejo desde ayer)", () => {
        const hace26h = new Date(AHORA_FIX - 26 * 3600 * 1000).toISOString();
        const res = interpretarEstadoEspejo({
            montado: true,
            espejo: { ruta: "~/Drive", ultimoEspejo: hace26h, mb: 50 },
        }, AHORA_FIX);

        expect(res.tono).toBe("peligro");
        expect(res.titulo).toBe("Espejo atrasado");
        expect(res.cuando).toBe("ayer");
        expect(res.detalle).toContain("sin espejo desde ayer");
    });

    it("maneja errores y fechas corruptas", () => {
        const resError = interpretarEstadoEspejo({ montado: true, error: "Conexión rechazada" }, AHORA_FIX);
        expect(resError.tono).toBe("peligro");
        expect(resError.titulo).toBe("Error en espejo");

        const resFechaInvalida = interpretarEstadoEspejo({
            montado: true,
            espejo: { ruta: "~/Drive", ultimoEspejo: "fecha-invalida", mb: 0 },
        }, AHORA_FIX);
        expect(resFechaInvalida.tono).toBe("peligro");
        expect(resFechaInvalida.titulo).toBe("Fecha inválida");
    });
});
