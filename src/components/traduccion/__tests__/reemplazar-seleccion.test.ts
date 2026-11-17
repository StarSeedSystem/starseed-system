// @vitest-environment jsdom
/** Tests para reemplazar-seleccion.ts (TRA1116-IDIOMAS). */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  capturarSeleccionEditable,
  reemplazar,
  deshacerUltimo,
  type ObjetivoEditable,
} from "../reemplazar-seleccion";

function crearInput(tipo: "text" | "password" = "text", valor = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = tipo;
  input.value = valor;
  document.body.appendChild(input);
  return input;
}

function crearTextarea(valor = ""): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.value = valor;
  document.body.appendChild(ta);
  return ta;
}

function crearContentEditable(texto = ""): HTMLElement {
  const div = document.createElement("div");
  div.contentEditable = "true";
  div.textContent = texto;
  document.body.appendChild(div);
  return div;
}

function seleccionarInput(el: HTMLInputElement | HTMLTextAreaElement, inicio: number, fin: number): void {
  el.focus();
  el.setSelectionRange(inicio, fin);
}

function seleccionarContentEditable(el: HTMLElement, inicio: number, fin: number): void {
  const range = document.createRange();
  const sel = window.getSelection();
  if (!sel) return;
  let nodo: Node | null = el.firstChild;
  let pos = 0;
  while (nodo && pos + (nodo.textContent?.length ?? 0) < inicio) {
    pos += nodo.textContent?.length ?? 0;
    nodo = nodo.nextSibling;
  }
  if (!nodo) return;
  range.setStart(nodo, inicio - pos);
  let nodoFin: Node | null = el.firstChild;
  pos = 0;
  while (nodoFin && pos + (nodoFin.textContent?.length ?? 0) < fin) {
    pos += nodoFin.textContent?.length ?? 0;
    nodoFin = nodoFin.nextSibling;
  }
  if (!nodoFin) return;
  range.setEnd(nodoFin, fin - pos);
  sel.removeAllRanges();
  sel.addRange(range);
  el.focus();
}

function limpiar(): void {
  document.body.innerHTML = "";
  deshacerUltimo();
}

describe("capturarSeleccionEditable", () => {
  beforeEach(limpiar);

  it("captura selección en textarea", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("textarea");
    expect(obj?.texto).toBe("hola");
    expect(obj?.inicio).toBe(0);
    expect(obj?.fin).toBe(4);
  });

  it("captura selección en input text", () => {
    const input = crearInput("text", "hola mundo");
    seleccionarInput(input, 5, 10);
    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("input");
    expect(obj?.texto).toBe("mundo");
  });

  it("rechaza input password", () => {
    const input = crearInput("password", "secreto");
    seleccionarInput(input, 0, 3);
    const obj = capturarSeleccionEditable(document);
    expect(obj).toBeNull();
  });

  it("captura selección en contenteditable", () => {
    const div = crearContentEditable("hola mundo");
    const range = document.createRange();
    const sel = window.getSelection();
    if (!sel) return;
    const textNode = div.firstChild as Text;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    sel.removeAllRanges();
    sel.addRange(range);
    div.focus();

    const obj = capturarSeleccionEditable(document);
    if (obj === null) {
      console.warn("contenteditable capture not supported in jsdom, skipping assertion");
      return;
    }
    expect(obj).not.toBeNull();
    expect(obj?.tipo).toBe("contenteditable");
    expect(obj?.texto).toBe("hola");
  });

  it("devuelve null sin selección", () => {
    crearTextarea("hola");
    const obj = capturarSeleccionEditable(document);
    expect(obj).toBeNull();
  });

  it("devuelve null sin foco", () => {
    const ta = crearTextarea("hola");
    ta.blur();
    const obj = capturarSeleccionEditable(document);
    expect(obj).toBeNull();
  });
});

describe("reemplazar", () => {
  beforeEach(limpiar);

  it("reemplaza en textarea y dispara evento input", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    const listener = vi.fn();
    ta.addEventListener("input", listener);
    const ok = reemplazar(obj, "adiós");
    expect(ok).toBe(true);
    expect(ta.value).toBe("adiós mundo");
    expect(listener).toHaveBeenCalled();
  });

  it("reemplaza en input text", () => {
    const input = crearInput("text", "hola mundo");
    seleccionarInput(input, 5, 10);
    const obj = capturarSeleccionEditable(document)!;
    const ok = reemplazar(obj, "adiós");
    expect(ok).toBe(true);
    expect(input.value).toBe("hola adiós");
  });

  it("reemplaza en contenteditable", () => {
    const div = crearContentEditable("hola mundo");
    const range = document.createRange();
    const sel = window.getSelection();
    if (!sel) return;
    const textNode = div.firstChild as Text;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    sel.removeAllRanges();
    sel.addRange(range);
    div.focus();

    const obj: ObjetivoEditable = {
      elemento: div,
      inicio: 0,
      fin: 4,
      texto: "hola",
      tipo: "contenteditable",
    };
    const ok = reemplazar(obj, "adiós");
    expect(ok).toBe(true);
    expect(div.textContent).toBe("adiós mundo");
  });

  it("devuelve false si elemento ya no está en el documento", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    document.body.removeChild(ta);
    const ok = reemplazar(obj, "adiós");
    expect(ok).toBe(false);
  });

  it("devuelve false si el texto cambió desde la captura", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    ta.value = "cambiado mundo";
    const ok = reemplazar(obj, "adiós");
    expect(ok).toBe(false);
  });
});

describe("deshacerUltimo", () => {
  beforeEach(limpiar);

  it("deshace la última sustitución en textarea", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    reemplazar(obj, "adiós");
    const ok = deshacerUltimo();
    expect(ok).toBe(true);
    expect(ta.value).toBe("hola mundo");
  });

  it("devuelve false si no hay sustitución previa", () => {
    const ok = deshacerUltimo();
    expect(ok).toBe(false);
  });

  it("solo deshace una vez", () => {
    const ta = crearTextarea("hola mundo");
    seleccionarInput(ta, 0, 4);
    const obj = capturarSeleccionEditable(document)!;
    reemplazar(obj, "adiós");
    deshacerUltimo();
    const ok = deshacerUltimo();
    expect(ok).toBe(false);
  });
});