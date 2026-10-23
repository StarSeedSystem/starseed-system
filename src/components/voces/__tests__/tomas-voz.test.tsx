import { describe, expect, it } from "vitest";

import { mensajeErrorMedia, mensajeErrorReproduccion } from "@/components/voces/tomas-voz";

describe("mensajeErrorReproduccion", () => {
    it("distingue el autoplay bloqueado de la decodificación y de la red", () => {
        expect(mensajeErrorReproduccion({ name: "NotAllowedError" })).toContain("bloqueó");
        expect(mensajeErrorReproduccion({ name: "NotSupportedError" })).toContain("decodificar");
        expect(mensajeErrorReproduccion({ name: "EncodingError" })).toContain("decodificar");
        expect(mensajeErrorReproduccion({ name: "NetworkError" })).toContain("red");
        expect(mensajeErrorReproduccion({ name: "AbortError" })).toContain("interrumpió");
    });

    it("un fallo desconocido no se calla: nombra las tres causas posibles", () => {
        const texto = mensajeErrorReproduccion(new Error("boom"));
        expect(texto).toContain("decodificación, red o una política de autoplay");
        expect(mensajeErrorReproduccion(null)).toBe(texto);
        expect(mensajeErrorReproduccion(undefined)).toBe(texto);
    });
});

describe("mensajeErrorMedia", () => {
    it("traduce cada código del MediaError del navegador", () => {
        expect(mensajeErrorMedia(1)).toContain("canceló");
        expect(mensajeErrorMedia(2)).toContain("red");
        expect(mensajeErrorMedia(3)).toContain("decodificar");
        expect(mensajeErrorMedia(4)).toContain("formato");
    });

    it("sin código no inventa la causa, pero avisa de que no suena", () => {
        expect(mensajeErrorMedia(null)).toContain("no suena");
        expect(mensajeErrorMedia(undefined)).toContain("no suena");
        expect(mensajeErrorMedia(99)).toContain("no suena");
    });
});
