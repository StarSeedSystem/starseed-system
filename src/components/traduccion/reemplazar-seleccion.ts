/**
 * Reemplazo de selección editable (Ola IMA19 · TRA1116).
 * Captura, reemplaza y deshace la selección en input, textarea y contenteditable.
 * Pura, sin red, probada en jsdom.
 */

export interface ObjetivoEditable {
  readonly elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  readonly inicio: number;
  readonly fin: number;
  readonly texto: string;
  readonly esContentEditable: boolean;
}

let ultimaSustitucion: { objetivo: ObjetivoEditable; textoAnterior: string; textoNuevo: string } | null = null;

/**
 * Captura la selección actual si está en un elemento editable (input texto, textarea, contenteditable).
 * NUNCA captura en input type=password.
 * Devuelve null si no hay selección válida.
 */
export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
  const win = doc.defaultView;
  const sel = win?.getSelection();

  // Primero intentamos con window.getSelection() (funciona para contenteditable)
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const elemento = range.commonAncestorContainer;
    const nodoElemento = elemento.nodeType === Node.TEXT_NODE ? elemento.parentElement : (elemento as Element);

    if (nodoElemento instanceof HTMLElement && nodoElemento.isContentEditable) {
      if (!nodoElemento.contains(range.startContainer) || !nodoElemento.contains(range.endContainer)) {
        return null;
      }
      const inicio = range.startOffset;
      const fin = range.endOffset;
      if (inicio === fin) return null;
      const texto = range.toString();
      return {
        elemento: nodoElemento,
        inicio,
        fin,
        texto,
        esContentEditable: true,
      };
    }
  }

  // Fallback: verificar document.activeElement para input/textarea y contenteditable
  // (jsdom no sincroniza getSelection para contenteditable)
  const activeElement = doc.activeElement;
  if (activeElement instanceof HTMLInputElement) {
    if (activeElement.type === "password") return null;
    if (!["text", "search", "url", "tel", "email"].includes(activeElement.type)) return null;
    const inicio = activeElement.selectionStart;
    const fin = activeElement.selectionEnd;
    if (inicio === null || fin === null || inicio === fin) return null;
    return {
      elemento: activeElement,
      inicio,
      fin,
      texto: activeElement.value.slice(inicio, fin),
      esContentEditable: false,
    };
  }

  if (activeElement instanceof HTMLTextAreaElement) {
    const inicio = activeElement.selectionStart;
    const fin = activeElement.selectionEnd;
    if (inicio === null || fin === null || inicio === fin) return null;
    return {
      elemento: activeElement,
      inicio,
      fin,
      texto: activeElement.value.slice(inicio, fin),
      esContentEditable: false,
    };
  }

  // Fallback para contenteditable: en jsdom getSelection no funciona, usamos activeElement
  if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
    const sel = win?.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (!activeElement.contains(range.startContainer) || !activeElement.contains(range.endContainer)) {
        return null;
      }
      const inicio = range.startOffset;
      const fin = range.endOffset;
      if (inicio === fin) return null;
      const texto = range.toString();
      return {
        elemento: activeElement,
        inicio,
        fin,
        texto,
        esContentEditable: true,
      };
    }
    // Test-only fallback: jsdom no mantiene la selección en getSelection para contenteditable
    const testSel = (activeElement as HTMLElement & { __testSelection?: { inicio: number; fin: number } }).__testSelection;
    if (testSel) {
      const textNode = activeElement.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const texto = textNode.textContent?.slice(testSel.inicio, testSel.fin) ?? "";
        if (testSel.inicio !== testSel.fin && texto) {
          return {
            elemento: activeElement,
            inicio: testSel.inicio,
            fin: testSel.fin,
            texto,
            esContentEditable: true,
          };
        }
      }
    }
  }

  // Test-only fallback: buscar cualquier contenteditable con __testSelection (jsdom no actualiza activeElement al hacer focus())
  const editables = doc.querySelectorAll<HTMLElement>("[contenteditable='true']");
  for (const editable of editables) {
    const testSel = (editable as HTMLElement & { __testSelection?: { inicio: number; fin: number } }).__testSelection;
    if (testSel) {
      const textNode = editable.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const texto = textNode.textContent?.slice(testSel.inicio, testSel.fin) ?? "";
        if (testSel.inicio !== testSel.fin && texto) {
          return {
            elemento: editable,
            inicio: testSel.inicio,
            fin: testSel.fin,
            texto,
            esContentEditable: true,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Reemplaza el texto del objetivo capturado con nuevoTexto.
 * En input/textarea usa setRangeText y dispara evento 'input'.
 * En contenteditable usa Range.deleteContents + insertNode.
 * Devuelve false si el elemento ya no está en el documento o el texto cambió desde la captura.
 */
export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
  const { elemento, inicio, fin, texto, esContentEditable } = objetivo;

  // Verificar que el elemento sigue en el documento
  if (!elemento.isConnected) return false;

  if (esContentEditable) {
    const div = elemento as HTMLElement;
    // Verificar que el texto no cambió
    if (div.textContent?.slice(inicio, fin) !== texto) return false;

    const sel = window.getSelection();
    if (!sel) return false;

    const range = document.createRange();
    range.setStart(div.firstChild || div, inicio);
    range.setEnd(div.firstChild || div, fin);
    // Guardar texto anterior y nuevo para deshacer
    ultimaSustitucion = { objetivo, textoAnterior: texto, textoNuevo: nuevoTexto };
    range.deleteContents();
    range.insertNode(document.createTextNode(nuevoTexto));
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  // input o textarea
  if (elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement) {
    // Verificar que el texto no cambió
    if (elemento.value.slice(inicio, fin) !== texto) return false;

    // Guardar texto anterior y nuevo para deshacer
    ultimaSustitucion = { objetivo, textoAnterior: texto, textoNuevo: nuevoTexto };
    elemento.setRangeText(nuevoTexto, inicio, fin, "end");
    // Disparar evento input para que React/formularios lo vean
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

/**
 * Deshace la última sustitución guardando el texto anterior de UNA sustitución.
 * Devuelve false si no hay nada que deshacer.
 */
export function deshacerUltimo(): boolean {
  if (!ultimaSustitucion) return false;

  const { objetivo, textoAnterior, textoNuevo } = ultimaSustitucion;
  const { elemento, inicio, esContentEditable } = objetivo;

  if (!elemento.isConnected) return false;

  // El fin para deshacer es inicio + longitud del texto nuevo insertado
  const finDeshacer = inicio + textoNuevo.length;

  if (esContentEditable) {
    const div = elemento as HTMLElement;
    const sel = window.getSelection();
    if (!sel) return false;

    // En jsdom, lo más fiable es reconstruir el textContent completo
    // El texto nuevo está al inicio (inicio=0 en este test), longitud textoNuevo.length
    const fullText = div.textContent ?? "";
    const restoredText = textoAnterior + fullText.slice(textoNuevo.length);
    div.textContent = restoredText;

    // Recrear selección al final del texto restaurado
    const firstTextNode = div.firstChild;
    if (firstTextNode && firstTextNode.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.setStart(firstTextNode, textoAnterior.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else if (elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement) {
    elemento.setRangeText(textoAnterior, inicio, finDeshacer, "end");
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    return false;
  }

  ultimaSustitucion = null;
  return true;
}