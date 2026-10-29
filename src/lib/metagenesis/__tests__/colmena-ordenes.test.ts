import { ordenDesconectar, ordenContenedor, comandoInstalar } from "../colmena";
import { describe, it, expect } from "vitest";

describe("ordenes de colmena", () => {
    it("ordenDesconectar devuelve objeto correcto", () => {
        expect(ordenDesconectar("mac-a1b2c3")).toEqual({ accion: "desconectar", para: "mac-a1b2c3", args: {} });
    });

    it("ordenContenedor con activo true y agentes > TOPE_AGENTES", () => {
        const orden = ordenContenedor("mac-a1b2c3", true, 5);
        expect(orden).toEqual({ accion: "contenedor", para: "mac-a1b2c3", args: { activo: true, trabajadores: 4 } });
    });

    it("ordenContenedor con activo true y agentes <= TOPE_AGENTES", () => {
        const orden = ordenContenedor("mac-a1b2c3", true, 2);
        expect(orden).toEqual({ accion: "contenedor", para: "mac-a1b2c3", args: { activo: true, trabajadores: 2 } });
    });

    it("ordenContenedor con activo false no incluye trabajadores", () => {
        const orden = ordenContenedor("mac-a1b2c3", false);
        expect(orden).toEqual({ accion: "contenedor", para: "mac-a1b2c3", args: { activo: false } });
    });

    it("ordenContenedor con agentes 0 la clampa a 1", () => {
        const orden = ordenContenedor("mac-a1b2c3", true, 0);
        expect(orden.args.trabajadores).toBe(1);
    });

    it("comandoInstalar devuelve null cuando origen inválido o código inválido", () => {
        expect(comandoInstalar("invalid-url", "ABCDEF")).toBeNull();
        expect(comandoInstalar("https://example.com", "abc")) .toBeNull();
        expect(comandoInstalar("https://example.com", "ABCDE")) .toBeNull();
        expect(comandoInstalar("https://example.com", "ABCDEFGHIJKLMNO1234567")) .toBeNull();
        expect(comandoInstalar("https://example.com", "Abcdef")) .toBeNull();
    });

    it("comandoInstalar devuelve comando válido cuando datos correctos", () => {
        expect(comandoInstalar("https://example.com", "ABCDEF")).toBe(
            "curl -fsSL https://example.com/trabajador.sh | bash -s -- --emparejar ABCDEF"
        );
    });
});
