// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ATRIBUTO_VENTANA_LLAMADA, Z_SENSOR_CON_LLAMADA, Z_VENTANA_LLAMADA, hayVentanaLlamada, puntoSobreVentanaLlamada, registrarVentanaLlamada } from "../zona-llamada";

afterEach(() => void (document.body.innerHTML = ""));

describe("zona de la ventana de llamada (LLA1112B)", () => {
  it("el sensor queda justo por debajo de la ventana", () => {
    expect(Z_SENSOR_CON_LLAMADA).toBe(Z_VENTANA_LLAMADA - 1);
  });
  it("cuenta ventanas y la baja es idempotente", () => {
    expect(hayVentanaLlamada()).toBe(false);
    const a = registrarVentanaLlamada();
    const b = registrarVentanaLlamada();
    a();
    a();
    expect(hayVentanaLlamada()).toBe(true);
    b();
    expect(hayVentanaLlamada()).toBe(false);
  });
  it("el punto dentro de la ventana (con margen) cuenta; fuera, no", () => {
    const el = document.createElement("section");
    el.setAttribute(ATRIBUTO_VENTANA_LLAMADA, "");
    el.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 400, width: 200, height: 300, x: 100, y: 100, toJSON() {} }) as DOMRect;
    document.body.appendChild(el);
    expect(puntoSobreVentanaLlamada(150, 390)).toBe(true);
    expect(puntoSobreVentanaLlamada(50, 390)).toBe(false);
    expect(puntoSobreVentanaLlamada(95, 390, 10)).toBe(true);
    expect(puntoSobreVentanaLlamada(150, 450)).toBe(false);
  });
  it("sin ventanas en el documento nunca hay solape", () => {
    expect(puntoSobreVentanaLlamada(10, 10)).toBe(false);
  });
});
