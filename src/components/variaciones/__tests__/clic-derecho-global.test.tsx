import { describe, it, expect } from "vitest";
import {
  ATRIBUTO_MENU_PROPIO,
  dentroDeTolerancia,
  decidirClicDerecho,
  enlaceElemento,
  esCampoDeTexto,
  limitarPosicion,
  posicionDeMenu,
  tieneMenuPropio,
} from "../clic-derecho-global";

const elemento = (etiqueta: string, atributos: Record<string, string> = {}) => {
  const el = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) el.setAttribute(nombre, valor);
  return el;
};

describe("clic-derecho-global · campos de texto", () => {
  it("reconoce los campos que conservan el menú del navegador", () => {
    expect(esCampoDeTexto(elemento("input"))).toBe(true);
    expect(esCampoDeTexto(elemento("input", { type: "email" }))).toBe(true);
    expect(esCampoDeTexto(elemento("textarea"))).toBe(true);
    expect(esCampoDeTexto(elemento("select"))).toBe(true);
    expect(esCampoDeTexto(elemento("div", { contenteditable: "" }))).toBe(true);
    expect(esCampoDeTexto(elemento("div", { contenteditable: "true" }))).toBe(true);
    expect(esCampoDeTexto(elemento("div", { role: "textbox" }))).toBe(true);
  });

  it("no confunde botones, casillas ni elementos nulos con campos de texto", () => {
    expect(esCampoDeTexto(elemento("input", { type: "checkbox" }))).toBe(false);
    expect(esCampoDeTexto(elemento("input", { type: "button" }))).toBe(false);
    expect(esCampoDeTexto(elemento("button"))).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });
});

describe("clic-derecho-global · menús propios", () => {
  it("detecta la marca en el propio elemento y en sus ancestros", () => {
    const padre = elemento("div", { [ATRIBUTO_MENU_PROPIO]: "" });
    const hijo = elemento("span");
    padre.appendChild(hijo);
    expect(tieneMenuPropio(padre)).toBe(true);
    expect(tieneMenuPropio(hijo)).toBe(true);
    expect(tieneMenuPropio(elemento("div"))).toBe(false);
    expect(tieneMenuPropio(null)).toBe(false);
  });
});

describe("clic-derecho-global · decisión del clic derecho", () => {
  it("Mayúsculas siempre deja el menú del navegador, aunque haya clave", () => {
    const el = elemento("div", { "data-ss-elemento": "widget:clima" });
    expect(decidirClicDerecho(el, true)).toEqual({ accion: "navegador", clave: null });
  });

  it("con menú propio no interviene", () => {
    const el = elemento("div", { "data-ss-elemento": "widget:clima", [ATRIBUTO_MENU_PROPIO]: "" });
    expect(decidirClicDerecho(el)).toEqual({ accion: "propio", clave: null });
  });

  it("en un campo de texto deja actuar al navegador", () => {
    const el = elemento("input", { "data-ss-elemento": "widget:clima" });
    expect(decidirClicDerecho(el)).toEqual({ accion: "navegador", clave: null });
  });

  it("abre el menú cuando encuentra la clave canónica más cercana", () => {
    expect(decidirClicDerecho(elemento("div", { "data-ss-elemento": "widget:clima" }))).toEqual({
      accion: "menu",
      clave: "widget:clima",
    });
    expect(decidirClicDerecho(elemento("div", { "data-ss-background": "aurora" }))).toEqual({
      accion: "menu",
      clave: "fondo:aurora",
    });
  });

  it("sin clave no se queda con un clic derecho ajeno", () => {
    expect(decidirClicDerecho(elemento("div"))).toEqual({ accion: "navegador", clave: null });
    expect(decidirClicDerecho(null)).toEqual({ accion: "navegador", clave: null });
  });
});

describe("clic-derecho-global · enlace al elemento", () => {
  it("añade el ancla sobre una base limpia", () => {
    expect(enlaceElemento("widget:clima", "https://starseed-os.vercel.app/app")).toBe(
      "https://starseed-os.vercel.app/app#elemento=widget%3Aclima",
    );
    expect(enlaceElemento("post:123#estilo", "https://os.local/os?x=1#viejo")).toBe(
      "https://os.local/os#elemento=post%3A123%23estilo",
    );
  });

  it("rechaza claves no canónicas", () => {
    expect(enlaceElemento("widgetclima", "https://os.local")).toBeNull();
    expect(enlaceElemento("widget:", "https://os.local")).toBeNull();
  });
});

describe("clic-derecho-global · pulsación larga y posición", () => {
  it("tolera poco movimiento, no un arrastre", () => {
    expect(dentroDeTolerancia({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(true);
    expect(dentroDeTolerancia({ x: 10, y: 10 }, { x: 20.5, y: 10 })).toBe(false);
  });

  it("encaja el menú dentro de la ventana", () => {
    expect(limitarPosicion(100, 100, 1000, 800)).toEqual({ x: 100, y: 100 });
    expect(limitarPosicion(999, 799, 1000, 800)).toEqual({ x: 732, y: 660 });
    expect(limitarPosicion(-5, -5, 1000, 800)).toEqual({ x: 8, y: 8 });
  });

  it("coloca el menú bajo el elemento y, si no cabe, encima", () => {
    expect(posicionDeMenu({ left: 50, top: 100, bottom: 120 }, 1000, 800)).toEqual({ x: 50, y: 126 });
    expect(posicionDeMenu({ left: 50, top: 700, bottom: 720 }, 1000, 800)).toEqual({ x: 50, y: 562 });
  });
});
