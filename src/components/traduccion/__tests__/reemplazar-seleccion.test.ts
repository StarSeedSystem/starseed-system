// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { capturarSeleccionEditable, deshacerUltimo, reemplazar } from "../reemplazar-seleccion";
function area(valor: string): HTMLTextAreaElement {
  const el = document.createElement("textarea");
  el.value = valor; document.body.append(el); el.focus(); return el;
}
function entrada(valor: string, tipo = "text"): HTMLInputElement {
  const el = document.createElement("input");
  el.type = tipo; el.value = valor; document.body.append(el); el.focus(); return el;
}
function editable(texto: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.textContent = texto; document.body.append(el); el.focus();
  const nodo = el.firstChild as Text;
  const rango = document.createRange();
  rango.setStart(nodo, 5); rango.setEnd(nodo, 10);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(rango);
  return el;
}
afterEach(() => {
  deshacerUltimo();
  window.getSelection()?.removeAllRanges();
  document.body.textContent = "";
});
describe("capturarSeleccionEditable · campos de texto", () => {
  it("captura la selección de un textarea con sus desplazamientos", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    expect(capturarSeleccionEditable(document)).toMatchObject({ inicio: 5, fin: 10, texto: "mundo" });
  });
  it("captura la selección de un input de texto", () => {
    const el = entrada("Correo listo");
    el.setSelectionRange(0, 6);
    expect(capturarSeleccionEditable(document)?.texto).toBe("Correo");
  });
  it("nunca captura un input type=password", () => {
    entrada("secreto", "password");
    expect(capturarSeleccionEditable(document)).toBeNull();
  });
  it("sin texto seleccionado devuelve null", () => {
    area("Hola mundo").setSelectionRange(4, 4);
    expect(capturarSeleccionEditable(document)).toBeNull();
  });
});
describe("reemplazar · sustituye lo capturado", () => {
  it("en textarea escribe el valor nuevo y emite un evento input", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    let avisos = 0;
    el.addEventListener("input", () => { avisos += 1; });
    const objetivo = capturarSeleccionEditable(document)!;
    expect(reemplazar(objetivo, "world")).toBe(true);
    expect(el.value).toBe("Hola world");
    expect(avisos).toBe(1);
  });
  it("en input de texto sustituye solo la selección", () => {
    const el = entrada("Correo listo");
    el.setSelectionRange(0, 6);
    const objetivo = capturarSeleccionEditable(document)!;
    expect(reemplazar(objetivo, "Mensaje")).toBe(true);
    expect(el.value).toBe("Mensaje listo");
  });
  it("en contenteditable borra el rango e inserta el texto nuevo", () => {
    const el = editable("Hola mundo");
    const objetivo = capturarSeleccionEditable(document);
    expect(objetivo?.texto).toBe("mundo");
    expect(reemplazar(objetivo!, "world")).toBe(true);
    expect(el.textContent).toBe("Hola world");
  });
  it("devuelve false si el elemento ya no está en el documento", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    el.remove();
    expect(reemplazar(objetivo, "world")).toBe(false);
  });
  it("devuelve false si el texto cambió desde la captura", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    const objetivo = capturarSeleccionEditable(document)!;
    el.value = "Hola país";
    expect(reemplazar(objetivo, "world")).toBe(false);
  });
});
describe("deshacerUltimo · una sola sustitución", () => {
  it("devuelve el texto anterior de un campo", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    reemplazar(capturarSeleccionEditable(document)!, "world");
    expect(deshacerUltimo()).toBe(true);
    expect(el.value).toBe("Hola mundo");
  });
  it("devuelve el texto anterior de un contenteditable", () => {
    const el = editable("Hola mundo");
    reemplazar(capturarSeleccionEditable(document)!, "world");
    expect(deshacerUltimo()).toBe(true);
    expect(el.textContent).toBe("Hola mundo");
  });
  it("la segunda vez ya no hay nada que deshacer", () => {
    const el = area("Hola mundo");
    el.setSelectionRange(5, 10);
    reemplazar(capturarSeleccionEditable(document)!, "world");
    expect(deshacerUltimo()).toBe(true);
    expect(deshacerUltimo()).toBe(false);
  });
});
