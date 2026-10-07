import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactivadorDirectores } from "../reactivador-directores";

const hecho = {
    t: "2026-10-06 23:20:00",
    enMarcha: false,
    resumen: "1 reparado(s) · 3 bien",
    pasos: [
        { paso: "Servicios de Genesis", estado: "ok", detalle: "21 servicios vivos" },
        { paso: "Directores de autocuración", estado: "reparado", detalle: "orden de refrescar proveedores" },
    ],
};

function respuesta(cuerpo: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ReactivadorDirectores", () => {
    let llamadas: { url: string; metodo: string }[];
    let parteActual: unknown;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        llamadas = [];
        parteActual = null;
        vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
            llamadas.push({ url, metodo: init?.method ?? "GET" });
            if (init?.method === "POST") {
                parteActual = { ...hecho, enMarcha: true, pasos: hecho.pasos.slice(0, 1), resumen: "en marcha…" };
                return respuesta({ lanzado: true }, 202);
            }
            return respuesta({ informe: parteActual });
        }));
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("lanza el reactivador, enseña que trabaja y luego el parte paso a paso", async () => {
        render(<ReactivadorDirectores />);
        await act(async () => {});
        const boton = screen.getByRole("button", { name: /Reactivar/ });
        await act(async () => {
            fireEvent.click(boton);
        });
        expect(llamadas.some((l) => l.metodo === "POST")).toBe(true);
        expect(screen.getByRole("button", { name: /Reactivando/ })).toHaveProperty("disabled", true);
        parteActual = hecho;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2600);
        });
        expect(screen.getByRole("button", { name: /^Reactivar$/ })).toHaveProperty("disabled", false);
        const parte = screen.getByRole("list", { name: "Parte del reactivador" });
        expect(parte.textContent).toContain("Directores de autocuración");
        expect(parte.textContent).toContain("reparado");
    });

    it("si ya hay uno en marcha al abrir Genesis, lo sigue sin lanzar otro", async () => {
        parteActual = { ...hecho, enMarcha: true };
        render(<ReactivadorDirectores />);
        await act(async () => {});
        expect(screen.getByRole("button", { name: /Reactivando/ })).toHaveProperty("disabled", true);
        expect(llamadas.every((l) => l.metodo === "GET")).toBe(true);
    });

    it("dice por qué no pudo lanzarlo", async () => {
        vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) =>
            init?.method === "POST" ? respuesta({ error: "sin python" }, 500) : respuesta({ informe: null })));
        render(<ReactivadorDirectores />);
        await act(async () => {});
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Reactivar/ }));
        });
        expect(screen.getByRole("alert").textContent).toContain("sin python");
    });
});
