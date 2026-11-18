/**
 * Reemplazar la selección editable por su traducción (Ola IMA19 · TRA1116-IDIOMAS).
 * Captura la selección de un input de texto, textarea o contenteditable, la sustituye
 * avisando con un evento `input` (React y formularios lo ven) y deshace UNA sustitución.
 * Sin red ni `node:*`: el DOM entra por parámetro o es el del propio elemento.
 */

/** Selección capturada: posiciones sobre `value` (campo) o sobre el texto (editable). */
export interface ObjetivoEditable {
  readonly elemento: HTMLElement; readonly tipo: "campo" | "editable";
  readonly inicio: number; readonly fin: number; readonly texto: string;
}

interface Sustitucion {
  readonly elemento: HTMLElement; readonly tipo: "campo" | "editable"; readonly anterior: string;
}

let ultima: Sustitucion | null = null;

/** Un campo de formulario con selección de texto; `password` nunca entra. */
function campoDeTexto(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "password");
}

/** El propio elemento editable o el ancestro contenteditable más cercano. */
function elementoEditable(activo: Element): HTMLElement | null {
  if (!(activo instanceof HTMLElement)) return null;
  const el = activo.hasAttribute("contenteditable") ? activo : activo.closest("[contenteditable]");
  if (!(el instanceof HTMLElement)) return null;
  return (el.getAttribute("contenteditable") ?? "").toLowerCase() === "false" ? null : el;
}

function avisarEntrada(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function longitudHasta(doc: Document, raiz: HTMLElement, nodo: Node, offset: number): number {
  const rango = doc.createRange();
  rango.setStart(raiz, 0);
  rango.setEnd(nodo, offset);
  return rango.toString().length;
}

/** Punto del texto (nodo y desplazamiento) que cae en una posición absoluta de la raíz. */
function puntoEn(raiz: HTMLElement, desplazamiento: number): { nodo: Text; offset: number } | null {
  let resto = desplazamiento;
  let ultimo: Text | null = null;
  const recorrido = raiz.ownerDocument!.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (recorrido.nextNode()) {
    const nodo = recorrido.currentNode as Text;
    ultimo = nodo;
    if (resto <= nodo.data.length) return { nodo, offset: resto };
    resto -= nodo.data.length;
  }
  return ultimo ? { nodo: ultimo, offset: ultimo.data.length } : null;
}

export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const activo = doc.activeElement; if (!activo || (activo instanceof HTMLInputElement && activo.type === "password")) return null;
  if (campoDeTexto(activo)) {
    const inicio = activo.selectionStart;
    const fin = activo.selectionEnd;
    if (inicio === null || fin === null || inicio === fin) return null;
    const desde = Math.min(inicio, fin);
    const hasta = Math.max(inicio, fin);
    const texto = activo.value.slice(desde, hasta);
    return texto ? { elemento: activo, tipo: "campo", inicio: desde, fin: hasta, texto } : null;
  }
  const el = elementoEditable(activo);
  if (!el) return null;
  const seleccion = doc.getSelection();
  if (!seleccion || seleccion.rangeCount === 0) return null;
  const rango = seleccion.getRangeAt(0);
  if (!el.contains(rango.startContainer) || !el.contains(rango.endContainer)) return null;
  const a = longitudHasta(doc, el, rango.startContainer, rango.startOffset);
  const b = longitudHasta(doc, el, rango.endContainer, rango.endOffset);
  const texto = rango.toString();
  return a !== b && texto
    ? { elemento: el, tipo: "editable", inicio: Math.min(a, b), fin: Math.max(a, b), texto }
    : null;
}

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const el = objetivo.elemento;
  if (!el.isConnected) return false;
  if (objetivo.tipo === "campo") {
    if (!campoDeTexto(el)) return false;
    if (el.value.slice(objetivo.inicio, objetivo.fin) !== objetivo.texto) return false;
    const anterior = el.value;
    el.setRangeText(nuevoTexto, objetivo.inicio, objetivo.fin, "end");
    ultima = { elemento: el, tipo: "campo", anterior };
    avisarEntrada(el);
    return true;
  }
  if ((el.textContent ?? "").slice(objetivo.inicio, objetivo.fin) !== objetivo.texto) return false;
  const inicio = puntoEn(el, objetivo.inicio), fin = puntoEn(el, objetivo.fin);
  if (!inicio || !fin) return false;
  const rango = el.ownerDocument!.createRange();
  rango.setStart(inicio.nodo, inicio.offset);
  rango.setEnd(fin.nodo, fin.offset);
  const anterior = el.innerHTML;
  rango.deleteContents();
  rango.insertNode(el.ownerDocument!.createTextNode(nuevoTexto));
  ultima = { elemento: el, tipo: "editable", anterior };
  avisarEntrada(el);
  return true;
}

export function deshacerUltimo(): boolean {
  const sustitucion = ultima;
  ultima = null;
  if (!sustitucion || !sustitucion.elemento.isConnected) return false;
  const el = sustitucion.elemento;
  if (sustitucion.tipo === "campo") {
    if (!campoDeTexto(el)) return false;
    el.value = sustitucion.anterior;
  } else el.innerHTML = sustitucion.anterior;
  avisarEntrada(el);
  return true;
}
