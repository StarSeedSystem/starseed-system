/** Reemplazar la selección editable por su traducción (Ola IMA19 · TRA1116).
 * Navegador puro: sin red ni `node:*`; un fallo se dice con `false`, no se lanza. */
export type ElementoEditable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
/** Lo capturado: el elemento, los desplazamientos en su texto y el texto elegido. */
export interface ObjetivoEditable {
  readonly elemento: ElementoEditable;
  readonly inicio: number; readonly fin: number; readonly texto: string;
}
interface UltimaSustitucion {
  readonly elemento: ElementoEditable; readonly anterior: string; readonly esCampo: boolean;
}
/** Solo la ÚLTIMA sustitución se puede deshacer. */
let ultima: UltimaSustitucion | null = null;
const TIPOS_TEXTO = ["text", "search", "url", "tel", "email"];
const SELECTOR_EDITABLE =
  '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
function esCampo(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
}
function textoDe(el: ElementoEditable): string {
  return esCampo(el) ? el.value : el.textContent ?? "";
}
/** Posición del nodo/offset dentro del texto completo del anfitrión. */
function desplazamiento(host: HTMLElement, nodo: Node, offset: number): number {
  const rango = host.ownerDocument.createRange();
  rango.selectNodeContents(host);
  rango.setEnd(nodo, offset);
  return rango.toString().length;
}
/** El `contenteditable` que contiene el nodo (o él mismo si ya lo es). */
function hostEditable(nodo: Node): HTMLElement | null {
  const el = nodo.nodeType === 3 ? nodo.parentElement : (nodo as Element);
  return el?.closest<HTMLElement>(SELECTOR_EDITABLE) ?? null;
}
function emitirInput(el: ElementoEditable): void {
  const vista = el.ownerDocument.defaultView;
  const evento = vista && typeof vista.InputEvent === "function"
    ? new vista.InputEvent("input", { bubbles: true })
    : new Event("input", { bubbles: true });
  el.dispatchEvent(evento);
}
/** Captura la selección viva; `null` si no es editable o no hay texto. */
export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const activo = doc.activeElement;
  if (activo && esCampo(activo)) {
    if (activo.tagName === "INPUT" && !TIPOS_TEXTO.includes((activo as HTMLInputElement).type)) {
      return null;
    }
    const inicio = activo.selectionStart;
    const fin = activo.selectionEnd;
    if (inicio === null || fin === null || fin <= inicio) return null;
    return { elemento: activo, inicio, fin, texto: activo.value.slice(inicio, fin) };
  }
  const seleccion = doc.getSelection();
  if (!seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) return null;
  const rango = seleccion.getRangeAt(0);
  const host = hostEditable(rango.commonAncestorContainer);
  if (!host || !activo || !host.contains(activo)) return null;
  const inicio = desplazamiento(host, rango.startContainer, rango.startOffset);
  const fin = desplazamiento(host, rango.endContainer, rango.endOffset);
  const texto = (host.textContent ?? "").slice(inicio, fin);
  if (fin <= inicio || texto.length === 0) return null;
  return { elemento: host, inicio, fin, texto };
}
/** Reconstruye un rango entre dos desplazamientos de texto, o `null` si no caben. */
function rangoDeDesplazamientos(doc: Document, host: Node, inicio: number, fin: number): Range | null {
  const rango = doc.createRange();
  const caminante = doc.createTreeWalker(host, 4); // SHOW_TEXT
  let visto = 0;
  let abierto = false;
  let nodo = caminante.nextNode();
  while (nodo) {
    const siguiente = visto + (nodo.textContent ?? "").length;
    if (!abierto && inicio <= siguiente) {
      rango.setStart(nodo, Math.max(0, inicio - visto));
      abierto = true;
    }
    if (abierto && fin <= siguiente) {
      rango.setEnd(nodo, Math.max(0, fin - visto));
      return rango;
    }
    visto = siguiente;
    nodo = caminante.nextNode();
  }
  return null;
}
/** Sustituye lo capturado; `false` si ya no está en el documento o el texto cambió. */
export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const { elemento, inicio, fin, texto } = objetivo;
  if (!elemento.isConnected) return false;
  const actual = textoDe(elemento);
  if (actual.slice(inicio, fin) !== texto) return false;
  if (esCampo(elemento)) {
    elemento.setRangeText(nuevoTexto, inicio, fin, "end");
    ultima = { elemento, anterior: actual, esCampo: true };
    emitirInput(elemento);
    return true;
  }
  const rango = rangoDeDesplazamientos(elemento.ownerDocument, elemento, inicio, fin);
  if (!rango) return false;
  ultima = { elemento, anterior: elemento.innerHTML, esCampo: false };
  rango.deleteContents();
  rango.insertNode(elemento.ownerDocument.createTextNode(nuevoTexto));
  elemento.normalize();
  emitirInput(elemento);
  return true;
}
/** Devuelve el texto anterior de la última sustitución. Consume el deshacer. */
export function deshacerUltimo(): boolean {
  const guardada = ultima;
  ultima = null;
  if (!guardada || !guardada.elemento.isConnected) return false;
  if (guardada.esCampo) {
    (guardada.elemento as HTMLInputElement | HTMLTextAreaElement).value = guardada.anterior;
  } else {
    guardada.elemento.innerHTML = guardada.anterior;
  }
  emitirInput(guardada.elemento);
  return true;
}
