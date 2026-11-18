// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { capturarSeleccionEditable, deshacerUltimo, reemplazar } from "../reemplazar-seleccion";

function enDocumento<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  el.focus();
  return el;
}

function areaCon(texto: string, inicio: number, fin: number): HTMLTextAreaElement {
  const area = enDocumento(document.createElement("textarea"));
  area.value = texto;
  area.setSelectionRange(inicio, fin);
  return area;
}

function hostCon(texto: string, inicio: number, fin: number): HTMLElement {
  const host = enDocumento(document.createElement("div"));
  host.setAttribute("contenteditable", "true");
  host.textContent = texto;
  const rango = document.createRange();
  rango.setStart(host.firstChild!, inicio);
  rango.setEnd(host.firstChild!, fin);
  const seleccion = document.getSelection()!;
  seleccion.removeAllRanges();
  seleccion.addRange(rango);
  return host;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("capturarSeleccionEditable", () => {
  it("captura la selección de un textarea", () => {
    const area = areaCon("hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document);
    expect(objetivo?.elemento).toBe(area);
    expect(objetivo).toMatchObject({ inicio: 5, fin: 10, texto: "mundo" });
  });

  it("captura la selección de un input de texto y la sustituye", () => {
    const entrada = enDocumento(document.createElement("input"));
    entrada.type = "text";
    entrada.value = "buenos días";
    entrada.setSelectionRange(0, 6);
    const objetivo = capturarSeleccionEditable(document)!;
    expect(objetivo).toMatchObject({ inicio: 0, fin: 6, texto: "buenos" });
    expect(reemplazar(objetivo, "buenas")).toBe(true);
    expect(entrada.value).toBe("buenas días");
  });

  it("nunca captura un input type=password", () => {
    const clave = enDocumento(document.createElement("input"));
    clave.type = "password";
    clave.value = "secreto";
    clave.setSelectionRange(0, 7);
    expect(capturarSeleccionEditable(document)).toBeNull();
  });
});

describe("reemplazar", () => {
  it("sustituye en un textarea con setRangeText y avisa con input", () => {
    const area = areaCon("hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    const eventos: string[] = [];
    area.addEventListener("input", () => eventos.push("input"));
    expect(reemplazar(objetivo, "terra")).toBe(true);
    expect(area.value).toBe("hola terra");
    expect(eventos).toEqual(["input"]);
  });

  it("sustituye en un contenteditable con Range", () => {
    const host = hostCon("hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    expect(objetivo).toMatchObject({ inicio: 5, fin: 10, texto: "mundo" });
    expect(reemplazar(objetivo, "terra")).toBe(true);
    expect(host.textContent).toBe("hola terra");
  });

  it("devuelve false si el elemento ya no está en el documento", () => {
    const area = areaCon("hola mundo", 0, 4);
    const objetivo = capturarSeleccionEditable(document)!;
    area.remove();
    expect(reemplazar(objetivo, "adiós")).toBe(false);
  });

  it("devuelve false si el texto cambió desde la captura", () => {
    const area = areaCon("hola mundo", 0, 4);
    const objetivo = capturarSeleccionEditable(document)!;
    area.value = "otra cosa";
    expect(reemplazar(objetivo, "adiós")).toBe(false);
    expect(area.value).toBe("otra cosa");
  });
});

describe("deshacerUltimo", () => {
  it("devuelve una única sustitución a su texto anterior", () => {
    const area = areaCon("hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    expect(reemplazar(objetivo, "terra")).toBe(true);
    expect(deshacerUltimo()).toBe(true);
    expect(area.value).toBe("hola mundo");
    expect(deshacerUltimo()).toBe(false);
  });

  it("deshace también en un contenteditable", () => {
    const host = hostCon("hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    expect(reemplazar(objetivo, "terra")).toBe(true);
    expect(deshacerUltimo()).toBe(true);
    expect(host.textContent).toBe("hola mundo");
  });
});
