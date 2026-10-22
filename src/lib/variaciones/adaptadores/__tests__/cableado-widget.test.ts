// Pruebas del cableado del adaptador de la familia widget en el registro.
// Sin red, sin DOM: la fuente de instancias es inyectada (FuenteWidget).
import { describe, it, expect, beforeEach } from "vitest";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";
import { conectarFamiliaWidget } from "../../adaptadores";

function instancia(tipo: WidgetType, settings: Record<string, unknown>, w = 3, h = 3): DashboardWidget {
    return { id: "w1", dashboard_id: "d1", widget_type: tipo, layout: { x: 0, y: 0, w, h }, settings, created_at: "2026-10-22T00:00:00Z" };
}

function fuenteDe(viva: DashboardWidget) {
    const memoria: DashboardWidget[] = [viva];
    return {
        fuente: {
            instanciaDe: (tipo: string) => memoria.find((w) => w.widget_type === tipo) ?? null,
            persistir: (nueva: DashboardWidget) => {
                for (let i = 0; i < memoria.length; i += 1) if (memoria[i].id === nueva.id) memoria[i] = nueva;
            },
        },
        memoria,
    };
}

describe("adaptador widget conectado al registro", () => {
    beforeEach(() => {
        __resetRegistros();
        conectarFamiliaWidget();
    });

    it("la familia widget del registro es la real, no la genérica", () => {
        expect(familiasRegistradas()).toContain("widget");
        expect(adaptadorDe("widget:CLOCK_DATE")?.nombre).toBe("Adaptador de widgets (variaciones públicas)");
    });

    it("capturar toma solo la configuración visual desde la fuente inyectada", () => {
        const { fuente } = fuenteDe(instancia("CLOCK_DATE", { clockMode: "digital", notasPersonales: "lista privada" }));
        __resetRegistros();
        conectarFamiliaWidget(fuente);
        const variacion = adaptadorDe("widget:CLOCK_DATE")?.capturar("widget:CLOCK_DATE");
        expect(variacion).toEqual({ tipo: "CLOCK_DATE", opciones: { clockMode: "digital" }, tamano: { w: 3, h: 3 } });
        expect(JSON.stringify(variacion)).not.toContain("notasPersonales");
    });

    it("capturar devuelve null sin instancia del tipo o con clave ajena", () => {
        const { fuente } = fuenteDe(instancia("CLOCK_DATE", {}));
        __resetRegistros();
        conectarFamiliaWidget(fuente);
        expect(adaptadorDe("widget:WEATHER_BASIC")?.capturar("widget:WEATHER_BASIC")).toBeNull();
        expect(adaptadorDe("widget:CLOCK_DATE")?.capturar("widget:CLOCK_DATE#parte")).toBeNull();
    });

    it("aplicar fusiona con la instancia elegida, persiste y deshacer restaura", () => {
        const { fuente, memoria } = fuenteDe(instancia("CLOCK_DATE", { clockMode: "digital" }));
        __resetRegistros();
        conectarFamiliaWidget(fuente);
        const adaptador = adaptadorDe("widget:CLOCK_DATE");
        expect(adaptador?.validar({ tipo: "CLOCK_DATE", opciones: { styleVariant: "compacto" } }).ok).toBe(true);
        const r = adaptador?.aplicar("widget:CLOCK_DATE", { tipo: "CLOCK_DATE", opciones: { styleVariant: "compacto" }, tamano: { w: 4, h: 3 } });
        expect(r).toBeDefined();
        expect(memoria[0].settings).toEqual({ clockMode: "digital", styleVariant: "compacto" });
        if (r) {
            r.deshacer();
            expect(memoria[0]).toEqual(instancia("CLOCK_DATE", { clockMode: "digital" }));
        }
    });

    it("aplicar respeta getSizeConstraints y no persiste lo que no valida", () => {
        const { fuente, memoria } = fuenteDe(instancia("CLOCK_DATE", {}));
        __resetRegistros();
        conectarFamiliaWidget(fuente);
        const adaptador = adaptadorDe("widget:CLOCK_DATE");
        expect(adaptador?.validar({ tipo: "CLOCK_DATE", opciones: {}, tamano: { w: 1, h: 1 } }).ok).toBe(false);
        expect(adaptador?.aplicar("widget:CLOCK_DATE", { tipo: "CLOCK_DATE", opciones: { apiKey: "sk-XXXXXXXXXXXX" } })).toEqual({ deshacer: expect.any(Function) });
        expect(memoria[0].settings).toEqual({});
    });

    it("la vista previa viene del módulo del manifiesto", () => {
        const previa = adaptadorDe("widget:CLOCK_DATE")?.vistaPrevia;
        expect(previa?.({ tipo: "CLOCK_DATE", opciones: {} })).toEqual({ tipo: "CLOCK_DATE", etiqueta: "Reloj y Fecha", opciones: {}, tamano: undefined });
    });
});
