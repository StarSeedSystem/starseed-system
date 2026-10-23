import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
    Button: ({ children, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => (
        <button {...(p as object)}>{children}</button>
    ),
}));

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

describe("TomasVoz · superficie de error", () => {
    it("muestra el motivo visible cuando play() rechaza y permite reintentar", async () => {
        const { render, screen, fireEvent, waitFor } = await import("@testing-library/react");
        const { crearTomaVoz } = await import("@/lib/voces/tomas-voz");
        const { TomasVoz } = await import("@/components/voces/tomas-voz");
        const play = vi.fn().mockRejectedValue({ name: "NotAllowedError" });
        vi.stubGlobal("Audio", function () { return { play, error: null }; });
        crearTomaVoz({
            timbreId: "t-err", nombreVoz: "Voz", texto: "hola", nivel: "estudio",
            params: { speed: 1, seed: 1 }, audioDataUrl: "AAAA", valoracion: 3,
        } as never);
        render(<TomasVoz timbreId="t-err" nombreVoz="Voz" />);
        fireEvent.click(screen.getAllByText("Reproducir")[0]);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("bloqueó"));
        fireEvent.click(screen.getByText("Reintentar"));
        await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
        vi.unstubAllGlobals();
    });
});
