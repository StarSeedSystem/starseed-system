import { describe, expect, it } from "vitest";
import {
    LARGO_MAX_MOTIVO,
    RUTA_ERROR_CALLBACK,
    destinoFalloCallback,
    motivoFalloAuth,
} from "../callback-acceso";

describe("motivoFalloAuth", () => {
    it("prefiere el código de Supabase al nombre del error", () => {
        const error = Object.assign(new Error("fallo interno con detalles privados"), { code: "invalid_request" });
        expect(motivoFalloAuth(error)).toBe("invalid_request");
    });

    it("sin código usa el nombre del error, nunca el mensaje", () => {
        const error = new Error("token secreto 123");
        expect(motivoFalloAuth(error)).toBe("Error");
    });

    it("recorta el motivo para que no crezca sin límite", () => {
        const error = Object.assign(new Error("x"), { code: "a".repeat(200) });
        expect(motivoFalloAuth(error)).toHaveLength(LARGO_MAX_MOTIVO);
    });

    it("lo que no es un Error no se copia tal cual", () => {
        expect(motivoFalloAuth("texto con datos")).toBe("desconocido");
        expect(motivoFalloAuth({ message: "objeto" })).toBe("desconocido");
    });

    it("sin error distingue el caso de no traer código", () => {
        expect(motivoFalloAuth(null)).toBe("sin-codigo");
        expect(motivoFalloAuth(undefined)).toBe("sin-codigo");
    });
});

describe("destinoFalloCallback", () => {
    it("vuelve al acceso con el error y su motivo codificado", () => {
        const error = Object.assign(new Error("x"), { code: "bad code/&" });
        expect(destinoFalloCallback(error)).toBe(`${RUTA_ERROR_CALLBACK}&motivo=bad%20code%2F%26`);
    });

    it("sin código vuelve al acceso sin inventar un motivo", () => {
        expect(destinoFalloCallback()).toBe(`${RUTA_ERROR_CALLBACK}&motivo=sin-codigo`);
    });
});
