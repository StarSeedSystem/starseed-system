import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { mensajeErrorMedia, mensajeErrorReproduccion, TomasVoz } from "@/components/voces/tomas-voz";
import { AppearanceProvider } from "@/context/appearance-context";
import { crearTomaVoz } from "@/lib/voces/tomas-voz";

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

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

describe("botón de cierre del comparador de tomas", () => {
    it("cierra la comparación y muestra foco visible para teclado", () => {
        crearTomaVoz({
            timbreId: "t-prueba",
            nombreVoz: "Prueba",
            texto: "hola",
            params: { instruct: "", speed: 1 },
            nivel: "alta",
        });
        crearTomaVoz({
            timbreId: "t-prueba",
            nombreVoz: "Prueba",
            texto: "adiós",
            params: { instruct: "", speed: 1.1 },
            nivel: "alta",
        });
        render(
            <AppearanceProvider>
                <TomasVoz timbreId="t-prueba" nombreVoz="Prueba" />
            </AppearanceProvider>,
        );

        const comparar = screen.getAllByRole("button", { name: "Comparar" });
        fireEvent.click(comparar[0]!);
        fireEvent.click(comparar[1]!);

        const cerrar = screen.getByRole("button", { name: "Cerrar comparación" });
        expect(cerrar.className).toMatch(/focus-visible/);
        fireEvent.click(cerrar);
        expect(screen.queryByRole("button", { name: "Cerrar comparación" })).not.toBeInTheDocument();
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
