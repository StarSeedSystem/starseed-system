import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/widgets-libres/familias/astraura-libre-proto", () => ({
    AstrauraLibreProto: ({ widget, onUpdateSettings }: { widget?: any; onUpdateSettings?: any }) => (
        <div data-testid="astraura-libre-proto" data-widget={JSON.stringify(widget)} data-on-update={!!onUpdateSettings} />
    ),
}));
vi.mock("@/components/widgets-libres/familias/reloj-libre", () => ({
    RelojLibre: ({ widget, onUpdateSettings }: { widget?: any; onUpdateSettings?: any }) => (
        <div data-testid="reloj-libre" data-widget={JSON.stringify(widget)} data-on-update={!!onUpdateSettings} />
    ),
}));
vi.mock("@/components/widgets-libres/familias/clima-libre", () => ({
    ClimaLibre: ({ widgetId }: { widgetId?: string }) => <div data-testid="clima-libre" data-widget-id={widgetId} />,
}));
vi.mock("@/components/widgets-libres/familias/notificaciones-libre", () => ({
    NotificacionesLibre: () => <div data-testid="notificaciones-libre" />,
}));
vi.mock("@/components/widgets-libres/familias/accesos-libre", () => ({
    AccesosLibre: () => <div data-testid="accesos-libre" />,
}));
vi.mock("@/components/widgets-libres/familias/estado-sistema-libre", () => ({
    EstadoSistemaLibre: () => <div data-testid="estado-sistema-libre" />,
}));
vi.mock("@/components/widgets-libres/familias/eventos-libre", () => ({
    EventosLibre: () => <div data-testid="eventos-libre" />,
}));
vi.mock("@/components/widgets-libres/familias/tareas-libre", () => ({
    TareasLibre: () => <div data-testid="tareas-libre" />,
}));

import { widgetLibre, TIPOS_CON_DISENO_LIBRE } from "../registro-libre";

describe("registro-libre: widget AURORA_LAST usa AstrauraLibreProto", () => {
    it("devuelve el widget nuevo y le llegan widget y onUpdateSettings", () => {
        const widget = { id: "w1", widget_type: "AURORA_LAST", settings: {} };
        const onUpdateSettings = vi.fn();

        const resultado = widgetLibre(widget, onUpdateSettings);

        expect(resultado).not.toBeNull();
        expect(React.isValidElement(resultado)).toBe(true);
        expect(resultado?.props?.children?.props?.["data-testid"]).toBe("astraura-libre-proto");
        expect(resultado?.props?.children?.props?.["data-widget"]).toBe(JSON.stringify(widget));
        expect(resultado?.props?.children?.props?.["data-on-update"]).toBe("true");
    });

    it("los demás tipos siguen devolviendo lo mismo", () => {
        const reloj = widgetLibre({ id: "w2", widget_type: "CLOCK_DATE", settings: {} }, vi.fn());
        expect(reloj?.props?.children?.props?.["data-testid"]).toBe("reloj-libre");

        const clima = widgetLibre({ id: "w3", widget_type: "WEATHER_BASIC", settings: {} });
        expect(clima?.props?.children?.props?.["data-testid"]).toBe("clima-libre");

        const notif = widgetLibre({ id: "w4", widget_type: "NOTIFICATIONS", settings: {} });
        expect(notif?.props?.children?.props?.["data-testid"]).toBe("notificaciones-libre");

        const accesos = widgetLibre({ id: "w5", widget_type: "QUICK_ACCESS", settings: {} });
        expect(accesos?.props?.children?.props?.["data-testid"]).toBe("accesos-libre");

        const estado = widgetLibre({ id: "w6", widget_type: "SYSTEM_STATUS", settings: {} });
        expect(estado?.props?.children?.props?.["data-testid"]).toBe("estado-sistema-libre");

        const eventos = widgetLibre({ id: "w7", widget_type: "MY_EVENTS", settings: {} });
        expect(eventos?.props?.children?.props?.["data-testid"]).toBe("eventos-libre");

        const tareas = widgetLibre({ id: "w8", widget_type: "TASKS_QUICK", settings: {} });
        expect(tareas?.props?.children?.props?.["data-testid"]).toBe("tareas-libre");
    });

    it("TIPOS_CON_DISENO_LIBRE no cambia", () => {
        expect(TIPOS_CON_DISENO_LIBRE).toEqual([
            "CLOCK_DATE",
            "WEATHER_BASIC",
            "NOTIFICATIONS",
            "QUICK_ACCESS",
            "SYSTEM_STATUS",
            "MY_EVENTS",
            "TASKS_QUICK",
            "AURORA_LAST",
        ]);
    });
});