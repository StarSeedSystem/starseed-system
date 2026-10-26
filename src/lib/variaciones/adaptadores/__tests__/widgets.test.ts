import { describe, it, expect, beforeEach } from "vitest";
import { capturarPayloadWidget, crearAdaptadorWidget, idsWidget, registrarAdaptadorWidget, validarPayloadWidget, widgetTypeDeClave, type DepsWidget, type PayloadWidget } from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const WEATHER = "WEATHER_BASIC";
const CLOCK = "CLOCK_DATE";

function depsCon(widgets: Map<string, { widget: any }>) {
  return {
    deps: {
      leer: (t: string) => widgets.get(t)?.widget ?? null,
      escribir: (t: string, p: any) => { const e = widgets.get(t); if (!e) return null; const a = e.widget; widgets.set(t, { widget: { ...a, ...p, settings: p.settings ?? a.settings, size: p.size ?? a.size } }); return a; },
    },
    widgets,
  };
}

function widgetBase(type: WidgetType, o: Partial<any> = {}) {
  return { id: `w-${type.toLowerCase()}`, dashboard_id: "d1", widget_type: type, layout: { x: 0, y: 0, w: 4, h: 4, i: `w-${type.toLowerCase()}` }, settings: {}, created_at: new Date().toISOString(), ...o };
}

beforeEach(() => __resetRegistros());

describe("widgets · familia de variaciones públicas", () => {
  it("expone todos los WidgetType del manifiesto como ids publicables", () => { const ids = idsWidget(); expect(ids.length).toBeGreaterThan(50); expect(ids).toContain(WEATHER); expect(ids).toContain(CLOCK); });

  it("resuelve widget:<WidgetType> con tipos del manifiesto y nada más", () => { expect(widgetTypeDeClave(`widget:${WEATHER}`)).toBe(WEATHER); expect(widgetTypeDeClave(`widget:${CLOCK}`)).toBe(CLOCK); for (const o of ["tema:synthwave", "widget:vuelo", "widget:", "widget:NO_EXISTE_123"]) expect(widgetTypeDeClave(o), o).toBeNull(); });

  it("captura el payload visual de un widget activo (settings + size)", () => { const w = widgetBase(WEATHER, { settings: { ciudad: "Madrid", unidades: "metric" }, size: "L" }); const p = capturarPayloadWidget(w); expect(p.widgetType).toBe(WEATHER); expect(p.settings).toEqual({ ciudad: "Madrid", unidades: "metric" }); expect(p.size).toBe("L"); });

  it("valida payload correcto y rechaza inválidos", () => { expect(validarPayloadWidget({ widgetType: WEATHER, settings: { ciudad: "Madrid" }, size: "M" }).ok).toBe(true); const casos: [unknown, string][] = [[null, "debe ser un objeto"], [[], "debe ser un objeto"], [{}, "falta widgetType"], [{ widgetType: 123 }, "widgetType"], [{ widgetType: "NO_EXISTE" }, "no está en el manifiesto"], [{ widgetType: WEATHER, settings: "no-objeto" }, "settings debe ser un objeto"], [{ widgetType: WEATHER, size: "XXL" }, "size debe ser"], [{ widgetType: WEATHER, size: "S", settings: { token: "sk-fake123def456ghi789" } }, "token"], [{ widgetType: WEATHER, size: "S", settings: { html: "<script>x</script>" } }, "código"]]; for (const [p, e] of casos) { const r = validarPayloadWidget(p); expect(r.ok, e).toBe(false); if (!r.ok) expect(r.motivos.join(" "), e).toContain(e); } });

  it("rechaza talla que viola límites del manifiesto (minW/minH)", () => { expect(validarPayloadWidget({ widgetType: WEATHER, size: "S" }).ok).toBe(true); });

  it("captura desde adaptador con lector inyectado", () => { const w = widgetBase(CLOCK, { settings: { zona: "Europe/Madrid", formato: "24h" }, size: "M" }); const { deps } = depsCon(new Map([[CLOCK, { widget: w }]])); const c = crearAdaptadorWidget(deps).capturar(`widget:${CLOCK}`); expect(c?.widgetType).toBe(CLOCK); expect(c?.settings).toEqual({ zona: "Europe/Madrid", formato: "24h" }); expect(c?.size).toBe("M"); });

  it("no captura sin widget activo ni si clave es de otra familia", () => { expect(crearAdaptadorWidget(depsCon(new Map()).deps).capturar(`widget:${WEATHER}`)).toBeNull(); const { deps } = depsCon(new Map([[CLOCK, { widget: widgetBase(CLOCK) }]])); expect(crearAdaptadorWidget(deps).capturar(`widget:${WEATHER}`)).toBeNull(); expect(crearAdaptadorWidget(deps).capturar("tema:synthwave")).toBeNull(); });

  it("aplicar escribe settings/size y deshacer restaura estado anterior", () => { const w = widgetBase(WEATHER, { settings: { ciudad: "Barcelona" }, size: "S" }); const { deps, widgets } = depsCon(new Map([[WEATHER, { widget: w }]])); const a = crearAdaptadorWidget(deps); const { deshacer } = a.aplicar(`widget:${WEATHER}`, { widgetType: WEATHER, settings: { ciudad: "Madrid", unidades: "metric" }, size: "L" }); expect(widgets.get(WEATHER)!.widget.settings).toEqual({ ciudad: "Madrid", unidades: "metric" }); expect(widgets.get(WEATHER)!.widget.size).toBe("L"); deshacer(); expect(widgets.get(WEATHER)!.widget.settings).toEqual({ ciudad: "Barcelona" }); expect(widgets.get(WEATHER)!.widget.size).toBe("S"); });

  it("no ejecuta nada sin validar: payload rechazado no toca estado", () => { const w = widgetBase(WEATHER, { settings: { ciudad: "Sevilla" } }); const { deps, widgets } = depsCon(new Map([[WEATHER, { widget: w }]])); const a = crearAdaptadorWidget(deps); expect(() => a.aplicar(`widget:${WEATHER}`, { widgetType: "VUELO", settings: {} })).toThrow("rechazada"); expect(() => a.aplicar(`widget:${WEATHER}`, { widgetType: WEATHER, settings: { html: "<b>x</b>" } })).toThrow("rechazada"); expect(widgets.get(WEATHER)!.widget.settings).toEqual({ ciudad: "Sevilla" }); });

  it("se registra en el registro global de familias", () => { registrarAdaptadorWidget(depsCon(new Map()).deps); expect(familiasRegistradas()).toContain("widget"); const a = adaptadorDe("widget:WEATHER_BASIC"); expect(a).not.toBeNull(); expect(a?.familia).toBe("widget"); });
});