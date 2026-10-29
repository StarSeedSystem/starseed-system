import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENLACES_FUENTES,
  PILA_DISPLAY,
  PILA_ORGANICA,
  PILA_TITULAR,
  URL_QUICKSAND,
  URL_SATOSHI,
  VARIABLES_FUENTE,
  enlacesFaltantes,
  enlacesParaPapeles,
  fijarVariablesFuente,
  FuentesMarca,
} from "../fuentes-marca";

afterEach(() => { cleanup(); });

describe("catálogo de enlaces de la marca", () => {
  it("la hoja de Satoshi lista los pesos del papel display editorial via Fontshare", () => {
    expect(URL_SATOSHI).toContain("api.fontshare.com/v2/css");
    expect(URL_SATOSHI).toContain("satoshi@500,700,900");
    expect(URL_SATOSHI).toContain("display=swap");
    const enlace = ENLACES_FUENTES.find((e) => e.papel === "display-editorial");
    expect(enlace?.href).toBe(URL_SATOSHI);
  });
  it("Quicksand (tema Natural) entra por su css2 de Google Fonts con display=swap", () => {
    expect(URL_QUICKSAND).toContain("fonts.googleapis.com/css2");
    expect(URL_QUICKSAND).toContain("Quicksand");
    expect(URL_QUICKSAND).toContain("display=swap");
    const enlace = ENLACES_FUENTES.find((e) => e.papel === "organico");
    expect(enlace?.href).toBe(URL_QUICKSAND);
  });
  it("cada enlace tiene id único: así puede comprobarse sin red si ya cargó", () => {
    const ids = ENLACES_FUENTES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});

describe("lógica pura de selección", () => {
  it("solo entrega el papel pedido: el display editorial trae Satoshi y el orgánico Quicksand", () => {
    expect(enlacesParaPapeles(["display-editorial"]).map((e) => e.papel))
      .toEqual(["display-editorial"]);
    expect(enlacesParaPapeles(["organico"]).map((e) => e.papel)).toEqual(["organico"]);
  });
  it("con el documento vacío faltan todos los enlaces pedidos", () => {
    expect(enlacesFaltantes([], ENLACES_FUENTES)).toHaveLength(2);
  });
  it("si el documento ya tiene la hoja, no vuelve a pedirla (sin duplicados)", () => {
    const presentes = ENLACES_FUENTES.map((e) => e.href);
    expect(enlacesFaltantes(presentes, ENLACES_FUENTES)).toEqual([]);
  });
  it("solo faltan las hojas que el documento aún no declara", () => {
    const presentes = enlacesParaPapeles(["organico"]).map((e) => e.href);
    expect(enlacesFaltantes(presentes, ENLACES_FUENTES).map((e) => e.id))
      .toEqual(["ss-fuente-satoshi"]);
  });
});

describe("variables de la marca con respaldo", () => {
  it("exponen display, titular y orgánica", () => {
    expect(Object.keys(VARIABLES_FUENTE)).toEqual([
      "--ss-font-display",
      "--ss-font-titular",
      "--ss-font-organica",
    ]);
  });
  it("display: Satoshi con Rajdhani como respaldo y luego la pila del OS", () => {
    expect(PILA_DISPLAY.startsWith("'Satoshi'")).toBe(true);
    expect(PILA_DISPLAY).toContain("'Rajdhani'");
    expect(PILA_DISPLAY).toContain("var(--font-body)");
    expect(PILA_DISPLAY).toContain("sans-serif");
  });
  it("titular Rajdhani y orgánica Quicksand caen a la familia del OS sin red", () => {
    expect(PILA_TITULAR.startsWith("'Rajdhani'")).toBe(true);
    expect(PILA_TITULAR).toContain("var(--font-body)");
    expect(PILA_ORGANICA.startsWith("'Quicksand'")).toBe(true);
    expect(PILA_ORGANICA).toContain("var(--font-body)");
  });
  it("fijarVariablesFuente escribe una vez y no reescribe lo ya fijado", () => {
    const caja = document.createElement("div");
    const escritas = vi.spyOn(caja.style, "setProperty");
    fijarVariablesFuente({ style: caja.style });
    fijarVariablesFuente({ style: caja.style });
    expect(caja.style.getPropertyValue("--ss-font-display")).toBe(PILA_DISPLAY);
    expect(escritas).toHaveBeenCalledTimes(Object.keys(VARIABLES_FUENTE).length);
    escritas.mockRestore();
  });
});

describe("FuentesMarca (documento jsdom, sin red)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    for (const nombre of Object.keys(VARIABLES_FUENTE)) {
      document.documentElement.style.removeProperty(nombre);
    }
  });
  it("sin papeles pedidos carga las dos hojas (una por familia) sin pintar nada", () => {
    const { container } = render(<FuentesMarca />);
    const hrefs = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"),
    ).map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual([URL_SATOSHI, URL_QUICKSAND]);
    expect(container.textContent).toBe("");
    expect(document.documentElement.style.getPropertyValue("--ss-font-display"))
      .toBe(PILA_DISPLAY);
  });
  it("al montar de nuevo no duplica enlaces: el documento ya los declara", () => {
    render(<FuentesMarca />);
    cleanup();
    render(<FuentesMarca />);
    const enlaces = document.head.querySelectorAll("link[rel=stylesheet]");
    expect(enlaces).toHaveLength(2);
  });
  it("al pedir solo el papel display editorial carga una hoja, y es la de Satoshi", () => {
    render(<FuentesMarca papeles={["display-editorial"]} />);
    const enlaces = document.head.querySelectorAll("link[rel=stylesheet]");
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]?.getAttribute("href")).toBe(URL_SATOSHI);
  });
});
