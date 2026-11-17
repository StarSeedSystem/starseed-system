/** Contrato A3 (TRA1116A · IMA19): capturar una selección editable y sustituirla por su
 * traducción. Puro, sin red ni `node:*`; el Document llega por parámetro. Nunca en
 * `input type=password` (fuera de TIPOS_TEXTO). Probado en jsdom. */

export interface ObjetivoEditable {
  elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  inicio: number;
  fin: number;
  texto: string;
}

/** Tipos de `input` con selección de texto según la spec: password y email quedan fuera. */
const TIPOS_TEXTO = new Set(["text", "search", "url", "tel"]);

/** Texto ANTERIOR completo de la última sustitución (un solo nivel de deshacer). */
let ultimoDeshacer: { elemento: HTMLElement; texto: string } | null = null;

/** contenteditable por atributo propio o heredado (jsdom no implementa isContentEditable). */
function esContenidoEditable(el: Element): boolean {
  const editable = el.hasAttribute("contenteditable") ? el : el.closest("[contenteditable]");
  const valor = editable ? (editable.getAttribute("contenteditable") || "").trim().toLowerCase() : null;
  return valor === "" || valor === "true" || valor === "plaintext-only";
}

function esCampoDeTexto(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement
    || (el instanceof HTMLInputElement && TIPOS_TEXTO.has((el.type || "text").toLowerCase()));
}

/** Pasa de offsets de nodo (Range) a offsets de texto del elemento. */
function offsetsDeRango(el: HTMLElement, rango: Range): { inicio: number; fin: number } | null {
  let inicio = -1, fin = -1, suma = 0;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let nodo = walker.nextNode(); nodo; nodo = walker.nextNode()) {
    if (inicio < 0 && nodo === rango.startContainer) inicio = suma + rango.startOffset;
    if (fin < 0 && nodo === rango.endContainer) fin = suma + rango.endOffset;
    if (inicio >= 0 && fin >= 0) return { inicio, fin };
    suma += (nodo as Text).length;
  }
  return null;
}

/** Texto actual de `el` entre los offsets dados y el rango reconstruido. */
function reconstruir(doc: Document, el: HTMLElement, inicio: number, fin: number):
  { texto: string; rango: Range } | null {
  let piezas = "", suma = 0;
  let rango: Range | null = null;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let nodo = walker.nextNode(); nodo; nodo = walker.nextNode()) {
    const texto = (nodo as Text).data;
    const finNodo = suma + texto.length;
    if (fin > suma && inicio < finNodo) piezas += texto.slice(Math.max(0, inicio - suma), fin - suma);
    if (rango === null && inicio >= suma && inicio <= finNodo) {
      rango = doc.createRange();
      rango.setStart(nodo, Math.min(inicio - suma, texto.length));
    }
    if (rango !== null && fin >= suma && fin <= finNodo) {
      rango.setEnd(nodo, Math.min(fin - suma, texto.length));
      return { texto: piezas, rango };
    }
    suma = finNodo;
  }
  return null;
}

/** Captura la selección del campo con el foco en `doc`; `null` si no hay campo apto. */
export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const foco = doc.activeElement;
  if (!(foco instanceof HTMLElement)) return null;
  if (esCampoDeTexto(foco)) {
    const inicio = foco.selectionStart;
    const fin = foco.selectionEnd;
    if (inicio === null || fin === null || inicio >= fin) return null;
    const texto = foco.value.slice(inicio, fin);
    return texto.length > 0 ? { elemento: foco, inicio, fin, texto } : null;
  }
  if (!esContenidoEditable(foco)) return null;
  const seleccion = doc.getSelection();
  if (!seleccion || seleccion.rangeCount === 0) return null;
  const rango = seleccion.getRangeAt(0);
  if (rango.collapsed || !foco.contains(rango.startContainer)) return null;
  const texto = rango.toString();
  const offsets = texto.length > 0 ? offsetsDeRango(foco, rango) : null;
  return offsets ? { elemento: foco, ...offsets, texto } : null;
}

/** Sustituye el texto capturado; `false` si el elemento salió del documento, es de clave,
 * no es editable o el texto cambió desde la captura. En `input`/`textarea` usa `setRangeText`
 * y lanza un evento `input` burbujeante (React lo ve); en `contenteditable` usa
 * `Range.deleteContents` + `insertNode`. */
export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const el = objetivo.elemento;
  if (!el.isConnected) return false;
  if (esCampoDeTexto(el)) {
    if (el.value.slice(objetivo.inicio, objetivo.fin) !== objetivo.texto) return false;
    const textoAnterior = el.value;
    el.setRangeText(nuevoTexto, objetivo.inicio, objetivo.fin, "preserve");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    ultimoDeshacer = { elemento: el, texto: textoAnterior };
    return true;
  }
  if (!esContenidoEditable(el)) return false;
  const actual = reconstruir(el.ownerDocument, el, objetivo.inicio, objetivo.fin);
  if (!actual || actual.texto !== objetivo.texto) return false;
  const textoAnterior = el.textContent ?? "";
  actual.rango.deleteContents();
  actual.rango.insertNode(el.ownerDocument.createTextNode(nuevoTexto));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  ultimoDeshacer = { elemento: el, texto: textoAnterior };
  return true;
}

/** Restaura el texto anterior de la ÚLTIMA sustitución (un solo nivel). */
export function deshacerUltimo(): boolean {
  const guardado = ultimoDeshacer;
  if (!guardado) return false;
  ultimoDeshacer = null;
  if (!guardado.elemento.isConnected) return false;
  if (esCampoDeTexto(guardado.elemento)) {
    guardado.elemento.value = guardado.texto;
    guardado.elemento.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (!esContenidoEditable(guardado.elemento)) return false;
  guardado.elemento.textContent = guardado.texto;
  return true;
}
