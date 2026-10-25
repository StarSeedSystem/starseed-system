/**
 * Rescate RTIMN1021I · los ajustes de la imaginación que main conserva.
 * ─────────────────────────────────────────────────────────────────────────────
 * La rama nube/40145158800 probaba un editor de rango, fuentes, horario y franjas que main ya no
 * pinta (hoy manda `auto`: aprobación, reimaginación, umbral y tope). Se rescatan sus intenciones
 * que siguen vivas en la API de hoy: los topes de `validarAjustes` y la carga de lo guardado en
 * `PanelImaginacion`. Sin red: `fetch` es un doble y el panel se desmonta al terminar.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelImaginacion } from "@/components/mando/panel-imaginacion";
import { AJUSTES_POR_DEFECTO, validarAjustes, type AjustesAutodesarrollo } from "@/lib/mando/imaginacion-tipos";

const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("validarAjustes · lo que main conserva de los topes", () => {
    it("acota por abajo la frecuencia profunda y el rango, sin dejar mínimos imposibles", () => {
        expect(validarAjustes({ profunda: { cada_dias: -5 } }).profunda).toEqual({ cada_dias: 0 });
        expect(validarAjustes({ rango: { max: -3 } }).rango).toEqual({ min: 0, max: 0 });
        expect(validarAjustes({ rango: { min: 12 } }).rango).toEqual({ min: 10, max: 10 });
        expect(validarAjustes({ profunda: { cada_dias: 999 } }).profunda).toEqual({ cada_dias: 365 });
    });
});

describe("PanelImaginacion · ajustes guardados", () => {
    it("carga el automático del servidor y pinta interruptores, umbral y tope", async () => {
        const guardados: AjustesAutodesarrollo = {
            ...AJUSTES_POR_DEFECTO,
            auto: { aprobar: true, reimaginar: true, umbral: 0.9, max_reimaginaciones: 4 },
        };
        const fetchFalso = vi.fn(async () => json({ propuestas: [], ajustes: guardados, resumen: {} }));
        vi.stubGlobal("fetch", fetchFalso);

        render(<PanelImaginacion ambito="personal" />);

        expect(await screen.findByRole("switch", { name: "Aprobación automática" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("switch", { name: "Reimaginación automática" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("slider", { name: /Umbral de utilidad/ })).toHaveValue("0.9");
        expect(screen.getByLabelText("Tope de reimaginaciones")).toHaveValue(4);
        expect(screen.getByRole("button", { name: "Guardar umbral y tope" })).toBeDisabled();
        expect(screen.getByTestId("imaginacion-regla-fija")).toHaveTextContent("Lo de importancia alta o crítica siempre espera tu visto bueno.");
        expect(fetchFalso).toHaveBeenCalledWith("/api/mando/imaginacion?ambito=personal", { cache: "no-store" });
    });
});
