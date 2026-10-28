import { describe, it, expect } from "vitest";
import {
    validarRegistroMovimiento,
    resolverRegistroMovimiento,
    REGISTRO_MOVIMIENTO_DEFECTO,
} from "@/lib/design/entity-theme-scope";

describe("validarRegistroMovimiento", () => {
    it("acepta valores válidos", () => {
        expect(validarRegistroMovimiento("sobrio")).toBe("sobrio");
        expect(validarRegistroMovimiento("expresivo")).toBe("expresivo");
        expect(validarRegistroMovimiento("experimental")).toBe("experimental");
    });

    it("rechaza valores desconocidos y null", () => {
        expect(validarRegistroMovimiento("rápido")).toBeNull();
        expect(validarRegistroMovimiento("")).toBeNull();
        expect(validarRegistroMovimiento(null)).toBeNull();
        expect(validarRegistroMovimiento(123)).toBeNull();
    });
});

describe("resolverRegistroMovimiento — herencia y defecto", () => {
    it("devuelve defecto cuando no hay nada", () => {
        expect(resolverRegistroMovimiento()).toBe(REGISTRO_MOVIMIENTO_DEFECTO);
        expect(resolverRegistroMovimiento(null, null, null)).toBe("sobrio");
    });

    it("hereda cuenta → página → grupo", () => {
        const cuenta = { movimiento: "expresivo" as const };
        const pagina = { movimiento: "experimental" as const };
        const grupo = { movimiento: "sobrio" as const };

        expect(resolverRegistroMovimiento(cuenta, pagina, grupo)).toBe("sobrio");
    });

    it("grupo vacía usa página", () => {
        const pagina = { movimiento: "expresivo" as const };
        expect(resolverRegistroMovimiento(undefined, pagina, undefined)).toBe("expresivo");
    });

    it("página vacía usa cuenta", () => {
        const cuenta = { movimiento: "experimental" as const };
        expect(resolverRegistroMovimiento(cuenta, undefined, undefined)).toBe("experimental");
    });

    it("valores desconocidos vuelven al defecto", () => {
        const cuenta = { movimiento: "desconocido" as any };
        expect(resolverRegistroMovimiento(cuenta)).toBe("sobrio");
    });

    it("ignora null y usa el siguiente nivel", () => {
        const cuenta = { movimiento: "expresivo" as const };
        const pagina = { movimiento: null };
        expect(resolverRegistroMovimiento(cuenta, pagina, undefined)).toBe("expresivo");
    });
});
