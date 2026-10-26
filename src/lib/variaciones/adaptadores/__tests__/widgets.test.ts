import { describe, it, expect, beforeEach } from "vitest";
import {
  aplicarWidget, capturarWidget, motivosDeHuella, registrarAdaptadorWidgets,
  separarDatosPersonales, tipoDeClave, validarPayloadWidget,
  type ConfigWidget, type DepsWidgets, type PayloadWidget,
} from "../widgets";
import { adaptadorDe, __resetRegistros } from "../../familias";

const TIPO = "WEATHER_TEMPERATURE";

function depsCon(instancia: Map<string, ConfigWidget>) {
  const escritos: Array<{ tipo: string; config: ConfigWidget }> = [];
  const deps: DepsWidgets = {
    leer: (tipo) => instancia.get(tipo) ?? null,
    escribir: (tipo, config) => {
      instancia.set(tipo, config);
      escritos.push({ tipo, config });
    },
  };
  return { deps, instancia, escritos };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de widgets del Dashboard", () => {
  it("captura solo la configuración visual, sin los datos personales", () => {
    const { deps } = depsCon(new Map([
      [TIPO, { settings: { analogico: true, colorAcento: "violeta", notas: ["mi nota privada"], total: 1 } }],
    ]));
    const payload = capturarWidget(deps, TIPO);
    expect(payload?.widgetType).toBe(TIPO);
    expect(payload?.settings).toEqual({ analogico: true, colorAcento: "violeta", total: 1 });
    expect("notas" in (payload?.settings ?? {})).toBe(false);
  });

  it("capturar devuelve null sin instancia activa ni con tipo ajeno al manifiesto", () => {
    const { deps } = depsCon(new Map());
    expect(capturarWidget(deps, TIPO)).toBeNull();
    expect(tipoDeClave("widget:WIDGET_INVENTADO")).toBeNull();
    expect(tipoDeClave("tema:synthwave-horizon")).toBeNull();
    expect(tipoDeClave("no es clave")).toBeNull();
  });

  it("valida un payload correcto con tipo, tamaño y huella del manifiesto", () => {
    const payload: PayloadWidget = {
      widgetType: TIPO, settings: { analogico: true }, size: "M", w: 2, h: 2,
    };
    const revision = validarPayloadWidget(payload);
    expect(revision.ok).toBe(true);
    if (revision.ok) expect(revision.payload.settings).toEqual({ analogico: true });
  });

  it("rechaza un tipo que no está en el manifiesto", () => {
    const revision = validarPayloadWidget({ widgetType: "WIDGET_INVENTADO", settings: {} });
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos).toHaveLength(1);
  });

  it("rechaza datos personales, secretos y tamaños no declarados", () => {
    const conDatos = validarPayloadWidget({ widgetType: TIPO, settings: { tareas: ["pendiente"] } });
    expect(conDatos.ok).toBe(false);
    if (!conDatos.ok) expect(conDatos.motivos.some((m) => m.startsWith("Privacidad"))).toBe(true);
    const conSecreto = validarPayloadWidget({ widgetType: TIPO, settings: { token: "clave-servidor" } });
    expect(conSecreto.ok).toBe(false);
    const conSize = validarPayloadWidget({ widgetType: TIPO, settings: {}, size: "XXL" });
    expect(conSize.ok).toBe(false);
    if (!conSize.ok) expect(conSize.motivos.some((m) => m.startsWith("Manifest"))).toBe(true);
  });

  it("exige la huella mínima del manifiesto con getSizeConstraints", () => {
    expect(motivosDeHuella(TIPO, 1, 2)).toHaveLength(1);
    expect(motivosDeHuella(TIPO, 2, 2)).toEqual([]);
    const revision = validarPayloadWidget({ widgetType: TIPO, settings: {}, w: 1 });
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos.some((m) => m.startsWith("Manifest"))).toBe(true);
  });

  it("aplicar fusiona opciones en la instancia y deshacer la devuelve", () => {
    const previa: ConfigWidget = { settings: { analogico: true, colorAcento: "violeta" }, size: "S" };
    const { deps, instancia, escritos } = depsCon(new Map([[TIPO, previa]]));
    const { deshacer } = aplicarWidget(deps, TIPO, { widgetType: TIPO, settings: { analogico: false }, size: "L" });
    expect(instancia.get(TIPO)?.settings).toEqual({ analogico: false, colorAcento: "violeta" });
    expect(instancia.get(TIPO)?.size).toBe("L");
    deshacer();
    expect(instancia.get(TIPO)).toBe(previa);
    expect(escritos).toHaveLength(2);
  });

  it("nada se aplica sin validar ni con una clave de otra familia", () => {
    const { deps, escritos } = depsCon(new Map());
    registrarAdaptadorWidgets(deps);
    const adaptador = adaptadorDe("widget:CLOCK_DATE");
    expect(adaptador).not.toBeNull();
    const resultado = adaptador!.aplicar("tema:synthwave-horizon", { widgetType: TIPO, settings: {} });
    resultado.deshacer();
    expect(escritos).toHaveLength(0);
  });

  it("sin instancia previa aplica opciones y deshacer no rompe", () => {
    const { deps, instancia } = depsCon(new Map());
    const { deshacer } = aplicarWidget(deps, TIPO, { widgetType: TIPO, settings: { analogico: true } });
    expect(instancia.get(TIPO)?.settings).toEqual({ analogico: true });
    deshacer();
    expect(instancia.get(TIPO)?.settings).toEqual({ analogico: true });
  });

  it("separa opciones y datos y registra la familia en el registro compartido", () => {
    const { opciones, motivos } = separarDatosPersonales({ analogico: true, notas: ["hola"] });
    expect(opciones).toEqual({ analogico: true });
    expect(motivos).toHaveLength(1);
    registrarAdaptadorWidgets(depsCon(new Map()).deps);
    expect(adaptadorDe("widget:CLOCK_DATE")?.familia).toBe("widget");
    expect(adaptadorDe("widget:CLOCK_DATE")?.nombre).toBe("Widgets del Dashboard");
    expect(adaptadorDe("tema:synthwave-horizon")).toBeNull();
  });
});
