/**
 * Reemplazo de la selección editable por su traducción (Ola IMA19 · TRA1116).
 * `capturarSeleccionEditable` guarda el foco con texto seleccionado (input de texto,
 * textarea o contenteditable; nunca un input `type="password"`); `reemplazar` sustituye
 * esa selección y avisa con un evento `input` para que React y los formularios lo vean;
 * `deshacerUltimo` devuelve UNA sustitución a su texto anterior. Puro: sin red ni `node:*`.
 */

export type ElementoEditable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** Selección capturada: elemento, tramo marcado y texto que había en él. */
export interface ObjetivoEditable { elemento: ElementoEditable; inicio: number; fin: number; texto: string }
interface Captura { valorCompleto: string; rango: Range | null }
interface Deshacer { elemento: ElementoEditable; anterior: string; inicio: number; largo: number; rango: Range | null }

const CAPTURAS = new WeakMap<ObjetivoEditable, Captura>();
const TIPOS_TEXTO = new Set(["text", "search", "url", "tel"]);
let ULTIMA: Deshacer | null = null;

function entradaDeTexto(el: Element): HTMLInputElement | HTMLTextAreaElement | null {
  if (el.tagName === "TEXTAREA") return el as HTMLTextAreaElement;
  if (el.tagName !== "INPUT") return null;
  const entrada = el as HTMLInputElement;
  return entrada.type !== "password" && TIPOS_TEXTO.has(entrada.type) ? entrada : null;
}

function esEntrada(el: ElementoEditable): el is HTMLInputElement | HTMLTextAreaElement {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
}

const valorCompleto = (el: ElementoEditable): string => (esEntrada(el) ? el.value : (el.textContent ?? ""));

/** Host editable más cercano al foco; `contenteditable="false"` no cuenta. */
function hostEditable(el: Element | null): HTMLElement | null {
  const host = el?.closest("[contenteditable]");
  const modo = (host?.getAttribute("contenteditable") ?? "").toLowerCase();
  return host && modo !== "false" ? (host as HTMLElement) : null;
}

/** Elemento del nodo (el propio nodo si ya es elemento, si no su padre). */
function elementoDe(nodo: Node | null): Element | null {
  if (!nodo) return null;
  return nodo.nodeType === 1 ? (nodo as Element) : nodo.parentElement;
}

/** Caracteres desde el inicio del host hasta la posición dada. */
function longitudHasta(host: Element, nodo: Node | null, offset: number): number {
  if (!nodo) return 0;
  const rango = host.ownerDocument.createRange();
  rango.selectNodeContents(host);
  try { rango.setEnd(nodo, offset); } catch { /* nodo fuera del host: se mide lo posible */ }
  return rango.toString().length;
}

export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const activo = doc.activeElement;
  if (!activo) return null;
  const entrada = entradaDeTexto(activo);
  if (entrada) {
    const inicio = entrada.selectionStart;
    const fin = entrada.selectionEnd;
    if (inicio === null || fin === null || fin <= inicio) return null;
    const objetivo: ObjetivoEditable = { elemento: entrada, inicio, fin, texto: entrada.value.slice(inicio, fin) };
    CAPTURAS.set(objetivo, { valorCompleto: entrada.value, rango: null });
    return objetivo;
  }
  const seleccion = doc.getSelection();
  const host = hostEditable(activo) ?? hostEditable(elementoDe(seleccion?.anchorNode ?? null));
  if (!host || !seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) return null;
  const texto = seleccion.toString();
  const dentro = (n: Node | null) => n !== null && (n === host || host.contains(n));
  if (!texto || !dentro(seleccion.anchorNode) || !dentro(seleccion.focusNode)) return null;
  const rango = seleccion.getRangeAt(0).cloneRange();
  const objetivo: ObjetivoEditable = {
    elemento: host,
    inicio: longitudHasta(host, rango.startContainer, rango.startOffset),
    fin: longitudHasta(host, rango.endContainer, rango.endOffset),
    texto,
  };
  CAPTURAS.set(objetivo, { valorCompleto: host.textContent ?? "", rango });
  return objetivo;
}

const avisar = (el: ElementoEditable): void => { el.dispatchEvent(new Event("input", { bubbles: true })); };

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const captura = CAPTURAS.get(objetivo);
  const el = objetivo.elemento;
  if (!captura || !el.isConnected || !el.ownerDocument.contains(el)) return false;
  if (valorCompleto(el) !== captura.valorCompleto) return false;
  if (esEntrada(el)) {
    el.setRangeText(nuevoTexto, objetivo.inicio, objetivo.fin, "end");
    ULTIMA = { elemento: el, anterior: objetivo.texto, inicio: objetivo.inicio, largo: nuevoTexto.length, rango: null };
    avisar(el);
    return true;
  }
  const rango = captura.rango;
  if (!rango || !rango.startContainer.isConnected || !rango.endContainer.isConnected) return false;
  rango.deleteContents();
  const nodo = el.ownerDocument.createTextNode(nuevoTexto);
  rango.insertNode(nodo);
  const insertado = el.ownerDocument.createRange();
  insertado.selectNodeContents(nodo);
  ULTIMA = { elemento: el, anterior: objetivo.texto, inicio: objetivo.inicio, largo: nuevoTexto.length, rango: insertado };
  avisar(el);
  return true;
}

export function deshacerUltimo(): boolean {
  const ultima = ULTIMA;
  ULTIMA = null;
  const el = ultima?.elemento;
  if (!ultima || !el || !el.isConnected || !el.ownerDocument.contains(el)) return false;
  if (esEntrada(el)) {
    el.setRangeText(ultima.anterior, ultima.inicio, ultima.inicio + ultima.largo, "end");
    avisar(el);
    return true;
  }
  const rango = ultima.rango;
  if (!rango || !rango.startContainer.isConnected) return false;
  rango.deleteContents();
  rango.insertNode(el.ownerDocument.createTextNode(ultima.anterior));
  avisar(el);
  return true;
}
