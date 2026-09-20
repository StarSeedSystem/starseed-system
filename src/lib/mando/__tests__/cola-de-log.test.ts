import { describe, expect, it } from "vitest";
import { idSeguro, recortarDesde, ultimasLineas } from "../cola-de-log";

describe("idSeguro", () => {
    it("acepta identificadores válidos", () => {
        expect(idSeguro("ABC123")).toBe(true);
        expect(idSeguro("tarea_01")).toBe(true);
        expect(idSeguro("x-y_z")).toBe(true);
    });
    it("rechaza rutas peligrosas", () => {
        expect(idSeguro("../../etc/passwd")).toBe(false);
        expect(idSeguro("a".repeat(41))).toBe(false);
        expect(idSeguro("")).toBe(false);
        expect(idSeguro("hola/mundo")).toBe(false);
    });
});

describe("recortarDesde", () => {
    it("devuelve todo desde 0", () => {
        const r = recortarDesde("hola mundo", 0);
        expect(r.nuevo).toBe("hola mundo");
    });
    it("devuelve vacío si desde supera el tamaño", () => {
        const r = recortarDesde("hola", 100);
        expect(r.nuevo).toBe("");
    });
    it("corta correctamente en bytes", () => {
        // "cafécafé" = 10 bytes (cada "é" = 2 bytes)
        const texto = "cafécafé";
        const r = recortarDesde(texto, 4); // después de "cafe" (4 bytes)
        expect(r.nuevo).toBe("écafé"); // 6 bytes restantes
    });
});

describe("ultimasLineas", () => {
    it("devuelve las últimas líneas", () => {
        const texto = ["a", "b", "c", "d", "e"].join("\n");
        expect(ultimasLineas(texto, 2)).toBe("d\ne");
    });
    it("devuelve todo si n es mayor que líneas", () => {
        expect(ultimasLineas("a\nb", 10)).toBe("a\nb");
    });
});
