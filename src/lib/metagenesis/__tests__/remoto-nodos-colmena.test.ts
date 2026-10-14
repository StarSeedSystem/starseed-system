import { describe, expect, it } from "vitest";
import { validarArgs } from "../remoto-nodos";

// Rescate de la rama nube a1-20261013-130438-RTS1010-EV-ORACLE-1acb: el único caso que
// refleja el contrato VIGENTE de `validarArgs` en main (los de «contenedor» prueban el
// contrato del lado Python, que el TypeScript todavía no replica).
describe("validarArgs: órdenes de la colmena", () => {
    it("desconectar no quiere argumentos", () => {
        expect(validarArgs("desconectar", {})).toBeNull();
        expect(validarArgs("desconectar", { motivo: "x" })).toContain("argumento no admitido");
    });
});
