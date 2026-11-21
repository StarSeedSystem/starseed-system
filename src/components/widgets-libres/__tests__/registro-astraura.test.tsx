/**
 * Registro de widgets libres · cableado de Astraura (ASW14).
 * `widgetLibre` entrega un elemento perezoso: su cargador debe resolver al widget NUEVO
 * (`AstrauraLibreProto`) y llevarle `widget` y `onUpdateSettings`. Los demás tipos siguen
 * con su familia de siempre y `TIPOS_CON_DISENO_LIBRE` no cambia.
 */
import { describe, expect, it, vi } from "vitest";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";

const piezas = vi.hoisted(() => {
    const crear = (nombre: string) => {
        const C = () => null;
        Object.defineProperty(C, "name", { value: nombre });
        return C;
    };
    return {
        RelojLibre: crear("RelojLibre"),
        ClimaLibre: crear("ClimaLibre"),
        NotificacionesLibre: crear("NotificacionesLibre"),
        AccesosLibre: crear("AccesosLibre"),
        EstadoSistemaLibre: crear("EstadoSistemaLibre"),
        EventosLibre: crear("EventosLibre"),
        TareasLibre: crear("TareasLibre"),
        AstrauraLibre: crear("AstrauraLibre"),
        AstrauraLibreProto: crear("AstrauraLibreProto"),
    };
});

vi.mock("next/dynamic", () => ({
    default: (cargar: () => Promise<unknown>) => {
        const Dinamico = (_props: Record<string, unknown>) => null;
        (Dinamico as unknown as { __cargar: () => Promise<unknown> }).__cargar = cargar;
        return Dinamico;
    },
}));

vi.mock("../familias/reloj-libre", () => ({ RelojLibre: piezas.RelojLibre }));
vi.mock("../familias/clima-libre", () => ({ ClimaLibre: piezas.ClimaLibre }));
vi.mock("../familias/notificaciones-libre", () => ({ NotificacionesLibre: piezas.NotificacionesLibre }));
vi.mock("../familias/accesos-libre", () => ({ AccesosLibre: piezas.AccesosLibre }));
vi.mock("../familias/estado-sistema-libre", () => ({ EstadoSistemaLibre: piezas.EstadoSistemaLibre }));
vi.mock("../familias/eventos-libre", () => ({ EventosLibre: piezas.EventosLibre }));
vi.mock("../familias/tareas-libre", () => ({ TareasLibre: piezas.TareasLibre }));
vi.mock("../familias/astraura-libre-proto", () => ({ AstrauraLibreProto: piezas.AstrauraLibreProto }));

import { TIPOS_CON_DISENO_LIBRE, widgetLibre } from "../registro-libre";

type ElementoLibre = NonNullable<ReturnType<typeof widgetLibre>>;

function stub(tipo: WidgetType): DashboardWidget {
    return {
        id: `w-${tipo}`,
        dashboard_id: "d-prueba",
        widget_type: tipo,
        layout: { x: 0, y: 0, w: 3, h: 3, i: `w-${tipo}` },
        settings: {},
        created_at: "2026-11-21T00:00:00Z",
    };
}

function cargadorDe(el: ElementoLibre): () => Promise<unknown> {
    return (el.type as unknown as { __cargar: () => Promise<unknown> }).__cargar;
}

const FAMILIAS: ReadonlyArray<[WidgetType, keyof typeof piezas]> = [
    ["CLOCK_DATE", "RelojLibre"],
    ["WEATHER_BASIC", "ClimaLibre"],
    ["NOTIFICATIONS", "NotificacionesLibre"],
    ["QUICK_ACCESS", "AccesosLibre"],
    ["SYSTEM_STATUS", "EstadoSistemaLibre"],
    ["MY_EVENTS", "EventosLibre"],
    ["TASKS_QUICK", "TareasLibre"],
];

describe("widgetLibre · AURORA_LAST", () => {
    it("monta el widget nuevo y le pasa el widget y sus ajustes", async () => {
        const onUpdateSettings = vi.fn();
        const widget = stub("AURORA_LAST");
        const el = widgetLibre(widget, onUpdateSettings);
        if (!el) throw new Error("AURORA_LAST debería tener diseño libre");

        const componente = await cargadorDe(el)();
        expect(componente).toBe(piezas.AstrauraLibreProto);
        expect(componente).not.toBe(piezas.AstrauraLibre);
        const props = el.props as { widget: DashboardWidget; onUpdateSettings: unknown };
        expect(props.widget).toBe(widget);
        expect(props.onUpdateSettings).toBe(onUpdateSettings);
    });
});

describe("widgetLibre · los demás tipos no cambian", () => {
    it.each(FAMILIAS)("%s sigue con %s", async (tipo, nombre) => {
        const el = widgetLibre(stub(tipo));
        if (!el) throw new Error(`${tipo} debería tener diseño libre`);

        expect(await cargadorDe(el)()).toBe(piezas[nombre]);
    });

    it("un tipo sin diseño libre sigue devolviendo null", () => {
        expect(widgetLibre(stub("EXPLORE_NETWORK"))).toBeNull();
    });

    it("TIPOS_CON_DISENO_LIBRE no cambia", () => {
        expect([...TIPOS_CON_DISENO_LIBRE]).toEqual([
            "CLOCK_DATE", "WEATHER_BASIC", "NOTIFICATIONS", "QUICK_ACCESS",
            "SYSTEM_STATUS", "MY_EVENTS", "TASKS_QUICK", "AURORA_LAST",
        ]);
    });
});
