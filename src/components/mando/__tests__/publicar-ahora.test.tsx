import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PublicarAhora } from "@/components/mando/publicar-ahora";
import { normalizarDiario, tituloDeEstado, type DiarioPublicacion } from "@/lib/mando/publicador-tipos";

function diario(extra: Partial<DiarioPublicacion> = {}): DiarioPublicacion {
    return {
        id: "20260915-010203",
        estado: "hecho",
        nota: "una nota larga de verdad",
        empezado: "2026-09-15 01:02:03",
        terminado: "2026-09-15 01:15:00",
        resumen: "2 cambios publicados, verificados uno a uno",
        pasos: [
            { clave: "tsc", titulo: "Tipos (tsc --noEmit)", estado: "ok", detalle: "en verde", segundos: 95 },
            { clave: "build", titulo: "Construir (next build)", estado: "omitido", detalle: "solo Python", segundos: 0 },
        ],
        verificacion: [],
        ...extra,
    };
}

describe("PublicarAhora · el botón que faltaba", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lanzado: true }), { status: 200 })));
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("no deja publicar sin decir qué se publica: un commit sin asunto no se entiende después", () => {
        render(<PublicarAhora diario={null} alCambiar={() => {}} />);
        const boton = screen.getByRole("button", { name: /commitear y publicar/i });
        expect(boton).toBeDisabled();
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "corto" } });
        expect(boton).toBeDisabled();
    });

    it("con una nota de verdad publica y manda la acción «publicar»", async () => {
        const alCambiar = vi.fn();
        render(<PublicarAhora diario={null} alCambiar={alCambiar} />);
        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "arreglo el medidor de listas" },
        });
        fireEvent.click(screen.getByRole("button", { name: /commitear y publicar/i }));
        await waitFor(() => expect(alCambiar).toHaveBeenCalled());
        const cuerpo = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
        expect(cuerpo.accion).toBe("publicar");
        expect(cuerpo.nota).toContain("medidor");
    });

    it("mientras publica, el botón no deja lanzar una segunda vez", () => {
        render(<PublicarAhora diario={diario({ estado: "corriendo" })} alCambiar={() => {}} />);
        expect(screen.getByRole("button", { name: /publicando/i })).toBeDisabled();
    });

    it("enseña cada paso con su estado, y el omitido dice por qué", () => {
        render(<PublicarAhora diario={diario()} alCambiar={() => {}} />);
        expect(screen.getByText(/Tipos \(tsc --noEmit\)/)).toBeInTheDocument();
        expect(screen.getByText("solo Python")).toBeInTheDocument();
    });

    it("nombra cada cambio verificado y dice si quedó aplicado o solo integrado", () => {
        render(
            <PublicarAhora
                diario={diario({
                    estado: "con_avisos",
                    verificacion: [
                        {
                            sha: "abc1234",
                            titulo: "el medidor deja de mentir",
                            integrado: true,
                            aplicado: true,
                            servido: true,
                            porque: "integrado en origin/main, cableado y servido por la build viva",
                            archivos: [{ ruta: "src/lib/mando/medidores.ts", ok: true, porque: "lo usa 1 archivo" }],
                        },
                        {
                            sha: "def5678",
                            titulo: "reportes.ts",
                            integrado: true,
                            aplicado: false,
                            servido: true,
                            porque: "está en main pero nadie lo usa: src/lib/mando/reportes.ts",
                            archivos: [{ ruta: "src/lib/mando/reportes.ts", ok: false, porque: "HUÉRFANO" }],
                        },
                    ],
                })}
                alCambiar={() => {}}
            />,
        );
        expect(screen.getByText("abc1234")).toBeInTheDocument();
        expect(screen.getByText("def5678")).toBeInTheDocument();
        expect(screen.getByText(/nadie lo usa/)).toBeInTheDocument();
        expect(screen.getByText("HUÉRFANO", { exact: false })).toBeInTheDocument();
    });
});

describe("publicador · lectura del diario que escribe Python", () => {
    it("traduce motivo_servido y aguanta un diario a medio escribir", () => {
        const d = normalizarDiario({
            id: "x",
            estado: "hecho",
            pasos: [{ clave: "push", titulo: "Publicar", estado: "ok" }],
            verificacion: [{ sha: "a", motivo_servido: "la build viva es posterior", servido: null }],
        });
        expect(d?.pasos[0].segundos).toBe(0);
        expect(d?.verificacion[0].motivoServido).toBe("la build viva es posterior");
        expect(d?.verificacion[0].servido).toBeNull();
        expect(normalizarDiario(null)).toBeNull();
    });

    it("el título dice en qué paso va, no solo «corriendo»", () => {
        expect(tituloDeEstado(null)).toMatch(/Nadie ha publicado/);
        expect(
            tituloDeEstado(
                diario({
                    estado: "corriendo",
                    pasos: [
                        { clave: "tsc", titulo: "Tipos", estado: "ok", detalle: "", segundos: 1 },
                        { clave: "vitest", titulo: "Pruebas del OS", estado: "corriendo", detalle: "", segundos: 0 },
                    ],
                }),
            ),
        ).toBe("Publicando · Pruebas del OS");
        expect(
            tituloDeEstado(
                diario({
                    estado: "fallo",
                    pasos: [{ clave: "vitest", titulo: "Pruebas del OS", estado: "falla", detalle: "", segundos: 1 }],
                }),
            ),
        ).toBe("No se publicó · Pruebas del OS");
        expect(tituloDeEstado(diario())).toBe("Publicado y verificado");
    });
});
