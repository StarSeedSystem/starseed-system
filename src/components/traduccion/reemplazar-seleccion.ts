/** Reemplazar la selección editable por su traducción (TRA1116-IDIOMAS).
 *  Módulo puro para input, textarea y contenteditable; sin red. */

export interface ObjetivoEditable {
  readonly elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  readonly inicio: number;
  readonly fin: number;
  readonly texto: string;
  readonly tipo: "input" | "textarea" | "contenteditable";
}

let ultimaSustitucion: { objetivo: ObjetivoEditable; textoAnterior: string } | null = null;

function esInputPassword(el: Element): boolean {
  return el.tagName === "INPUT" && (el as HTMLInputElement).type === "password";
}

function obtenerSeleccionInputTextarea(
  el: HTMLInputElement | HTMLTextAreaElement,
): { inicio: number; fin: number; texto: string } | null {
  const inicio = el.selectionStart;
  const fin = el.selectionEnd;
  if (inicio === null || fin === null || inicio === fin) return null;
  return { inicio, fin, texto: el.value.slice(inicio, fin) };
}

function obtenerSeleccionContentEditable(
  el: HTMLElement,
): { inicio: number; fin: number; texto: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;
  const texto = range.toString();
  if (!texto) return null;
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(el);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  const inicio = preCaretRange.toString().length;
  return { inicio, fin: inicio + texto.length, texto };
}

export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const activo = doc.activeElement;
  if (!activo) return null;
  if (esInputPassword(activo)) return null;

  if (activo.tagName === "INPUT" || activo.tagName === "TEXTAREA") {
    const el = activo as HTMLInputElement | HTMLTextAreaElement;
    const sel = obtenerSeleccionInputTextarea(el);
    if (!sel) return null;
    return {
      elemento: el,
      inicio: sel.inicio,
      fin: sel.fin,
      texto: sel.texto,
      tipo: activo.tagName === "INPUT" ? "input" : "textarea",
    };
  }

  if (activo.isContentEditable) {
    const el = activo as HTMLElement;
    const sel = obtenerSeleccionContentEditable(el);
    if (!sel) return null;
    return {
      elemento: el,
      inicio: sel.inicio,
      fin: sel.fin,
      texto: sel.texto,
      tipo: "contenteditable",
    };
  }

  return null;
}

function elementoEnDocumento(el: Element): boolean {
  return document.body.contains(el) || el === document.body;
}

function dispararEventoInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
}

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const { elemento, inicio, fin, texto, tipo } = objetivo;

  if (!elementoEnDocumento(elemento)) return false;

  if (tipo === "input" || tipo === "textarea") {
    const el = elemento as HTMLInputElement | HTMLTextAreaElement;
    if (el.value.slice(inicio, fin) !== texto) return false;
    el.setRangeText(nuevoTexto, inicio, fin, "end");
    dispararEventoInput(el);
    ultimaSustitucion = { objetivo, textoAnterior: texto };
    return true;
  }

  if (tipo === "contenteditable") {
    const el = elemento as HTMLElement;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return false;
    const textoActual = range.toString();
    if (textoActual !== texto) return false;
    range.deleteContents();
    const textoNode = document.createTextNode(nuevoTexto);
    range.insertNode(textoNode);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    ultimaSustitucion = { objetivo, textoAnterior: texto };
    return true;
  }

  return false;
}

export function deshacerUltimo(): boolean {
  if (!ultimaSustitucion) return false;
  const { objetivo, textoAnterior } = ultimaSustitucion;
  const ok = reemplazar(objetivo, textoAnterior);
  if (ok) ultimaSustitucion = null;
  return ok;
}