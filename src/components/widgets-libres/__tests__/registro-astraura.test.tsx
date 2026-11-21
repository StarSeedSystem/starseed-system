import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

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

const baseWidget = (id: string, widget_type: DashboardWidget["widget_type"]): DashboardWidget => ({
    id,
    dashboard_id: "d1",
    widget_type,
    layout: { x: 0, y: 0, w: 2, h: 2 },
    settings: {},
    created_at: new Date().toISOString(),
});

describe("registro-libre: widget AURORA_LAST usa AstrauraLibreProto", () => {
    it("devuelve el widget nuevo y le llegan widget y onUpdateSettings", () => {
        const widget = baseWidget("w1", "AURORA_LAST");
        const onUpdateSettings = vi.fn();

        const resultado = widgetLibre(widget, onUpdateSettings);

        expect(resultado).not.toBeNull();
        expect(React.isValidElement(resultado)).toBe(true);
        const props = resultado?.props as Record<string, any>;
        expect(props?.children?.props?.["data-testid"]).toBe("astraura-libre-proto");
        expect(props?.children?.props?.["data-widget"]).toBe(JSON.stringify(widget));
        expect(props?.children?.props?.["data-on-update"]).toBe("true");
    });

    it("los demás tipos siguen devolviendo lo mismo", () => {
        const reloj = widgetLibre(baseWidget("w2", "CLOCK_DATE"), vi.fn());
        const relojProps = reloj?.props as Record<string, any>;
        expect(relojProps?.children?.props?.["data-testid"]).toBe("reloj-libre");

        const clima = widgetLibre(baseWidget("w3", "WEATHER_BASIC"));
        const climaProps = clima?.props as Record<string, any>;
        expect(climaProps?.children?.props?.["data-testid"]).toBe("clima-libre");

        const notif = widgetLibre(baseWidget("w4", "NOTIFICATIONS"));
        const notifProps = notif?.props as Record<string, any>;
        expect(notifProps?.children?.props?.["data-testid"]).toBe("notificaciones-libre");

        const accesos = widgetLibre(baseWidget("w5", "QUICK_ACCESS"));
        const accesosProps = accesos?.props as Record<string, any>;
        expect(accesosProps?.children?.props?.["data-testid"]).toBe("accesos-libre");

        const estado = widgetLibre(baseWidget("w6", "SYSTEM_STATUS"));
        const estadoProps = estado?.props as Record<string, any>;
        expect(estadoProps?.children?.props?.["data-testid"]).toBe("estado-sistema-libre");

        const eventos = widgetLibre(baseWidget("w7", "MY_EVENTS"));
        const eventosProps = eventos?.props as Record<string, any>;
        expect(eventosProps?.children?.props?.["data-testid"]).toBe("eventos-libre");

        const tareas = widgetLibre(baseWidget("w8", "TASKS_QUICK"));
        const tareasProps = tareas?.props as Record<string, any>;
        expect(tareasProps?.children?.props?.["data-testid"]).toBe("tareas-libre");
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