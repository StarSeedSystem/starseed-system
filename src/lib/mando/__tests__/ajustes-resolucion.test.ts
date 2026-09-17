import { describe, it, expect } from "vitest";

import { AJUSTES_POR_DEFECTO, validarConfig } from "../ajustes-tipos";

describe("ajustes · resolucionAutomatica", () => {
    it("el valor por defecto es true (encendido)", () => {
        expect(AJUSTES_POR_DEFECTO.resolucionAutomatica).toBe(true);
    });

    it("una configuración SIN la llave se lee como true", () => {
        const cfg = validarConfig({ workers: 3 });
        expect(cfg.resolucionAutomatica).toBe(true);
    });

    it("un false explícito se respeta", () => {
        const cfg = validarConfig({ resolucionAutomatica: false });
        expect(cfg.resolucionAutomatica).toBe(false);
    });

    it("un true explícito se respeta", () => {
        const cfg = validarConfig({ resolucionAutomatica: true });
        expect(cfg.resolucionAutomatica).toBe(true);
    });

    it("un valor no booleano cae al valor por defecto", () => {
        expect(validarConfig({ resolucionAutomatica: "sí" }).resolucionAutomatica).toBe(true);
        expect(validarConfig({ resolucionAutomatica: 1 }).resolucionAutomatica).toBe(true);
        expect(validarConfig({ resolucionAutomatica: null }).resolucionAutomatica).toBe(true);
        expect(validarConfig(null).resolucionAutomatica).toBe(true);
    });
});
