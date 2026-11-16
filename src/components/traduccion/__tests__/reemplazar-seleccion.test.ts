import { beforeEach, describe, expect, it } from "vitest";
import {
  capturarSeleccionEditable,
  deshacerUltimo,
  reemplazar,
} from "../reemplazar-seleccion";

function montarTextarea(valor = "hola mundo"): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.value = valor;
  document.body.append(ta);
  return ta;
}

function montarInput(valor = "hola mundo", tipo = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = tipo;
  input.value = valor;
  document.body.append(input);
  return input;
}

function montarEditable(texto = "hola mundo"): HTMLDivElement {
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.textContent = texto;
  document.body.append(div);
  return div;
}

function seleccionarEnElementoTexto(el: HTMLInputElement | HTMLTextAreaElement, ini: number, fin: number): void {
  el.focus();
  el.setSelectionRange(ini, fin);
}

function seleccionarTextoNodo(div: HTMLElement): Range {
  const textoNodo = div.firstChild;
  if (!textoNodo || textoNodo.nodeType !== Node.TEXT_NODE) throw new Error("sin nodo de texto");
  const rango = document.createRange();
  rango.setStart(textoNodo, 0);
  rango.setEnd(textoNodo, (textoNodo.textContent ?? "").length);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(rango);
  return rango;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
  // Limpia estado de deshacer intentando deshacer lo pendiente.
  while (deshacerUltimo()) {
    // vaciar
  }
});

describe("capturarSeleccionEditable · textarea e input", () => {
  it("captura la selección en un textarea", () => {
    const ta = montarTextarea("hola mundo");
    seleccionarEnElementoTexto(ta, 0, 4);
    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("textarea");
    expect(obj?.texto).toBe("hola");
    expect(obj?.inicio).toBe(0);
    expect(obj?.fin).toBe(4);
    expect(obj?.elemento).toBe(ta);
  });

  it("captura la selección en un input de texto", () => {
    const input = montarInput("hola mundo", "text");
    seleccionarEnElementoTexto(input, 5, 10);
    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("input");
    expect(obj?.texto).toBe("mundo");
  });

  it("rechaza input type=password aunque haya selección", () => {
    const input = montarInput("secreto", "password");
    input.focus();
    input.setSelectionRange(0, 3);
    expect(capturarSeleccionEditable(document)).toBeNull();
  });
});

describe("capturarSeleccionEditable · contenteditable", () => {
  it("captura la selección en un elemento contenteditable", () => {
    const div = montarEditable("hola mundo");
    div.focus();
    seleccionarTextoNodo(div);
    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("contenteditable");
    expect(obj?.texto).toBe("hola mundo");
    expect(obj?.elemento).toBe(div);
  });

  it("devuelve null si no hay selección activa", () => {
    const ta = montarTextarea("hola mundo");
    ta.focus();
    ta.setSelectionRange(2, 2);
    expect(capturarSeleccionEditable(document)).toBeNull();
  });
});

describe("reemplazar", () => {
  it("reemplaza en textarea, dispara input y permite deshacer", () => {
    const ta = montarTextarea("hola mundo");
    seleccionarEnElementoTexto(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    let eventos = 0;
    ta.addEventListener("input", () => { eventos += 1; });
    expect(reemplazar(obj, "adiós")).toBe(true);
    expect(ta.value).toBe("adiós mundo");
    expect(eventos).toBe(1);
    expect(deshacerUltimo()).toBe(true);
    expect(ta.value).toBe("hola mundo");
  });

  it("reemplaza en input de texto y dispara input", () => {
    const input = montarInput("hola mundo", "text");
    seleccionarEnElementoTexto(input, 5, 10);
    const obj = capturarSeleccionEditable(document)!;
    let eventos = 0;
    input.addEventListener("input", () => { eventos += 1; });
    expect(reemplazar(obj, "amigo")).toBe(true);
    expect(input.value).toBe("hola amigo");
    expect(eventos).toBe(1);
  });

  it("reemplaza en contenteditable y permite deshacer", () => {
    const div = montarEditable("hola mundo");
    div.focus();
    seleccionarTextoNodo(div);
    const obj = capturarSeleccionEditable(document)!;
    expect(reemplazar(obj, "adiós")).toBe(true);
    expect(div.textContent).toBe("adiós");
    expect(deshacerUltimo()).toBe(true);
    expect(div.textContent).toBe("hola mundo");
  });

  it("devuelve false si el elemento ya no está en el documento", () => {
    const ta = montarTextarea("hola mundo");
    seleccionarEnElementoTexto(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    ta.remove();
    expect(reemplazar(obj, "adiós")).toBe(false);
  });

  it("devuelve false si el texto cambió desde la captura", () => {
    const ta = montarTextarea("hola mundo");
    seleccionarEnElementoTexto(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    ta.value = "otra cosa";
    expect(reemplazar(obj, "adiós")).toBe(false);
  });

  it("deshacerUltimo devuelve false si no hay nada que deshacer", () => {
    expect(deshacerUltimo()).toBe(false);
  });
});
