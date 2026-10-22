// Pruebas del adaptador de la familia widget (variaciones públicas).
// Solo funciones puras: sin red, sin disco, sin DOM, sin vi.mock de módulos de Node.
import { describe, it, expect } from "vitest";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import {
    capturarWidget,
    aplicarWidget,
    validarVariacionWidget,
    vistaPreviaWidget,
    esTipoWidget,
    tipoDeClaveWidget,
} from "../widgets";

function instancia(tipo: WidgetType, settings: Record<string, unknown>, w = 3, h = 3): DashboardWidget {
    return { id: "w1", dashboard_id: "d1", widget_type: tipo, layout: { x: 0, y: 0, w, h }, settings, created_at: "2026-10-22T00:00:00Z" };
}

describe("adaptador de widgets", () => {
    it("reconoce tipos y claves de la familia widget", () => {
        expect(esTipoWidget("WEATHER_BASIC")).toBe(true);
        expect(esTipoWidget("NO_EXISTE_NI_SE_LE_ESPER")).toBe(false);
        expect(esTipoWidget(42)).toBe(false);
        expect(tipoDeClaveWidget("widget:CLOCK_DATE")).toBe("CLOCK_DATE");
        expect(tipoDeClaveWidget("widget:CLOCK_DATE#estilo")).toBeNull();
        expect(tipoDeClaveWidget("boton:publicar")).toBeNull();
        expect(tipoDeClaveWidget("widget:NO_EXISTE")).toBeNull();
    });

    it("la captura toma solo la configuración visual, nunca datos personales", () => {
        const estado = {
            widget_type: "WEATHER_BASIC" as WidgetType,
            settings: { styleVariant: "cristal", clockZones: ["Europe/Madrid"], notasPersonales: "mi lista privada" },
            layout: { w: 4, h: 4 },
        };
        const variacion = capturarWidget("widget:WEATHER_BASIC", estado);
        expect(variacion?.tipo).toBe("WEATHER_BASIC");
        expect(variacion?.opciones).toEqual({ styleVariant: "cristal", clockZones: ["Europe/Madrid"] });
        expect(JSON.stringify(variacion)).not.toContain("notasPersonales");
        expect(variacion?.tamano).toEqual({ w: 4, h: 4 });
        expect(capturarWidget("widget:WEATHER_BASIC", { widget_type: "CLOCK_DATE", settings: {} })).toBeNull();
    });

    it("acepta una variación bien formada y exige los límites de getSizeConstraints", () => {
        const buena = { tipo: "CLOCK_DATE" as WidgetType, opciones: { clockMode: "digital" } };
        expect(validarVariacionWidget(buena).ok).toBe(true);
        const pequena = { ...buena, tamano: { w: 1, h: 2 } }; // CLOCK_DATE: minW 2
        const rechazo = validarVariacionWidget(pequena);
        expect(rechazo.ok).toBe(false);
        if (!rechazo.ok) expect(rechazo.motivos.join(" ")).toContain("Tamaño");
        const decimal = { ...buena, tamano: { w: 2.5, h: 2 } };
        expect(validarVariacionWidget(decimal).ok).toBe(false);
        const malOpciones = { tipo: "CLOCK_DATE" as WidgetType, opciones: [] };
        expect(validarVariacionWidget(malOpciones).ok).toBe(false);
        expect(validarVariacionWidget({ tipo: "CLOCK_DATE" as WidgetType }).ok).toBe(false);
    });

    it("rechaza claves sospechosas y URLs que no sean https, y aísla el HTML propio", () => {
        const sospecha = { tipo: "CLOCK_DATE" as WidgetType, opciones: { apiKey: "sk-XXXXXXXXXXXXXXX" } };
        expect(validarVariacionWidget(sospecha).ok).toBe(false);
        const url = { tipo: "CLOCK_DATE" as WidgetType, opciones: { forgePrompt: "véase http://ejemplo.falso" } };
        expect(validarVariacionWidget(url).ok).toBe(false);
        const conCodigo = { tipo: "AI_GENERATED" as WidgetType, opciones: { customHtml: "<b>hola</b>" } };
        const r = validarVariacionWidget(conCodigo);
        expect(r.ok).toBe(true);
        expect(r.requiereAislamiento).toBe(true);
    });

    it("aplica la variación fusionando opciones y respeta el mínimo del manifiesto", () => {
        const original = instancia("CLOCK_DATE", { clockMode: "digital" });
        const r = aplicarWidget(
            "widget:CLOCK_DATE",
            { tipo: "CLOCK_DATE", opciones: { styleVariant: "compacto" }, tamano: { w: 1, h: 1 } },
            original,
        );
        expect(r).not.toBeNull();
        expect(r?.widget.settings).toEqual({ clockMode: "digital", styleVariant: "compacto" });
        expect(r?.widget.layout.w).toBe(2);
        expect(r?.widget.layout.h).toBe(2);
        expect(r?.deshacer()).toEqual(original);
    });

    it("devuelve null si la variación no valida o la familia no encaja con la instancia", () => {
        const original = instancia("CLOCK_DATE", {});
        expect(aplicarWidget("widget:CLOCK_DATE", { tipo: "CLOCK_DATE", opciones: { apiKey: "sk-XXXXXXXXXXXX" } }, original)).toBeNull();
        expect(aplicarWidget("widget:AI_GENERATED", { tipo: "AI_GENERATED", opciones: {} }, original)).toBeNull();
    });

    it("la vista previa usa la etiqueta humana del manifiesto", () => {
        const v = vistaPreviaWidget({ tipo: "WEATHER_BASIC", opciones: {}, tamano: { w: 4, h: 4 } });
        expect(v.tipo).toBe("WEATHER_BASIC");
        expect(v.etiqueta).toBe("Clima");
        expect(v.tamano).toEqual({ w: 4, h: 4 });
    });
});
