import { describe, it, expect } from "vitest";
import {
  crearAdaptadorWidget, capturarWidget, aplicarWidget, validarParcheWidget, registrarAdaptadorWidget,
  esClaveOpcionWidget, huellaFueraDeRango,
  type CambioWidget, type InstanciaWidget, type ParcheWidget, type PuertoWidgets,
} from "../widgets";
import { familiasRegistradas, __resetRegistros } from "../../familias";

const motivos = (r: { ok: boolean; motivos?: string[] }) => (r.ok ? "" : (r.motivos ?? []).join(" "));

function puertoFalso(inicial: InstanciaWidget[] = []): { puerto: PuertoWidgets; instancias(): InstanciaWidget[] } {
  let instancias = inicial;
  const guardar = (id: string, cambio: CambioWidget) => {
    instancias = instancias.map((i) => (i.id === id ? {
      ...i,
      ...(cambio.settings !== undefined ? { settings: cambio.settings } : {}),
      ...(cambio.size !== undefined ? { size: cambio.size } : {}),
      ...(cambio.huella !== undefined ? { huella: cambio.huella } : {}),
    } : i));
  };
  return {
    puerto: { elegida: (tipo) => instancias.find((i) => i.tipo === tipo) ?? null, guardar },
    instancias: () => instancias,
  };
}

describe("widgets · familia widget del Dashboard", () => {
  it("validación: acepta solo campos presentacionales y respeta la huella del manifiesto", () => {
    const parche: ParcheWidget = { tipo: "CLOCK_DATE", size: "M", huella: { w: 3, h: 3 }, opciones: { clockMode: "analog", clockZones: ["Europe/Madrid"], showSeconds: true } };
    expect(validarParcheWidget(parche).ok).toBe(true);
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE", id: "w1" }))).toContain("no es un campo");
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE", opciones: { customHtml: "<b>hola</b>" } }))).toContain("no es una opción compartible");
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE", opciones: { theme: "sk-1234567890abcdef" } }))).toContain("token");
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE", size: "XXL" }))).toContain("tamaño");
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE", huella: { w: 1, h: 2 } }))).toContain("al menos 2×2");
    expect(motivos(validarParcheWidget({ tipo: "MUSIC_PLAYER", huella: { w: 2, h: 3 } }))).toContain("al menos 3×3");
    expect(motivos(validarParcheWidget({ tipo: "CLOCK_DATE" }))).toContain("no es válido");
    expect(huellaFueraDeRango("CLOCK_DATE", { w: 3, h: 3 })).toBeNull();
    expect(esClaveOpcionWidget("clockMode")).toBe(true);
    expect(esClaveOpcionWidget("puntoMiguel")).toBe(false);
  });

  it("capturar: toma la configuración visual y de opciones, nunca los datos personales", () => {
    const { puerto } = puertoFalso([{
      id: "w1", tipo: "CLOCK_DATE", size: "M", huella: { w: 3, h: 3 },
      settings: { clockMode: "analog", clockZones: ["Europe/Madrid"], puntoMiguel: "Calle del Sol", matriz: { opacidad: 0.7 } },
    }]);
    expect(capturarWidget(puerto, "widget:CLOCK_DATE")).toEqual({
      tipo: "CLOCK_DATE", size: "M", huella: { w: 3, h: 3 },
      opciones: { clockMode: "analog", clockZones: ["Europe/Madrid"] },
    });
    expect(capturarWidget(puerto, "dock:genesis")).toBeNull();
    expect(capturarWidget(puerto, "widget:WELLNESS")).toBeNull();
    expect(capturarWidget(puertoFalso().puerto, "widget:CLOCK_DATE")).toBeNull();
  });

  it("aplicar: fusiona con la instancia elegida, no pisa sus datos y deshacer restaura", () => {
    const { puerto, instancias } = puertoFalso([{
      id: "w1", tipo: "CLOCK_DATE", size: "S", settings: { clockMode: "digital", showSeconds: true },
    }]);
    const adaptador = crearAdaptadorWidget(puerto);
    const aplicado = adaptador.aplicar("widget:CLOCK_DATE", { tipo: "CLOCK_DATE", size: "M", huella: { w: 3, h: 3 }, opciones: { clockMode: "analog", theme: "aurora" } });
    expect(instancias()[0].settings).toEqual({ clockMode: "analog", showSeconds: true, theme: "aurora" });
    expect(instancias()[0].size).toBe("M");
    expect(instancias()[0].huella).toEqual({ w: 3, h: 3 });
    expect(adaptador.capturar("widget:CLOCK_DATE")).toMatchObject({ opciones: { clockMode: "analog", theme: "aurora" } });
    aplicado.deshacer();
    expect(instancias()[0].settings).toEqual({ clockMode: "digital", showSeconds: true });
    expect(instancias()[0].size).toBe("S");
    expect(instancias()[0].huella).toBeUndefined();
  });

  it("aplicar: nada se ejecuta sin validar, con clave ajena o sin instancia elegida", () => {
    const { puerto, instancias } = puertoFalso([{ id: "w1", tipo: "CLOCK_DATE", settings: { clockMode: "digital" } }]);
    const adaptador = crearAdaptadorWidget(puerto);
    expect(() => adaptador.aplicar("widget:CLOCK_DATE", { tipo: "CLOCK_DATE", huella: { w: 1, h: 1 } } as never)).toThrow("rechazada");
    expect(() => adaptador.aplicar("widget:WELLNESS", { tipo: "CLOCK_DATE", opciones: { clockMode: "analog" } })).toThrow("no coincide");
    expect(() => adaptador.aplicar("widget:MUSIC_PLAYER", { tipo: "MUSIC_PLAYER", opciones: { theme: "aurora" } })).toThrow("no hay instancia");
    expect(instancias()[0].settings).toEqual({ clockMode: "digital" });
  });

  it("registra la familia widget en el clic derecho", () => {
    __resetRegistros();
    registrarAdaptadorWidget(puertoFalso().puerto);
    expect(familiasRegistradas()).toEqual(["widget"]);
  });
});
