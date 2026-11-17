import { describe, expect, it } from "vitest";
import {
  capturarSeleccionEditable,
  reemplazar,
  deshacerUltimo,
  type ObjetivoEditable,
} from "../reemplazar-seleccion";

function ctx(doc: Document = document): Document {
  return doc;
}

function seleccionarEnInput(input: HTMLInputElement | HTMLTextAreaElement, inicio: number, fin: number): void {
  input.setSelectionRange(inicio, fin);
  input.focus();
}

function seleccionarEnContenteditable(div: HTMLElement, inicio: number, fin: number): void {
  div.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  // En jsdom, el contenido de contenteditable está en un textNode hijo
  const textNode = div.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, inicio);
    range.setEnd(textNode, fin);
  } else {
    range.setStart(div, inicio);
    range.setEnd(div, fin);
  }
  sel?.removeAllRanges();
  sel?.addRange(range);
}

describe("capturarSeleccionEditable · captura la selección en campos editables", () => {
  it("devuelve null si no hay selección", () => {
    expect(capturarSeleccionEditable(ctx())).toBeNull();
  });

  it("devuelve null en input type=password aunque haya selección", () => {
    const input = document.createElement("input");
    input.type = "password";
    input.value = "secreto";
    document.body.append(input);
    seleccionarEnInput(input, 0, 3);
    expect(capturarSeleccionEditable(ctx())).toBeNull();
    document.body.removeChild(input);
  });

  it("captura selección en textarea", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "texto de prueba";
    document.body.append(textarea);
    // "texto de prueba": "texto"(0-5) " "(5) "de"(6-8) " "(8) "prueba"(9-15)
    seleccionarEnInput(textarea, 6, 8); // "de"
    const objetivo = capturarSeleccionEditable(ctx());
    expect(objetivo).not.toBeNull();
    expect(objetivo?.elemento).toBe(textarea);
    expect(objetivo?.inicio).toBe(6);
    expect(objetivo?.fin).toBe(8);
    expect(objetivo?.texto).toBe("de");
    document.body.removeChild(textarea);
  });

  it("captura selección en input type=text", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hola mundo";
    document.body.append(input);
    seleccionarEnInput(input, 0, 4); // "hola"
    const objetivo = capturarSeleccionEditable(ctx());
    expect(objetivo).not.toBeNull();
    expect(objetivo?.elemento).toBe(input);
    expect(objetivo?.inicio).toBe(0);
    expect(objetivo?.fin).toBe(4);
    expect(objetivo?.texto).toBe("hola");
    document.body.removeChild(input);
  });

  it("captura selección en contenteditable", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.textContent = "contenido editable";
    document.body.append(div);
    // Forzar creación del textNode
    const _ = div.firstChild;
    seleccionarEnContenteditable(div, 0, 9); // "contenido"
    const objetivo = capturarSeleccionEditable(ctx());
    expect(objetivo).not.toBeNull();
    expect(objetivo?.elemento).toBe(div);
    expect(objetivo?.inicio).toBe(0);
    expect(objetivo?.fin).toBe(9);
    expect(objetivo?.texto).toBe("contenido");
    document.body.removeChild(div);
  });

  it("devuelve null si el foco no está en un elemento editable", () => {
    const p = document.createElement("p");
    p.textContent = "no editable";
    document.body.append(p);
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(p);
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(capturarSeleccionEditable(ctx())).toBeNull();
    document.body.removeChild(p);
  });
});

describe("reemplazar · sustituye el texto capturado", () => {
  it("devuelve false si el elemento ya no está en el documento", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "original";
    document.body.append(input);
    seleccionarEnInput(input, 0, 8);
    const objetivo = capturarSeleccionEditable(ctx())!;
    document.body.removeChild(input);
    expect(reemplazar(objetivo, "nuevo")).toBe(false);
  });

  it("devuelve false si el texto cambió desde la captura", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "original";
    document.body.append(input);
    seleccionarEnInput(input, 0, 8);
    const objetivo = capturarSeleccionEditable(ctx())!;
    input.value = "cambiado"; // texto cambió externamente
    expect(reemplazar(objetivo, "nuevo")).toBe(false);
    document.body.removeChild(input);
  });

  it("reemplaza en textarea con setRangeText y dispara evento input", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "texto de prueba";
    document.body.append(textarea);
    seleccionarEnInput(textarea, 6, 8); // "de"
    const objetivo = capturarSeleccionEditable(ctx())!;
    const eventos: string[] = [];
    textarea.addEventListener("input", () => eventos.push("input"));
    const ok = reemplazar(objetivo, "NUEVO");
    expect(ok).toBe(true);
    expect(textarea.value).toBe("texto NUEVO prueba");
    expect(eventos).toContain("input");
    document.body.removeChild(textarea);
  });

  it("reemplaza en input type=text con setRangeText y dispara evento input", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hola mundo";
    document.body.append(input);
    seleccionarEnInput(input, 0, 4); // "hola"
    const objetivo = capturarSeleccionEditable(ctx())!;
    const eventos: string[] = [];
    input.addEventListener("input", () => eventos.push("input"));
    const ok = reemplazar(objetivo, "adiós");
    expect(ok).toBe(true);
    expect(input.value).toBe("adiós mundo");
    expect(eventos).toContain("input");
    document.body.removeChild(input);
  });

  it("reemplaza en contenteditable con Range.deleteContents + insertNode", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.textContent = "contenido editable";
    document.body.append(div);
    const _ = div.firstChild;
    seleccionarEnContenteditable(div, 0, 9); // "contenido"
    const objetivo = capturarSeleccionEditable(ctx())!;
    const ok = reemplazar(objetivo, "NUEVO");
    expect(ok).toBe(true);
    expect(div.textContent).toBe("NUEVO editable");
    document.body.removeChild(div);
  });
});

describe("deshacerUltimo · revierte la última sustitución", () => {
  it("devuelve false si no hay nada que deshacer", () => {
    expect(deshacerUltimo()).toBe(false);
  });

  it("restaura el texto anterior en textarea", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "texto original";
    document.body.append(textarea);
    seleccionarEnInput(textarea, 0, 5); // "texto"
    const objetivo = capturarSeleccionEditable(ctx())!;
    reemplazar(objetivo, "NUEVO");
    expect(textarea.value).toBe("NUEVO original");
    const ok = deshacerUltimo();
    expect(ok).toBe(true);
    expect(textarea.value).toBe("texto original");
    document.body.removeChild(textarea);
  });

  it("restaura el texto anterior en input", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "hola mundo";
    document.body.append(input);
    seleccionarEnInput(input, 0, 4); // "hola"
    const objetivo = capturarSeleccionEditable(ctx())!;
    reemplazar(objetivo, "adiós");
    expect(input.value).toBe("adiós mundo");
    const ok = deshacerUltimo();
    expect(ok).toBe(true);
    expect(input.value).toBe("hola mundo");
    document.body.removeChild(input);
  });

  it("restaura el texto anterior en contenteditable", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.textContent = "contenido editable";
    document.body.append(div);
    const _ = div.firstChild;
    seleccionarEnContenteditable(div, 0, 9); // "contenido"
    const objetivo = capturarSeleccionEditable(ctx())!;
    reemplazar(objetivo, "NUEVO");
    expect(div.textContent).toBe("NUEVO editable");
    const ok = deshacerUltimo();
    expect(ok).toBe(true);
    expect(div.textContent).toBe("contenido editable");
    document.body.removeChild(div);
  });

  it("solo deshace una sustitución (la última)", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "uno";
    document.body.append(input);
    seleccionarEnInput(input, 0, 3);
    let objetivo = capturarSeleccionEditable(ctx())!;
    reemplazar(objetivo, "dos");
    expect(input.value).toBe("dos");
    seleccionarEnInput(input, 0, 3);
    objetivo = capturarSeleccionEditable(ctx())!;
    reemplazar(objetivo, "tres");
    expect(input.value).toBe("tres");
    deshacerUltimo();
    expect(input.value).toBe("dos"); // solo deshace la última
    document.body.removeChild(input);
  });
});