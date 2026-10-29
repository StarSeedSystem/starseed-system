import { describe, it, expect } from "vitest";
import { getSizeConstraints } from "@/components/dashboard/widget-manifest";
import type { CambiosInstancia, InstanciaWidget, PuertoWidgets } from "../widgets";
import { aplicarWidget, capturaWidget, claveDeWidget, opcionesPublicables, registrarAdaptadorWidgets, tipoDeClave, validarParcheWidget } from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

// Instancia de prueba; el «ajustes» representa su settings completo (con datos personales incluidos)
const inst = (id: string, tipo: InstanciaWidget["tipo"], extra: Partial<InstanciaWidget> = {}): InstanciaWidget =>
  ({ id, tipo, ajustes: {}, huella: { w: 4, h: 4 }, ...extra });

// Puerto falso: «elegida» devuelve la primera instancia del tipo; «fusionar» muta la viva.
function puertoFalso(vivas: InstanciaWidget[]): { ultimo: Map<string, CambiosInstancia>; puerto: PuertoWidgets } {
  const ultimo = new Map<string, CambiosInstancia>();
  return {
    ultimo,
    puerto: {
      elegida: (tipo) => vivas.find((i) => i.tipo === tipo) ?? null,
      fusionar: (id, cambios) => {
        const viva = vivas.find((i) => i.id === id);
        if (viva) { if (cambios.ajustes !== undefined) viva.ajustes = cambios.ajustes; if (cambios.size !== undefined) viva.size = cambios.size; if (cambios.huella !== undefined) viva.huella = cambios.huella; }
        ultimo.set(id, cambios);
      },
    },
  };
}

const texto = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" "));
describe("variaciones · familia widget (adaptador del Dashboard)", () => {
  it("la clave nombra el TIPO registrado en el manifiesto, nunca la instancia", () => {
    expect(tipoDeClave("widget:CLOCK_DATE")).toBe("CLOCK_DATE");
    expect(claveDeWidget("CLOCK_DATE")).toBe("widget:CLOCK_DATE");
    expect(tipoDeClave("widget:clima")).toBeNull();
    expect(tipoDeClave("widget:PANEL_NO_EXISTE")).toBeNull();
    expect(tipoDeClave("widget:CLOCK_DATE#estilo")).toBeNull();
    expect(tipoDeClave("dock:crono")).toBeNull();
  });

  it("validar acepta lo visual y rechaza contenido, datos y basura", () => {
    const base = { widgetType: "CLOCK_DATE", ajustes: { clockMode: "analog", clockZones: ["Europe/Madrid"] }, size: "M" };
    expect(validarParcheWidget(base).ok).toBe(true);
    expect(validarParcheWidget({ widgetType: "AI_GENERATED", ajustes: { widgetConfig: { opacity: 0.7, blur: 8 } } }).ok).toBe(true);
    expect(validarParcheWidget({ widgetType: "NEXUS_QUICK_ACCESS", ajustes: {}, size: "S" }).ok).toBe(true);
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { styleVariant: "#39FF14" } }))).toContain("el estilo");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { customHtml: "<div></div>" } }))).toContain("publicable");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { appIds: ["notas"] } }))).toContain("publicable");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { apiKey: "xxxx" } }))).toMatch(/Privacidad/);
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { trinityNode: "sur" } }))).toContain("el nodo Trinity");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { clockMode: "jalisco" } }))).toContain("el modo del reloj");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { widgetConfig: { blur: "mucho" } } }))).toContain("números finitos");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: { clockZones: "Europe/Madrid" } }))).toContain("zonas del reloj");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: {}, url: "https://x.test" }))).toContain("no es un campo");
    expect(texto(validarParcheWidget({ widgetType: "PANEL_NO_EXISTE", ajustes: {} }))).toContain("manifiesto");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: {}, size: "XXL" }))).toContain("«S», «M», «L» o «XL»");
    expect(texto(validarParcheWidget({ widgetType: "CLOCK_DATE", ajustes: {} }))).toContain("no cambia nada");
  });

  it("capturar: solo la configuración visual y de opciones, jamás el contenido propio", () => {
    const viva = inst("w1", "AI_GENERATED", {
      ajustes: {
        styleVariant: "trinity", trinityNode: "zenith", widgetConfig: { opacity: 0.7 },
        customHtml: "<strong>lo creado</strong>", forgePrompt: "un orbe con rayos",
      },
    });
    const { puerto } = puertoFalso([viva, inst("w2", "CLOCK_DATE")]);
    expect(capturaWidget(puerto, "widget:AI_GENERATED")).toEqual({
      widgetType: "AI_GENERATED",
      ajustes: { styleVariant: "trinity", trinityNode: "zenith", widgetConfig: { opacity: 0.7 } },
    });
    expect(capturaWidget(puerto, "widget:CLOCK_DATE")).toBeNull(); // sin opciones ni talla: nada que publicar
    expect(capturaWidget(puerto, "widget:PANEL_NO_EXISTE")).toBeNull();
    expect(capturaWidget(puerto, "tema:synthwave-horizon")).toBeNull();
    expect(opcionesPublicables({ styleVariant: "solido", ontologia: { titulo: "mío" } })).toEqual({ styleVariant: "solido" });
    expect(opcionesPublicables({ widgetConfig: { blur: "corrupto" } })).toEqual({});
  });

  it("aplicar: fusiona con la instancia elegida, respeta el mínimo del manifiesto y deshace", () => {
    const viva = inst("w1", "MY_PAGES", { size: "M", ajustes: { styleVariant: "cristal" } });
    const { puerto, ultimo } = puertoFalso([viva]);
    const deshacer = aplicarWidget(puerto, "widget:MY_PAGES", {
      widgetType: "MY_PAGES", ajustes: { trinityNode: "horizon" }, size: "S",
    });
    expect(viva.ajustes).toEqual({ styleVariant: "cristal", trinityNode: "horizon" });
    expect(viva.size).toBe("S");
    const min = getSizeConstraints("MY_PAGES");
    expect(viva.huella.w).toBe(Math.max(3, min.minW)); // la huella nace de dimsForSize, que recorta con getSizeConstraints
    expect(viva.huella.h).toBe(Math.max(3, min.minH));
    expect(ultimo.get("w1")).toBeDefined();
    deshacer();
    expect(viva.ajustes).toEqual({ styleVariant: "cristal" });
    expect(viva.size).toBe("M");
    expect(viva.huella).toEqual({ w: 4, h: 4 });
  });

  it("aplicar: nada se ejecuta sin validar, con clave equivocada o sin instancia", () => {
    const { puerto, ultimo } = puertoFalso([inst("w1", "CLOCK_DATE")]);
    expect(() => aplicarWidget(puerto, "widget:CLOCK_DATE", { widgetType: "CLOCK_DATE", ajustes: {} })).toThrow("rechazada");
    expect(() => aplicarWidget(puerto, "widget:CLOCK_DATE", { widgetType: "TASKS_QUICK", ajustes: { clockMode: "analog" } })).toThrow("no coincide");
    expect(() => aplicarWidget(puerto, "widget:WEATHER_BASIC", { widgetType: "WEATHER_BASIC", ajustes: { clockMode: "analog" } })).toThrow("instancia elegida");
    expect(ultimo.size).toBe(0);
  });

  it("el adaptador entra en el registro común de familias", () => {
    __resetRegistros();
    const viva = inst("w1", "CLOCK_DATE");
    const { puerto } = puertoFalso([viva]);
    registrarAdaptadorWidgets(puerto);
    expect(familiasRegistradas()).toContain("widget");
    const adaptador = adaptadorDe("widget:CLOCK_DATE");
    expect(adaptador?.familia).toBe("widget");
    expect(adaptador?.capturar("widget:CLOCK_DATE")).toBeNull();
    expect(adaptador?.validar({ widgetType: "BADGES", ajustes: { styleVariant: "solido" }, size: "S" }).ok).toBe(true);
    const aplicado = adaptador?.aplicar("widget:CLOCK_DATE", { widgetType: "CLOCK_DATE", ajustes: { clockMode: "analog" } });
    expect(viva.ajustes).toEqual({ clockMode: "analog" });
    aplicado?.deshacer();
    expect(viva.ajustes).toEqual({});
  });
});
