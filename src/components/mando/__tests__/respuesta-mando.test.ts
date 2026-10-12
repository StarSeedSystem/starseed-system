import { describe, expect, it } from "vitest";
import { decidirRespuestaMando } from "../centro-mando";

// (2026-10-12) Alex vio «La consola solo funciona en tu máquina» en su propia Mac, con Genesis
// lento por la memoria: cualquier fallo encendía ese aviso. Solo un 404 significa «sin consola».
describe("decidirRespuestaMando", () => {
    it("404: esta instancia no tiene consola", () => {
        expect(decidirRespuestaMando(404)).toBe("sin-consola");
    });
    it("tiempo agotado, red cortada o servidor levantándose: tarda, no «solo en tu máquina»", () => {
        expect(decidirRespuestaMando(null)).toBe("sin-respuesta");
        expect(decidirRespuestaMando(502)).toBe("sin-respuesta");
        expect(decidirRespuestaMando(503)).toBe("sin-respuesta");
        expect(decidirRespuestaMando(500)).toBe("sin-respuesta");
    });
    it("2xx: hay datos", () => {
        expect(decidirRespuestaMando(200)).toBe("datos");
    });
});
