/**
 * Aviso del demonio apagado (tarea IMG-profunda-eliminar-exposicion-de-comando).
 *
 * El panel Motor enseñaba el comando exacto de arranque: una línea de
 * terminal con rutas del disco del usuario. Esta prueba fija el contrato del
 * texto que lo sustituye: manda a la pestaña «Motores» del propio Estudio y
 * no vuelve a exponer ni rutas ni la línea de comandos.
 */

import { describe, expect, it } from "vitest";

import { avisoDemonioApagado } from "@/lib/aurora/voz-starseed/aviso-demonio";

describe("avisoDemonioApagado", () => {
    const texto = avisoDemonioApagado();

    it("manda a la pestaña «Motores» para levantar el demonio desde el OS", () => {
        expect(texto).toContain("Motores");
        expect(texto).toContain("demonio");
        expect(texto).toContain("Cargar este modelo");
    });

    it("no expone rutas del disco ni la línea de comandos que tenía el panel", () => {
        expect(texto).not.toContain("~/");
        expect(texto).not.toContain("/Users");
        expect(texto).not.toContain(".gguf");
        expect(texto).not.toContain("--model");
        expect(texto).not.toContain("--codec");
        expect(texto).not.toContain("tts-server");
    });
});
