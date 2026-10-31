import { describe, it, expect, beforeEach } from "vitest";
import {
  construirPayload,
  crearAdaptadorWidgets,
  limpiarAjustes,
  registrarAdaptadorWidgets,
  tipoDeClave,
  validarPayloadWidget,
  type DepsWidget,
  type PayloadWidget,
} from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const TIPO = "CLOCK_DATE" as const;

function depsCon(inicial: PayloadWidget | null) {
  const escritos: Array<{ clave: string; payload: PayloadWidget }> = [];
  let estado = inicial;
  const deps: DepsWidget = {
    leer: () => estado,
    escribir: (clave, payload) => {
      estado = payload;
      escritos.push({ clave, payload });
    },
  };
  return { deps, escritos };
}

beforeEach(() => __resetRegistros());

describe("adaptador de widgets", () => {
  it("extrae el tipo de una clave widget válida", () => {
    expect(tipoDeClave(`widget:${TIPO}`)).toBe(TIPO);
    expect(tipoDeClave(`widget:${TIPO}#ajustes`)).toBe(TIPO);
    expect(tipoDeClave("widget:NO_EXISTE")).toBeNull();
    expect(tipoDeClave(`otra:${TIPO}`)).toBeNull();
    expect(tipoDeClave("widget:")).toBeNull();
  });

  it("limpia datos personales a cualquier profundidad", () => {
    const ajustes = {
      modo: "digital",
      notas: ["privado"],
      capas: [{ color: "primary", contenido: "texto privado" }],
    };
    expect(limpiarAjustes(ajustes)).toEqual({
      modo: "digital",
      capas: [{ color: "primary" }],
    });
  });

  it("construye el payload con anclaje y tamaño", () => {
    const payload = construirPayload(TIPO, { modo: "digital", tareas: [] }, { w: 3, h: 3 }, "M");
    expect(payload).toEqual({ tipo: TIPO, ajustes: { modo: "digital" }, anclaje: { w: 3, h: 3 }, tamano: "M" });
  });

  it("valida un payload correcto", () => {
    expect(validarPayloadWidget(construirPayload(TIPO, { modo: "digital" }, { w: 3, h: 3 })).ok).toBe(true);
  });

  it("rechaza tipo desconocido, ajustes no planos y anclaje inválido", () => {
    expect(validarPayloadWidget({ tipo: "NO_EXISTE", ajustes: {} }).ok).toBe(false);
    expect(validarPayloadWidget({ tipo: TIPO, ajustes: [] }).ok).toBe(false);
    const noEntero = validarPayloadWidget({ tipo: TIPO, ajustes: {}, anclaje: { w: 2.5, h: 2 } });
    expect(noEntero.ok).toBe(false);
    if (!noEntero.ok) expect(noEntero.motivos.some((m) => m.includes("entero"))).toBe(true);
  });

  it("respeta los mínimos del manifiesto", () => {
    const revision = validarPayloadWidget(construirPayload(TIPO, {}, { w: 1, h: 1 }));
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos.some((m) => m.includes("mínimo"))).toBe(true);
  });

  it("rechaza datos personales, código y tamaños fuera de la escala", () => {
    expect(validarPayloadWidget({ tipo: TIPO, ajustes: { tareas: [] } }).ok).toBe(false);
    expect(validarPayloadWidget({ tipo: TIPO, ajustes: { html: "<b>x</b>" } }).ok).toBe(false);
    expect(validarPayloadWidget({ tipo: TIPO, ajustes: {}, tamano: "XXL" }).ok).toBe(false);
  });

  it("captura solo la configuración del widget activo", () => {
    const { deps } = depsCon({ tipo: TIPO, ajustes: { modo: "analog", notas: ["privado"] } });
    const capturado = crearAdaptadorWidgets(deps).capturar(`widget:${TIPO}`);
    expect(capturado).toEqual({ tipo: TIPO, ajustes: { modo: "analog" } });
  });

  it("no captura claves de otra familia, tipo o instancia", () => {
    const { deps } = depsCon({ tipo: TIPO, ajustes: {} });
    const adaptador = crearAdaptadorWidgets(deps);
    expect(adaptador.capturar("tema:synthwave")).toBeNull();
    expect(adaptador.capturar("widget:NO_EXISTE")).toBeNull();
    expect(adaptador.capturar("widget:WEATHER_UV")).toBeNull();
  });

  it("aplica fusionando con la instancia y deshacer restaura", () => {
    const anterior: PayloadWidget = { tipo: TIPO, ajustes: { modo: "analog", zonas: ["UTC"] } };
    const { deps, escritos } = depsCon(anterior);
    const adaptador = crearAdaptadorWidgets(deps);
    const nuevo = construirPayload(TIPO, { modo: "digital" }, { w: 3, h: 3 }, "M");
    const { deshacer } = adaptador.aplicar(`widget:${TIPO}`, nuevo);
    expect(escritos[0].payload).toEqual({ tipo: TIPO, ajustes: { modo: "digital", zonas: ["UTC"] }, anclaje: { w: 3, h: 3 }, tamano: "M" });
    deshacer();
    expect(escritos[1].payload).toEqual(anterior);
  });

  it("no aplica si la clave no es del tipo de la variación", () => {
    const { deps, escritos } = depsCon({ tipo: TIPO, ajustes: {} });
    const adaptador = crearAdaptadorWidgets(deps);
    adaptador.aplicar("widget:WEATHER_UV", construirPayload(TIPO, {}));
    expect(escritos).toHaveLength(0);
  });

  it("registra la familia widget", () => {
    registrarAdaptadorWidgets(depsCon(null).deps);
    expect(familiasRegistradas()).toContain("widget");
    expect(adaptadorDe(`widget:${TIPO}`)?.nombre).toBe("Widgets del Dashboard");
  });
});
