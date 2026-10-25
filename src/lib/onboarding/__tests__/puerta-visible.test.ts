/**
 * ACC1025B · el contador de «hay una puerta de sesión a la vista».
 * De él depende que el aviso de abajo del primer arranque no salga mientras la tarjeta ya está en el centro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { _reiniciarPuertasParaPruebas, hayPuertaVisible, registrarPuerta, suscribirPuerta } from "../puerta-visible";

afterEach(() => _reiniciarPuertasParaPruebas());

describe("puerta-visible", () => {
  it("empieza sin puertas", () => {
    expect(hayPuertaVisible()).toBe(false);
  });

  it("registrar la enciende y soltarla la apaga", () => {
    const soltar = registrarPuerta();
    expect(hayPuertaVisible()).toBe(true);
    soltar();
    expect(hayPuertaVisible()).toBe(false);
  });

  it("cuenta puertas: sigue encendida hasta que se suelta la última", () => {
    const a = registrarPuerta();
    const b = registrarPuerta();
    a();
    expect(hayPuertaVisible()).toBe(true);
    b();
    expect(hayPuertaVisible()).toBe(false);
  });

  it("soltar dos veces la misma no apaga la de otra página", () => {
    const a = registrarPuerta();
    const b = registrarPuerta();
    a();
    a();
    expect(hayPuertaVisible()).toBe(true);
    b();
    expect(hayPuertaVisible()).toBe(false);
  });

  it("avisa a quien se suscribe, y deja de avisar al darse de baja", () => {
    const oyente = vi.fn();
    const baja = suscribirPuerta(oyente);
    const soltar = registrarPuerta();
    expect(oyente).toHaveBeenCalledTimes(1);
    soltar();
    expect(oyente).toHaveBeenCalledTimes(2);
    baja();
    registrarPuerta();
    expect(oyente).toHaveBeenCalledTimes(2);
  });

  it("un oyente que falla no tumba a los demás", () => {
    suscribirPuerta(() => {
      throw new Error("roto");
    });
    const bueno = vi.fn();
    suscribirPuerta(bueno);
    expect(() => registrarPuerta()).not.toThrow();
    expect(bueno).toHaveBeenCalled();
  });
});
