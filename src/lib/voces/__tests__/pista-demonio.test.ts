import { describe, it, expect } from "vitest";

import { pistaDemonioApagado } from "@/lib/voces/pista-demonio";

describe("pistaDemonioApagado", () => {
    it("dirige a la pestaña «Motores» con un paso concreto", () => {
        const { titulo, detalle } = pistaDemonioApagado();
        expect(titulo.length).toBeGreaterThan(0);
        expect(detalle).toContain("Motores");
        expect(detalle).toContain("Cargar este modelo");
    });

    it("no expone rutas del disco ni el comando de arranque", () => {
        const { titulo, detalle } = pistaDemonioApagado();
        const texto = `${titulo} ${detalle}`;
        expect(texto).not.toMatch(/[~/\\]/);
        expect(texto).not.toContain(".starseed");
        expect(texto).not.toContain(".gguf");
        expect(texto).not.toContain("tts-server");
        expect(texto).not.toContain("--model");
    });
});
