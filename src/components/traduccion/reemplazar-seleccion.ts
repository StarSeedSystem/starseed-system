/** Utilidades puras para capturar, reemplazar y deshacer texto seleccionado
 * en campos editables (input de texto, textarea y contenteditable).
 * Sin red ni acceso a disco; opera sobre los nodos que recibe. */

export type TipoObjetivoEditable = "input" | "textarea" | "contenteditable";

export interface ObjetivoEditable {
  elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  tipo: TipoObjetivoEditable;
  inicio: number;
  fin: number;
  texto: string;
}

interface EstadoDeshacer {
  elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  tipo: TipoObjetivoEditable;
  inicio: number;
  fin: number;
  anterior: string;
  nodoInsertado?: Text;
  longitudNuevo?: number;
}

let ultimoDeshacer: EstadoDeshacer | null = null;

function esInputTexto(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type === "password") return false;
  // Los inputs de texto aceptan selección; otros tipos (checkbox, number en algunos casos) no.
  return typeof el.selectionStart === "number" && typeof el.selectionEnd === "number";
}

function esTextarea(el: Element): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement;
}

function estaEnDocumento(doc: Document, el: Node): boolean {
  return doc.contains(el);
}

export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const activo = doc.activeElement;
  if (!activo) return null;

  if (esTextarea(activo) || esInputTexto(activo)) {
    const inicio = activo.selectionStart ?? 0;
    const fin = activo.selectionEnd ?? 0;
    if (fin <= inicio) return null;
    const texto = activo.value.slice(inicio, fin);
    if (!texto) return null;
    const tipo: TipoObjetivoEditable = esTextarea(activo) ? "textarea" : "input";
    return { elemento: activo, tipo, inicio, fin, texto };
  }

  const sel = doc.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const rango = sel.getRangeAt(0);
    const ancestro = rango.commonAncestorContainer;
    const contenedor =
      ancestro.nodeType === Node.ELEMENT_NODE
        ? (ancestro as Element).closest("[contenteditable='true'], [contenteditable='']")
        : ancestro.parentElement?.closest("[contenteditable='true'], [contenteditable='']");
    if (contenedor instanceof HTMLElement && contenedor.isContentEditable) {
      const texto = sel.toString();
      if (texto) {
        return { elemento: contenedor, tipo: "contenteditable", inicio: 0, fin: 0, texto };
      }
    }
  }

  return null;
}

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const doc = objetivo.elemento.ownerDocument;
  if (!doc || !estaEnDocumento(doc, objetivo.elemento)) return false;

  if (objetivo.tipo === "input" || objetivo.tipo === "textarea") {
    const el = objetivo.elemento as HTMLInputElement | HTMLTextAreaElement;
    if (esInputTexto(el) === false && !esTextarea(el)) return false;
    const actual = el.value.slice(objetivo.inicio, objetivo.fin);
    if (actual !== objetivo.texto) return false;
    const anterior = objetivo.texto;
    el.focus();
    el.setSelectionRange(objetivo.inicio, objetivo.fin);
    el.setRangeText(nuevoTexto, objetivo.inicio, objetivo.fin, "end");
    // Dispara evento input para que React/formularios detecten el cambio.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    ultimoDeshacer = {
      elemento: el,
      tipo: objetivo.tipo,
      inicio: objetivo.inicio,
      fin: objetivo.inicio + nuevoTexto.length,
      anterior,
    };
    return true;
  }

  if (objetivo.tipo === "contenteditable") {
    const el = objetivo.elemento as HTMLElement;
    if (!el.isContentEditable) return false;
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const rango = sel.getRangeAt(0);
    if (!el.contains(rango.commonAncestorContainer)) return false;
    const actual = sel.toString();
    if (actual !== objetivo.texto) return false;
    const anterior = objetivo.texto;
    rango.deleteContents();
    const nodoTexto = doc.createTextNode(nuevoTexto);
    rango.insertNode(nodoTexto);
    // Colocar el cursor al final del texto insertado.
    const rangoCursor = rango.cloneRange();
    rangoCursor.setStartAfter(nodoTexto);
    rangoCursor.collapse(true);
    sel.removeAllRanges();
    sel.addRange(rangoCursor);
    ultimoDeshacer = {
      elemento: el,
      tipo: "contenteditable",
      inicio: 0,
      fin: 0,
      anterior,
      nodoInsertado: nodoTexto,
      longitudNuevo: nuevoTexto.length,
    };
    return true;
  }

  return false;
}

export function deshacerUltimo(): boolean {
  const estado = ultimoDeshacer;
  if (!estado) return false;
  const doc = estado.elemento.ownerDocument;
  if (!doc || !estaEnDocumento(doc, estado.elemento)) {
    ultimoDeshacer = null;
    return false;
  }

  if (estado.tipo === "input" || estado.tipo === "textarea") {
    const el = estado.elemento as HTMLInputElement | HTMLTextAreaElement;
    const actual = el.value.slice(estado.inicio, estado.fin);
    // Solo deshace si el texto insertado sigue presente.
    if (actual.length === 0 && estado.fin === estado.inicio) {
      // nada que deshacer coherentemente
    }
    el.focus();
    el.setSelectionRange(estado.inicio, estado.fin);
    el.setRangeText(estado.anterior, estado.inicio, estado.fin, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    ultimoDeshacer = null;
    return true;
  }

  if (estado.tipo === "contenteditable") {
    const el = estado.elemento as HTMLElement;
    if (!el.isContentEditable) {
      ultimoDeshacer = null;
      return false;
    }
    const nodo = estado.nodoInsertado;
    const esperado = estado.longitudNuevo;
    if (!nodo || !el.contains(nodo) || esperado === undefined) {
      ultimoDeshacer = null;
      return false;
    }
    if ((nodo.textContent ?? "").length !== esperado) {
      ultimoDeshacer = null;
      return false;
    }
    // Restaurar reemplazando el nodo insertado por el texto anterior.
    const reemplazo = doc.createTextNode(estado.anterior);
    nodo.parentNode?.replaceChild(reemplazo, nodo);
    const sel = doc.getSelection();
    if (sel) {
      const rango = doc.createRange();
      rango.selectNodeContents(reemplazo);
      sel.removeAllRanges();
      sel.addRange(rango);
    }
    ultimoDeshacer = null;
    return true;
  }

  ultimoDeshacer = null;
  return false;
}
