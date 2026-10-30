import { describe, it, expect, beforeEach } from "vitest";
import {
  construirPayload,
  crearAdaptadorWidgets,
  registrarAdaptadorWidgets,
  tipoDeClave,
  validarPayloadWidget,
  type DepsWidget,
} from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";

const TIPO = "CLOCK_DATE";
const W = 3;
const H = 3;

function depsCon(payload: ReturnType<typeof construirPayload> | null) {
  const escritos: Array<{ clave: string; payload: ReturnType<typeof construirPayload> }> = [];
  const deps: DepsWidget = {
    leer: () => payload,
    escribir: (clave, p) => {
      escritos.push({ clave, payload: p });
    },
  };
  return { deps, escritos };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de widgets", () => {
  it("extrae el tipo de una clave válida", () => {
    expect(tipoDeClave(`widget:${TIPO}`)).toBe(TIPO);
    expect(tipoDeClave(`widget:`)).toBeNull();
    expect(tipoDeClave(`otra:${TIPO}`)).toBeNull();
  });

  it("construye payload con ajustes y anclaje", () => {
    const payload = construirPayload(TIPO, { modo: "digital", zonas: ["UTC"] }, W, H, "M");
    expect(payload.tipo).toBe(TIPO);
    expect(payload.ajustes.modo).toBe("digital");
    expect(payload.anclaje).toEqual({ w: W, h: H });
    expect(payload.tamano).toBe("M");
  });

  it("captura el payload del widget activo", () => {
    const payload = construirPayload(TIPO, { modo: "analog" });
    const { deps } = depsCon(payload);
    const adaptador = crearAdaptadorWidgets(deps);
    const capturado = adaptador.capturar(`widget:${TIPO}`);
    expect(capturado).toEqual(payload);
  });

  it("no captura si la clave no es de widget", () => {
    const payload = construirPayload(TIPO, {});
    const { deps } = depsCon(payload);
    const adaptador = crearAdaptadorWidgets(deps);
    expect(adaptador.capturar(`tema:synthwave`)).toBeNull();
    expect(adaptador.capturar(`widget:`)).toBeNull();
  });

  it("valida el payload correcto", () => {
    const payload = construirPayload(TIPO, { modo: "digital" }, 3, 3);
    expect(validarPayloadWidget(payload).ok).toBe(true);
  });

  it("rechaza anclaje por debajo del mínimo del manifiesto", () => {
    const payload = construirPayload(TIPO, {}, 1, 1);
    const revision = validarPayloadWidget(payload);
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos.some(m => m.includes("mínimo"))).toBe(true);
  });

  it("rechaza ajustes con código", () => {
    const payload = construirPayload(TIPO, { html: "<script>x</script>" });
    const revision = validarPayloadWidget(payload);
    expect(revision.ok).toBe(false);
  });

  it("aplicar escribe el payload y deshacer restaura el anterior", () => {
    const anterior = construirPayload(TIPO, { modo: "analog" });
    const nuevo = construirPayload(TIPO, { modo: "digital" });
    const { deps, escritos } = depsCon(anterior);
    const adaptador = crearAdaptadorWidgets(deps);
    // Sobrescribir deps.leer con un valor mutable para la prueba
    let estado = anterior;
    deps.leer = () => estado;
    const { deshacer } = adaptador.aplicar(`widget:${TIPO}`, nuevo);
    expect(escritos[0].payload.ajustes.modo).toBe("digital");
    estado = nuevo;
    deshacer();
    expect(escritos[1].payload.ajustes.modo).toBe("analog");
  });

  it("registra la familia widget", () => {
    const { deps } = depsCon(null);
    registrarAdaptadorWidgets(deps);
    expect(familiasRegistradas()).toContain("widget");
    expect(adaptadorDe(`widget:CLOCK_DATE`)?.nombre).toBe("Widgets del Dashboard");
  });
});
