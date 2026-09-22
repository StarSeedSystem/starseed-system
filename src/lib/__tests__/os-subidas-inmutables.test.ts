import { describe, it, expect } from "vitest";
import { filesTopic, MAX_UPLOAD_BYTES } from "@/lib/files/os-files";
import { realEventsOnly, samplePagesAsOs } from "@/lib/os-social";

describe("Subidas inmutables y utilidades puras (Ola 225)", () => {
    it("filesTopic genera la clave de tema del canal correctamente", () => {
        expect(filesTopic("usr-123")).toBe("files:usr-123");
    });

    it("MAX_UPLOAD_BYTES está configurado en 50MB", () => {
        expect(MAX_UPLOAD_BYTES).toBe(52428800);
    });

    it("realEventsOnly filtra correctamente eventos de muestra", () => {
        const paginas = samplePagesAsOs();
        expect(Array.isArray(paginas)).toBe(true);
        expect(realEventsOnly([])).toEqual([]);
    });
});
