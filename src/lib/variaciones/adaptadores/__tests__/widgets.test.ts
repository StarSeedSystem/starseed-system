import { describe, it, expect, beforeEach } from "vitest";
import { crearAdaptadorWidgets, registrarAdaptadorWidgets, tipoDeClave, validarPayloadWidget, type DepsWidget, type PayloadWidget } from "../widgets";
import { adaptadorDe, familiasRegistradas, __resetRegistros } from "../../familias";
const TIPO = "CLOCK_DATE";
const CLAVE = `widget:${TIPO}`;
function payload(ajustes: Record<string, unknown>, anclaje?: PayloadWidget["anclaje"], tamano?: PayloadWidget["tamano"]): PayloadWidget {
  return { tipo: TIPO, ajustes, ...(anclaje ? { anclaje } : {}), ...(tamano ? { tamano } : {}) };
}
function depsCon(inicial: PayloadWidget | null) {
  let estado = inicial;
  const escritos: PayloadWidget[] = [];
  const deps: DepsWidget = {
    leer: () => estado,
    escribir: (_clave, siguiente) => { escritos.push(siguiente); estado = siguiente; },
  };
  return { deps, escritos };
}
beforeEach(() => __resetRegistros());
describe("tipoDeClave", () => {
  it("extrae el tipo real y rechaza familias o tipos inventados", () => {
    expect(tipoDeClave(CLAVE)).toBe(TIPO);
    expect(tipoDeClave("widget:")).toBeNull();
    expect(tipoDeClave("tema:CLOCK_DATE")).toBeNull();
    expect(tipoDeClave("widget:NO_EXISTE")).toBeNull();
  });
});
describe("capturar", () => {
  it("toma solo la configuración visual y de opciones, no datos personales", () => {
    const ajustes = {
      styleVariant: "cristal", clockMode: "analog", clockZones: ["Europe/Madrid"],
      customHtml: "<b>hola</b>", mensajes: ["privado"], widgetConfig: { blur: 12, glowIntensity: 8 },
    };
    const { deps } = depsCon(payload(ajustes, { w: 3, h: 3 }, "M"));
    const capturado = crearAdaptadorWidgets(deps).capturar(CLAVE);
    expect(capturado?.ajustes).toEqual({ styleVariant: "cristal", clockMode: "analog", widgetConfig: { blur: 12, glowIntensity: 8 } });
    expect(capturado?.anclaje).toEqual({ w: 3, h: 3 });
    expect(capturado?.tamano).toBe("M");
  });
  it("descarta un anclaje fuera de los límites del manifiesto", () => {
    const { deps } = depsCon(payload({}, { w: 1, h: 1 }));
    expect(crearAdaptadorWidgets(deps).capturar(CLAVE)?.anclaje).toBeUndefined();
  });
  it("devuelve null si no hay instancia o la clave no es de widget", () => {
    expect(crearAdaptadorWidgets(depsCon(null).deps).capturar(CLAVE)).toBeNull();
    expect(crearAdaptadorWidgets(depsCon(payload({})).deps).capturar("tema:x")).toBeNull();
  });
});
describe("validarPayloadWidget", () => {
  it("acepta un payload limpio", () => {
    expect(validarPayloadWidget(payload({ clockMode: "digital" }, { w: 2, h: 2 })).ok).toBe(true);
  });
  it("rechaza tipos inexistentes y datos ajenos", () => {
    expect(validarPayloadWidget({ tipo: "NO_EXISTE", ajustes: {} }).ok).toBe(false);
    expect(validarPayloadWidget({ ...payload({}), nombre: "Alex" }).ok).toBe(false);
  });
  it("rechaza ajustes no publicables, secretos o código", () => {
    expect(validarPayloadWidget(payload({ clockZones: ["UTC"] })).ok).toBe(false);
    expect(validarPayloadWidget(payload({ token: "abc" })).ok).toBe(false);
    expect(validarPayloadWidget(payload({ html: "<script>x</script>" })).ok).toBe(false);
  });
  it("respeta los mínimos de getSizeConstraints", () => {
    const revision = validarPayloadWidget(payload({}, { w: 1, h: 1 }));
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.motivos.some((m) => m.includes("mínimo"))).toBe(true);
  });
  it("rechaza tallas y opciones desconocidas", () => {
    expect(validarPayloadWidget(payload({ clockMode: "binario" })).ok).toBe(false);
    expect(validarPayloadWidget({ ...payload({}), tamano: "XXL" }).ok).toBe(false);
  });
});
describe("aplicar", () => {
  it("fusiona la variación con la instancia y deshacer restaura la anterior", () => {
    const anterior = payload({ styleVariant: "solido", clockMode: "digital", clockZones: ["UTC"] }, { w: 3, h: 3 });
    const { deps, escritos } = depsCon(anterior);
    const adaptador = crearAdaptadorWidgets(deps);
    const { deshacer } = adaptador.aplicar(CLAVE, payload({ styleVariant: "trinity", trinityNode: "zenith" }));
    expect(escritos[0].ajustes).toEqual({ styleVariant: "trinity", trinityNode: "zenith", clockMode: "digital", clockZones: ["UTC"] });
    expect(escritos[0].anclaje).toEqual({ w: 3, h: 3 });
    deshacer();
    expect(escritos[1]).toEqual(anterior);
  });
  it("rechaza claves que no coinciden y payloads inválidos sin escribir", () => {
    const { deps, escritos } = depsCon(payload({}));
    const adaptador = crearAdaptadorWidgets(deps);
    expect(() => adaptador.aplicar("widget:WEATHER_BASIC", payload({}))).toThrow();
    expect(() => adaptador.aplicar(CLAVE, payload({ html: "<script>x</script>" }))).toThrow();
    expect(escritos).toHaveLength(0);
  });
  it("exige una instancia sobre la que fusionar", () => {
    const adaptador = crearAdaptadorWidgets(depsCon(null).deps);
    expect(() => adaptador.aplicar(CLAVE, payload({}))).toThrow();
  });
});
describe("registro", () => {
  it("registra la familia widget", () => {
    registrarAdaptadorWidgets(depsCon(null).deps);
    expect(familiasRegistradas()).toContain("widget");
    expect(adaptadorDe(CLAVE)?.nombre).toBe("Widgets del Dashboard");
  });
});
describe("cableado con el arranque del OS", () => {
  it("registra el adaptador real y aplica sobre el widget guardado", async () => {
    __resetRegistros();
    const datos = new Map<string, string>();
    const ventanaFalsa = {
      localStorage: {
        getItem: (clave: string) => datos.get(clave) ?? null,
        setItem: (clave: string, valor: string) => { datos.set(clave, valor); },
        removeItem: (clave: string) => { datos.delete(clave); },
      },
    };
    (globalThis as { window?: unknown }).window = ventanaFalsa;
    try {
      datos.set("starseed_widgets", JSON.stringify({
        d1: [{
          id: "w1", dashboard_id: "d1", widget_type: TIPO,
          layout: { x: 0, y: 0, w: 3, h: 3 },
          settings: { clockMode: "digital", clockZones: ["UTC"] },
          size: "M", created_at: "2026-10-30T00:00:00.000Z",
        }],
      }));
      await import("../../adaptadores");
      const adaptador = adaptadorDe(CLAVE);
      expect(adaptador?.nombre).toBe("Widgets del Dashboard");
      expect(adaptador?.capturar(CLAVE)).toEqual({
        tipo: TIPO, ajustes: { clockMode: "digital" }, anclaje: { w: 3, h: 3 }, tamano: "M",
      });
      const { deshacer } = adaptador!.aplicar(CLAVE, payload({ styleVariant: "trinity", trinityNode: "zenith" }, { w: 4, h: 3 }, "L"));
      const guardado = JSON.parse(datos.get("starseed_widgets") ?? "{}") as Record<string, Array<{
        settings: Record<string, unknown>; layout: { w: number; h: number }; size?: string;
      }>>;
      expect(guardado.d1[0].settings).toEqual({
        clockMode: "digital", clockZones: ["UTC"], styleVariant: "trinity", trinityNode: "zenith",
      });
      expect(guardado.d1[0].layout).toMatchObject({ w: 4, h: 3 });
      expect(guardado.d1[0].size).toBe("L");
      deshacer();
      const deshecho = JSON.parse(datos.get("starseed_widgets") ?? "{}") as Record<string, Array<{
        settings: Record<string, unknown>; layout: { w: number; h: number }; size?: string;
      }>>;
      expect(deshecho.d1[0].settings).toEqual({ clockMode: "digital", clockZones: ["UTC"] });
      expect(deshecho.d1[0].layout).toMatchObject({ w: 3, h: 3 });
      expect(deshecho.d1[0].size).toBe("M");
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});