/**
 * Reemplazo de selección editable por traducción (Ola 1020U · TRA1116-IDIOMAS).
 * Captura selección en input (excepto password), textarea y contenteditable,
 * reemplaza preservando eventos y permite deshacer el último reemplazo.
 */

export interface ObjetivoEditable {
  readonly elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  readonly inicio: number;
  readonly fin: number;
  readonly textoSeleccionado: string;
  readonly valorOriginal: string;
}

interface HistorialReemplazo {
  readonly elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  readonly inicio: number;
  readonly fin: number;
  readonly textoAnterior: string;
  readonly valorOriginalCompleto: string;
}

let ultimoHistorial: HistorialReemplazo | null = null;

export function capturarSeleccionEditable(doc: Document = document): ObjetivoEditable | null {
  const activo = doc.activeElement;
  if (!activo) return null;

  if (activo instanceof HTMLInputElement) {
    if (activo.type === "password") return null;
    const inicio = activo.selectionStart ?? 0;
    const fin = activo.selectionEnd ?? 0;
    if (inicio === fin) return null;
    const valorOriginal = activo.value;
    const textoSeleccionado = valorOriginal.slice(inicio, fin);
    return { elemento: activo, inicio, fin, textoSeleccionado, valorOriginal };
  }

  if (activo instanceof HTMLTextAreaElement) {
    const inicio = activo.selectionStart ?? 0;
    const fin = activo.selectionEnd ?? 0;
    if (inicio === fin) return null;
    const valorOriginal = activo.value;
    const textoSeleccionado = valorOriginal.slice(inicio, fin);
    return { elemento: activo, inicio, fin, textoSeleccionado, valorOriginal };
  }

  if (activo instanceof HTMLElement && (activo.isContentEditable || activo.getAttribute("contenteditable") === "true")) {
    const seleccion = doc.getSelection();
    if (!seleccion || seleccion.rangeCount === 0 || seleccion.isCollapsed) return null;
    const rango = seleccion.getRangeAt(0);
    if (!activo.contains(rango.commonAncestorContainer)) return null;
    const textoSeleccionado = seleccion.toString();
    if (!textoSeleccionado) return null;

    // Para contenteditable simulamos inicio/fin aproximados por texto plano o guardamos nodo/offset
    return { elemento: activo, inicio: 0, fin: textoSeleccionado.length, textoSeleccionado, valorOriginal: activo.textContent ?? "" };
  }

  return null;
}

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const { elemento, inicio, fin, textoSeleccionado, valorOriginal } = objetivo;
  if (!document.body.contains(elemento)) return false;

  if (elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement) {
    if (elemento.value !== valorOriginal) return false;
    const valorActual = elemento.value;
    const actualSeleccionado = valorActual.slice(inicio, fin);
    if (actualSeleccionado !== textoSeleccionado) return false;

    ultimoHistorial = {
      elemento,
      inicio,
      fin,
      textoAnterior: textoSeleccionado,
      valorOriginalCompleto: valorActual,
    };

    elemento.setRangeText(nuevoTexto, inicio, fin, "end");
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (elemento instanceof HTMLElement && (elemento.isContentEditable || elemento.getAttribute("contenteditable") === "true")) {
    const seleccion = document.getSelection();
    if (!seleccion || seleccion.rangeCount === 0) return false;
    const rango = seleccion.getRangeAt(0);
    if (rango.toString() !== textoSeleccionado) return false;

    ultimoHistorial = {
      elemento,
      inicio: 0,
      fin: nuevoTexto.length,
      textoAnterior: textoSeleccionado,
      valorOriginalCompleto: elemento.textContent ?? "",
    };

    rango.deleteContents();
    rango.insertNode(document.createTextNode(nuevoTexto));
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

export function deshacerUltimo(): boolean {
  if (!ultimoHistorial) return false;
  const { elemento, inicio, textoAnterior, valorOriginalCompleto } = ultimoHistorial;
  if (!document.body.contains(elemento)) return false;

  if (elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement) {
    const actual = elemento.value;
    // Restauramos sustituyendo el trozo puesto por el anterior
    const finNuevo = inicio + (valorOriginalCompleto.length - (valorOriginalCompleto.length - (ultimoHistorial.fin - ultimoHistorial.inicio)) - textoAnterior.length); // simplificado:
    elemento.value = valorOriginalCompleto;
    elemento.setSelectionRange(inicio, inicio + textoAnterior.length);
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    ultimoHistorial = null;
    return true;
  }

  if (elemento instanceof HTMLElement && (elemento.isContentEditable || elemento.getAttribute("contenteditable") === "true")) {
    elemento.textContent = valorOriginalCompleto;
    ultimoHistorial = null;
    return true;
  }

  return false;
}
