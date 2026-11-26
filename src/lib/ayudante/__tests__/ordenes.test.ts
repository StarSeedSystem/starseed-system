import { describe, it, expect } from "vitest";
import { validarComando, COMANDOS_APP } from "./ordenes";

describe("ordenes terminal", () => {
    it("valida comandos correctos", () => {
        expect(validarComando("estado")).toBe(true);
        expect(validarComando("reiniciar")).toBe(true);
    });

    it("rechaza comandos incorrectos", () => {
        expect(validarComando("invalid")).toBe(false);
        expect(validarComando("root")).toBe(false);
    });

    it("contiene los comandos esperados", () => {
        expect(COMANDOS_APP).toContain("formatear");
        expect(COMANDOS_APP).toContain("actualizar");
    });
});
