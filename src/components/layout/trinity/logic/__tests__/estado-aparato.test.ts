import { describe, expect, it } from "vitest";
import {
  construirChips,
  etiquetaTipoRed,
  porcentajeBateria,
  redDesdeNavegador,
  tonoBateria,
  type EstadoAparato,
} from "../estado-aparato";

const base: EstadoAparato = {
  bateria: null,
  red: { enLinea: true, tipo: null, ahorroDatos: false },
  medio: null,
  sesion: true,
};

describe("batería", () => {
  it("el porcentaje se redondea y se acota entre 0 y 100", () => {
    expect(porcentajeBateria({ nivel: 0.824, cargando: false })).toBe(82);
    expect(porcentajeBateria({ nivel: 1.7, cargando: false })).toBe(100);
    expect(porcentajeBateria({ nivel: -1, cargando: false })).toBe(0);
    expect(porcentajeBateria({ nivel: Number.NaN, cargando: false })).toBe(0);
  });

  it("el tono avisa al 30 % y alerta al 15 %, salvo que esté cargando", () => {
    expect(tonoBateria({ nivel: 0.8, cargando: false })).toBe("ok");
    expect(tonoBateria({ nivel: 0.3, cargando: false })).toBe("aviso");
    expect(tonoBateria({ nivel: 0.15, cargando: false })).toBe("alerta");
    expect(tonoBateria({ nivel: 0.05, cargando: true })).toBe("ok");
  });
});

describe("red", () => {
  it("traduce el tipo efectivo y no inventa uno que el navegador no dice", () => {
    expect(etiquetaTipoRed("4g")).toBe("4G");
    expect(etiquetaTipoRed("3g")).toBe("3G");
    expect(etiquetaTipoRed("2g")).toBe("2G");
    expect(etiquetaTipoRed("slow-2g")).toBe("Lenta");
    expect(etiquetaTipoRed("wifi")).toBeNull();
    expect(etiquetaTipoRed(undefined)).toBeNull();
  });

  it("lee conexión, tipo y ahorro de datos; sin datos supone en línea", () => {
    expect(redDesdeNavegador({ onLine: false })).toEqual({ enLinea: false, tipo: null, ahorroDatos: false });
    expect(redDesdeNavegador({ onLine: true, connection: { effectiveType: "3g", saveData: true } })).toEqual({
      enLinea: true,
      tipo: "3G",
      ahorroDatos: true,
    });
    expect(redDesdeNavegador(undefined).enLinea).toBe(true);
    expect(redDesdeNavegador({}).enLinea).toBe(true);
  });
});

describe("construirChips", () => {
  const ids = (e: EstadoAparato) => construirChips(e).map((c) => c.id);

  it("sin batería (Safari, Firefox) no hay chip de batería", () => {
    expect(ids(base)).toEqual(["red", "neurona", "sesion"]);
  });

  it("con batería, aparece primero con su porcentaje y si carga", () => {
    const chips = construirChips({ ...base, bateria: { nivel: 0.82, cargando: true } });
    expect(chips[0]).toMatchObject({ id: "bateria", texto: "82 %", variante: "cargando", tono: "ok" });
    expect(chips[0].descripcion).toContain("cargando");
    const baja = construirChips({ ...base, bateria: { nivel: 0.1, cargando: false } })[0];
    expect(baja).toMatchObject({ variante: "baja", tono: "alerta" });
  });

  it("la red dice En línea (con el tipo si se sabe) o Sin conexión", () => {
    expect(construirChips(base).find((c) => c.id === "red")).toMatchObject({ texto: "En línea", tono: "ok" });
    const lenta = construirChips({ ...base, red: { enLinea: true, tipo: "2G", ahorroDatos: true } }).find((c) => c.id === "red")!;
    expect(lenta.texto).toBe("En línea · 2G");
    expect(lenta.tono).toBe("aviso");
    expect(lenta.descripcion).toContain("ahorro de datos");
    const fuera = construirChips({ ...base, red: { enLinea: false, tipo: null, ahorroDatos: false } }).find((c) => c.id === "red")!;
    expect(fuera).toMatchObject({ texto: "Sin conexión", tono: "alerta" });
  });

  it("«Esta neurona» incluye el medio cuando se conoce", () => {
    expect(construirChips(base).find((c) => c.id === "neurona")!.descripcion).toBe("Esta neurona");
    const c = construirChips({ ...base, medio: "Chrome 154 · app instalada" }).find((x) => x.id === "neurona")!;
    expect(c.texto).toBe("Esta neurona");
    expect(c.descripcion).toContain("Chrome 154 · app instalada");
  });

  it("la sesión pasa de «Comprobando» a activa o ausente, sin mentir mientras tanto", () => {
    const sesion = (s: boolean | null) => construirChips({ ...base, sesion: s }).find((c) => c.id === "sesion")!;
    expect(sesion(null)).toMatchObject({ texto: "Comprobando…", tono: "neutro" });
    expect(sesion(true)).toMatchObject({ texto: "Sesión activa", tono: "ok" });
    expect(sesion(false)).toMatchObject({ texto: "Sin sesión", tono: "aviso" });
  });
});
