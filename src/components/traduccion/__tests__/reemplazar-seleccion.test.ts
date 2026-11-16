import { describe, it, expect, beforeEach } from "vitest";
import {
  capturarSeleccionEditable,
  reemplazar,
  deshacerUltimo,
  type ObjetivoEditable,
} from "../reemplazar-seleccion";

describe("reemplazar-seleccion", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("captura selección en textarea", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hola mundo de StarSeed";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 10);

    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.elemento).toBe(textarea);
    expect(obj?.inicio).toBe(5);
    expect(obj?.fin).toBe(10);
    expect(obj?.textoSeleccionado).toBe("mundo");
  });

  it("captura selección en input de texto (rechaza password)", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "Texto editable";
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(0, 5);

    const obj = capturarSeleccionEditable(document);
    expect(obj?.textoSeleccionado).toBe("Texto");

    const pwd = document.createElement("input");
    pwd.type = "password";
    pwd.value = "secreto";
    document.body.appendChild(pwd);
    pwd.focus();
    pwd.setSelectionRange(0, 7);

    const objPwd = capturarSeleccionEditable(document);
    expect(objPwd).toBeNull();
  });

  it("captura selección en contenteditable", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.textContent = "Contenido enriquecido";
    document.body.appendChild(div);

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(div.firstChild!, 10);
    range.setEnd(div.firstChild!, 20);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const obj = capturarSeleccionEditable(document);
    expect(obj).not.toBeNull();
    expect(obj?.elemento).toBe(div);
    expect(obj?.textoSeleccionado).toBe("enriqueci");
  });

  it("reemplaza en textarea y emite evento input", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hola mundo";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 10);

    let eventoInputDisparado = false;
    textarea.addEventListener("input", () => {
      eventoInputDisparado = true;
    });

    const obj = capturarSeleccionEditable(document)!;
    const exito = reemplazar(obj, "planeta");
    expect(exito).toBe(true);
    expect(textarea.value).toBe("Hola planeta");
    expect(eventoInputDisparado).toBe(true);
  });

  it("devuelve false si el elemento ya no está en el documento", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hola mundo";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 10);

    const obj = capturarSeleccionEditable(document)!;
    textarea.remove();

    const exito = reemplazar(obj, "planeta");
    expect(exito).toBe(false);
  });

  it("devuelve false si el texto cambió desde la captura", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hola mundo";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 10);

    const obj = capturarSeleccionEditable(document)!;
    textarea.value = "Hola otro mundo"; // cambia texto antes de reemplazar

    const exito = reemplazar(obj, "planeta");
    expect(exito).toBe(false);
  });

  it("permite deshacer el último reemplazo", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "Hola mundo";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 10);

    const obj = capturarSeleccionEditable(document)!;
    reemplazar(obj, "planeta");
    expect(textarea.value).toBe("Hola planeta");

    const deshecho = deshacerUltimo();
    expect(deshecho).toBe(true);
    expect(textarea.value).toBe("Hola mundo");
  });
});
