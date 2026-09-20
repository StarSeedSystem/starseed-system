import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TarjetaSesionesClaude, tonoRelectura } from "../uso-claude";

const fetchOriginal = globalThis.fetch;

afterEach(() => {
    cleanup();
    globalThis.fetch = fetchOriginal;
});

function responder(cuerpo: unknown) {
    globalThis.fetch = (async () =>
        new Response(JSON.stringify(cuerpo), { status: 200 })) as typeof fetch;
}

const resumenVerde = {
    disponible: true,
    total: {
        input: 5_000,
        output: 2_500,
        cache_read: 1_900_000,
        cache_creation: 93_000,
        turnos: 42,
        relectura_pct: 95.5,
        total: 2_000_500,
    },
    sesiones: [
        {
            archivo: "abc123.jsonl",
            cuando: "2026-09-20T18:30:00.000Z",
            proyecto: "starseed os",
            input: 3_000,
            output: 1_200,
            cache_read: 950_000,
            cache_creation: 45_000,
            turnos: 20,
            relectura_pct: 95.05,
        },
    ],
};

describe("tonoRelectura (puro)", () => {
    it("verde ≥70, ámbar 40–70, rojo <40", () => {
        expect(tonoRelectura(70)).toContain("emerald");
        expect(tonoRelectura(95.5)).toContain("emerald");
        expect(tonoRelectura(50)).toContain("amber");
        expect(tonoRelectura(40)).toContain("amber");
        expect(tonoRelectura(39.9)).toContain("red");
        expect(tonoRelectura(0)).toContain("red");
    });
});

describe("TarjetaSesionesClaude", () => {
    it("muestra totales compactos, el % y su tono verde", async () => {
        responder(resumenVerde);
        render(<TarjetaSesionesClaude />);

        const pastilla = await screen.findByTestId("uso-claude-relectura");
        expect(pastilla).toHaveTextContent("95.5 %");
        expect(pastilla.className).toContain("text-emerald-300");
        expect(screen.getByText("Sesiones de Claude en esta Mac")).toBeInTheDocument();
        // 2 000 500 → «2 M» (regex por si cambia el espacio)
        expect(screen.getByText(/2\s?M\b/)).toBeInTheDocument();
        // Sesión: turnos y tono verde del %
        expect(screen.getByText("20 turnos")).toBeInTheDocument();
        expect(screen.getByText("95.05 %").className).toContain("text-emerald-300");
    });

    it("tono rojo cuando el % de relectura es bajo", async () => {
        responder({
            ...resumenVerde,
            total: { ...resumenVerde.total, relectura_pct: 12 },
        });
        render(<TarjetaSesionesClaude />);

        const pastilla = await screen.findByTestId("uso-claude-relectura");
        expect(pastilla).toHaveTextContent("12 %");
        expect(pastilla.className).toContain("text-red-300");
    });

    it("línea honesta cuando no hay sesiones en la Mac", async () => {
        responder({
            disponible: false,
            total: { input: 0, output: 0, cache_read: 0, cache_creation: 0, turnos: 0, relectura_pct: 0, total: 0 },
            sesiones: [],
        });
        render(<TarjetaSesionesClaude />);

        expect(await screen.findByText("Sin sesiones de Claude Code en esta Mac.")).toBeInTheDocument();
    });
});
