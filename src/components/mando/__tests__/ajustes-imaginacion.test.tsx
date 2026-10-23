import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import {
    AjustesImaginacion,
    alternarDia,
    recortarRango,
    textoDias,
    textoFranja,
} from "../ajustes-imaginacion";
import { AppearanceProvider } from "@/context/appearance-context";
import { AJUSTES_POR_DEFECTO } from "@/lib/mando/imaginacion-tipos";

function montar() {
    return render(
        <AppearanceProvider>
            <AjustesImaginacion />
        </AppearanceProvider>,
    );
}

describe("ayudas puras de los ajustes de imaginación", () => {
    it("textoDias nombra los días sin inventar y reconoce la semana entera", () => {
        expect(textoDias([0, 1, 2, 3, 4, 5, 6])).toBe("Todos los días");
        expect(textoDias([1, 2, 3, 4, 5])).toBe("De lunes a viernes");
        expect(textoDias([1, 3, 5])).toBe("lunes, miércoles, viernes");
        expect(textoDias([])).toBe("Ningún día");
        expect(textoDias([9, 1, 1])).toBe("lunes");
    });

    it("textoFranja une los días con el tramo horario", () => {
        expect(textoFranja({ dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" })).toBe(
            "Todos los días · 02:00–06:00",
        );
    });

    it("recortarRango ordena, redondea y acota a 0–10", () => {
        expect(recortarRango([8, 2])).toEqual({ min: 2, max: 8 });
        expect(recortarRango([-3, 14])).toEqual({ min: 0, max: 10 });
        expect(recortarRango([4.6, 4.2])).toEqual({ min: 4, max: 5 });
        expect(recortarRango([])).toEqual({ min: 0, max: 10 });
    });

    it("alternarDia enciende, apaga y mantiene el orden", () => {
        expect(alternarDia([3, 1], 2)).toEqual([1, 2, 3]);
        expect(alternarDia([1, 2, 3], 2)).toEqual([1, 3]);
        expect(alternarDia([1], 8)).toEqual([1]);
    });
});

describe("AjustesImaginacion", () => {
    let pedidos: { metodo: string; cuerpo?: unknown }[];
    let estado: number;

    function responder(cuerpo: unknown, status = 200) {
        return Promise.resolve(
            new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }),
        );
    }

    beforeEach(() => {
        pedidos = [];
        estado = 200;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
        vi.stubGlobal(
            "fetch",
            vi.fn((_url: string, init?: RequestInit) => {
                const metodo = init?.method ?? "GET";
                const cuerpo = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
                pedidos.push({ metodo, cuerpo });
                if (estado === 404) return responder({ error: "solo local" }, 404);
                if (metodo === "GET") return responder({ ajustes: AJUSTES_POR_DEFECTO });
                return responder({ ok: true, ajustes: (cuerpo as { ajustes?: unknown }).ajustes });
            }),
        );
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("pinta el automático, el rango, las cuatro fuentes y la regla fija", async () => {
        montar();
        expect(await screen.findByRole("switch", { name: "Automático" })).toBeChecked();
        expect(screen.getByText("Tareas autodesarrolladas por ciclo: de 0 a 10")).toBeInTheDocument();
        for (const nombre of [
            "Imaginación diaria",
            "Imaginación profunda",
            "Procesos imaginativos de Astraura",
            "Directores",
        ]) {
            expect(screen.getByRole("switch", { name: nombre })).toBeChecked();
        }
        expect(screen.getByRole("note")).toHaveTextContent(/Lo importante siempre espera tu visto bueno/);
        expect(screen.getByText("Inteligente")).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("Imaginación profunda cada N días (0 = nunca)")).toHaveValue(7);
    });

    it("apagar el automático se guarda con POST /api/mando/imaginacion", async () => {
        montar();
        fireEvent.click(await screen.findByRole("switch", { name: "Automático" }));
        fireEvent.click(screen.getByRole("button", { name: /Guardar ajustes/ }));
        await waitFor(() => expect(pedidos.some((p) => p.metodo === "POST")).toBe(true));
        const post = pedidos.find((p) => p.metodo === "POST");
        expect(post?.cuerpo).toMatchObject({ accion: "ajustes", ajustes: { automatico: false } });
        expect(await screen.findByRole("status")).toHaveTextContent(/Ajustes guardados/);
    });

    it("apagar una fuente y poner la profunda en 0 viaja en el mismo POST", async () => {
        montar();
        fireEvent.click(await screen.findByRole("switch", { name: "Imaginación diaria" }));
        fireEvent.change(screen.getByLabelText("Imaginación profunda cada N días (0 = nunca)"), {
            target: { value: "0" },
        });
        expect(screen.getByText("Nunca: no se programa la sesión profunda.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Guardar ajustes/ }));
        await waitFor(() => expect(pedidos.some((p) => p.metodo === "POST")).toBe(true));
        const enviado = pedidos.find((p) => p.metodo === "POST")?.cuerpo as {
            ajustes: { fuentes: { diaria: boolean }; profunda: { cada_dias: number } };
        };
        expect(enviado.ajustes.fuentes.diaria).toBe(false);
        expect(enviado.ajustes.profunda.cada_dias).toBe(0);
    });

    it("por franjas permite editar días y añadir o quitar franjas", async () => {
        montar();
        fireEvent.click(await screen.findByRole("button", { name: "Por franjas" }));
        expect(screen.getByLabelText("Franjas horarias")).toBeInTheDocument();
        expect(screen.getByText("Todos los días · 02:00–06:00")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "lunes" }));
        expect(screen.getByRole("button", { name: "lunes" })).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByText("domingo, martes, miércoles, jueves, viernes, sábado · 02:00–06:00")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Añadir franja/ }));
        expect(screen.getByLabelText("Días de la franja 2")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Quitar franja 2" }));
        expect(screen.queryByLabelText("Días de la franja 2")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Guardar ajustes/ }));
        await waitFor(() => expect(pedidos.some((p) => p.metodo === "POST")).toBe(true));
        const enviado = pedidos.find((p) => p.metodo === "POST")?.cuerpo as {
            ajustes: { horario: { modo: string; franjas: { dias: number[] }[] } };
        };
        expect(enviado.ajustes.horario.modo).toBe("franjas");
        expect(enviado.ajustes.horario.franjas[0]?.dias).not.toContain(1);
    });

    it("en producción (404) lo dice sin inventar datos", async () => {
        estado = 404;
        montar();
        expect(await screen.findByRole("status")).toHaveTextContent(/solo existen en el Genesis local/);
        expect(screen.queryByRole("switch", { name: "Automático" })).toBeNull();
    });
});
