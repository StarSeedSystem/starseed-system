// @vitest-environment jsdom
/**
 * Reemplazar la selección editable (Ola IMA19 · TRA1116-IDIOMAS): captura de input,
 * textarea y contenteditable, sustitución con evento `input` y deshacer de una sola vez.
 * Todo el DOM es jsdom; ninguna prueba toca red, disco ni procesos.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { capturarSeleccionEditable, deshacerUltimo, reemplazar } from "../reemplazar-seleccion";

/** Selecciona un tramo del primer nodo de texto de la raíz. */
function seleccionarTexto(raiz: Node, inicio: number, fin: number): void {
  const nodo = raiz.firstChild;
  if (!(nodo instanceof Text)) throw new Error("La raíz de la prueba no tiene un nodo de texto.");
  const rango = document.createRange();
  rango.setStart(nodo, inicio);
  rango.setEnd(nodo, fin);
  const seleccion = document.getSelection();
  if (!seleccion) throw new Error("jsdom no dio una selección.");
  seleccion.removeAllRanges();
  seleccion.addRange(rango);
}

/** Monta un campo, lo enfoca y le deja la selección pedida (tipo solo para input). */
function montar(tag: "input" | "textarea", valor: string, inicio: number, fin: number, tipo?: string): HTMLInputElement | HTMLTextAreaElement {
  const el = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
  if (tipo && el instanceof HTMLInputElement) el.type = tipo;
  el.value = valor;
  document.body.append(el);
  el.focus();
  el.setSelectionRange(inicio, fin);
  return el;
}

/** Monta un contenteditable, lo enfoca y le deja la selección pedida. */
function montarEditable(valor: string, inicio: number, fin: number): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("contenteditable", "true");
  div.tabIndex = 0;
  div.textContent = valor;
  document.body.append(div);
  div.focus();
  seleccionarTexto(div, inicio, fin);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = "";
  deshacerUltimo();
});

describe("capturarSeleccionEditable", () => {
  it("captura un textarea con su selección", () => {
    const ta = montar("textarea", "Hola mundo", 5, 10);
    expect(capturarSeleccionEditable(document)).toEqual({ elemento: ta, tipo: "campo", inicio: 5, fin: 10, texto: "mundo" });
  });

  it("captura un input de texto y rechaza password", () => {
    montar("input", "gato negro", 0, 4);
    expect(capturarSeleccionEditable(document)).toMatchObject({ tipo: "campo", inicio: 0, fin: 4, texto: "gato" });
    montar("input", "secreto", 0, 7, "password");
    expect(capturarSeleccionEditable(document)).toBeNull();
  });

  it("captura un contenteditable con texto seleccionado", () => {
    montarEditable("Hola mundo", 5, 10);
    expect(capturarSeleccionEditable(document)).toMatchObject({ tipo: "editable", inicio: 5, fin: 10, texto: "mundo" });
  });
});

describe("reemplazar", () => {
  it("sustituye en textarea y avisa con un evento input", () => {
    const ta = montar("textarea", "Hola mundo", 5, 10);
    const objetivo = capturarSeleccionEditable(document);
    let avisos = 0;
    ta.addEventListener("input", () => { avisos += 1; });
    expect(reemplazar(objetivo!, "Mundo")).toBe(true);
    expect(ta.value).toBe("Hola Mundo");
    expect(avisos).toBe(1);
  });

  it("sustituye en input y en contenteditable", () => {
    const input = montar("input", "gato negro", 0, 4);
    expect(reemplazar(capturarSeleccionEditable(document)!, "perro")).toBe(true);
    expect(input.value).toBe("perro negro");
    const div = montarEditable("Hola mundo", 5, 10);
    expect(reemplazar(capturarSeleccionEditable(document)!, "Mundo")).toBe(true);
    expect(div.textContent).toBe("Hola Mundo");
  });

  it("devuelve false si el elemento se retiró o el texto cambió", () => {
    const ta = montar("textarea", "Hola mundo", 0, 4);
    const retirado = capturarSeleccionEditable(document);
    ta.remove();
    expect(reemplazar(retirado!, "Adiós")).toBe(false);
    const otra = montar("textarea", "Hola mundo", 5, 10);
    const cambiado = capturarSeleccionEditable(document);
    otra.value = "Otro texto";
    expect(reemplazar(cambiado!, "Mundo")).toBe(false);
  });
});

describe("deshacerUltimo", () => {
  it("devuelve el texto anterior de la última sustitución, una sola vez", () => {
    const ta = montar("textarea", "Hola mundo", 5, 10);
    expect(reemplazar(capturarSeleccionEditable(document)!, "Mundo")).toBe(true);
    expect(ta.value).toBe("Hola Mundo");
    expect(deshacerUltimo()).toBe(true);
    expect(ta.value).toBe("Hola mundo");
    expect(deshacerUltimo()).toBe(false);
  });
});
