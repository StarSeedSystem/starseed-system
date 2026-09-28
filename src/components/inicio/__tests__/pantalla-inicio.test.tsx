import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/desktop/desktop-widget-host", () => ({ DesktopWidgetHost: ({ type }: { type: string }) => <div>{type}</div> }));
vi.mock("@/components/widgets-libres/registro-libre", () => ({ TIPOS_CON_DISENO_LIBRE: ["CLOCK_DATE"] }));
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { width: 200, height: 200, tier: "regular", vTier: "regular", landscape: true } }),
}));

import { PantallaInicio } from "../pantalla-inicio";
import { CLAVE_WIDGETS_INICIO } from "@/lib/inicio/widgets-inicio";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("PantallaInicio", () => {
    it("pinta los ocho básicos por defecto", () => {
        render(<PantallaInicio />);
        for (const t of ["CLOCK_DATE", "WEATHER_BASIC", "NOTIFICATIONS", "MY_EVENTS", "QUICK_ACCESS", "SYSTEM_STATUS", "AURORA_LAST", "TASKS_QUICK"]) {
            expect(screen.getByTestId(`pieza-${t}`)).toBeTruthy();
        }
    });
    it("Personalizar → Quitar elimina uno y lo guarda en el perfil", () => {
        render(<PantallaInicio />);
        fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));
        const quitar = screen.getAllByRole("button", { name: /^Quitar / })[1];
        fireEvent.click(quitar);
        const guardado = JSON.parse(localStorage.getItem(CLAVE_WIDGETS_INICIO)!);
        expect(guardado.perfiles.local).toHaveLength(7);
    });
});
