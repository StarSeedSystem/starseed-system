import { describe, expect, it } from "vitest";
import {
    DEFAULTS_PRESIDENTE,
    validarConfigPresidente,
} from "../presidente-config";

describe("presidente-config", () => {
    it("acepta los valores por defecto sin modificaciones", () => {
        const res = validarConfigPresidente(DEFAULTS_PRESIDENTE);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.valor.orden_proveedores).toEqual(["claude", "hermes", "agy", "chatgpt"]);
            expect(res.valor.respaldo_flota_gratis).toBe(true);
        }
    });

    it("completa proveedores faltantes en orden_proveedores y normaliza campos", () => {
        const res = validarConfigPresidente({
            orden_proveedores: ["hermes", "agy"],
            timeouts_reintento_s: [90, 180],
            max_opus_dia: 25,
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.valor.orden_proveedores).toEqual(["hermes", "agy", "claude", "chatgpt"]);
            expect(res.valor.timeouts_reintento_s).toEqual([90, 180]);
            expect(res.valor.max_opus_dia).toBe(25);
        }
    });

    it("rechaza timeouts fuera de rango o proveedores desconocidos", () => {
        const res = validarConfigPresidente({
            orden_proveedores: ["inventado"],
            timeouts_reintento_s: [5],
            max_opus_dia: 999,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.errores.length).toBeGreaterThanOrEqual(3);
        }
    });
});
