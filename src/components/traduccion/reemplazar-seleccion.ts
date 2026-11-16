/**
 * Traducción · reemplazo de selección en elementos editables (input, textarea, contenteditable).
 * Módulo puro, sin red, probado en jsdom.
 */

export interface ObjetivoEditable {
    elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
    inicio: number;
    fin: number;
    textoOriginal: string;
    tipo: "input" | "textarea" | "contenteditable";
    rango?: Range | null;
}

let ultimoEstado: {
    elemento: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
    textoAnterior: string;
    rango?: Range | null;
    inicio: number;
    fin: number;
    tipo: "input" | "textarea" | "contenteditable";
} | null = null;

export function capturarSeleccionEditable(doc: Document): ObjetivoEditable | null {
    const activo = doc.activeElement;
    if (!activo) return null;

    if (activo instanceof HTMLInputElement) {
        if (activo.type.toLowerCase() === "password") return null;
        const inicio = activo.selectionStart ?? 0;
        const fin = activo.selectionEnd ?? 0;
        if (inicio === fin) return null;
        const textoOriginal = activo.value.substring(inicio, fin);
        return { elemento: activo, inicio, fin, textoOriginal, tipo: "input" };
    }

    if (activo instanceof HTMLTextAreaElement) {
        const inicio = activo.selectionStart ?? 0;
        const fin = activo.selectionEnd ?? 0;
        if (inicio === fin) return null;
        const textoOriginal = activo.value.substring(inicio, fin);
        return { elemento: activo, inicio, fin, textoOriginal, tipo: "textarea" };
    }

    if (activo.getAttribute("contenteditable") === "true" || activo.getAttribute("contenteditable") === "") {
        const seleccion = doc.getSelection();
        if (!seleccion || seleccion.rangeCount === 0) return null;
        const rango = seleccion.getRangeAt(0);
        if (rango.collapsed) return null;
        if (!activo.contains(rango.commonAncestorContainer)) return null;
        const textoOriginal = rango.toString();
        if (!textoOriginal) return null;
        return {
            elemento: activo as HTMLElement,
            inicio: 0,
            fin: 0,
            textoOriginal,
            tipo: "contenteditable",
            rango: rango.cloneRange(),
        };
    }

    return null;
}

export function reemplazar(objetivo: ObjetivoEditable, nuevoTexto: string): boolean {
    const doc = objetivo.elemento.ownerDocument;
    if (!doc || !doc.body.contains(objetivo.elemento)) return false;

    if (objetivo.tipo === "input" || objetivo.tipo === "textarea") {
        const el = objetivo.elemento as HTMLInputElement | HTMLTextAreaElement;
        const actualTexto = el.value.substring(objetivo.inicio, objetivo.fin);
        if (actualTexto !== objetivo.textoOriginal) return false;

        ultimoEstado = {
            elemento: el,
            textoAnterior: el.value,
            inicio: objetivo.inicio,
            fin: objetivo.fin,
            tipo: objetivo.tipo,
        };

        if (typeof el.setRangeText === "function") {
            el.setRangeText(nuevoTexto, objetivo.inicio, objetivo.fin, "end");
        } else {
            const val = el.value;
            el.value = val.substring(0, objetivo.inicio) + nuevoTexto + val.substring(objetivo.fin);
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    if (objetivo.tipo === "contenteditable") {
        const rango = objetivo.rango;
        if (!rango) return false;
        const actualTexto = rango.toString();
        if (actualTexto !== objetivo.textoOriginal) return false;

        ultimoEstado = {
            elemento: objetivo.elemento,
            textoAnterior: objetivo.elemento.innerHTML,
            inicio: 0,
            fin: 0,
            tipo: "contenteditable",
            rango: rango.cloneRange(),
        };

        rango.deleteContents();
        const nodoTexto = doc.createTextNode(nuevoTexto);
        rango.insertNode(nodoTexto);

        // Actualizar selección al final del texto insertado
        const seleccion = doc.getSelection();
        if (seleccion) {
            seleccion.removeAllRanges();
            const nuevoRango = doc.createRange();
            nuevoRango.setStartAfter(nodoTexto);
            nuevoRango.collapse(true);
            seleccion.addRange(nuevoRango);
        }

        objetivo.elemento.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    return false;
}

export function deshacerUltimo(): boolean {
    if (!ultimoEstado) return false;
    const { elemento, textoAnterior, tipo, rango } = ultimoEstado;
    const doc = elemento.ownerDocument;
    if (!doc || !doc.body.contains(elemento)) {
        ultimoEstado = null;
        return false;
    }

    if (tipo === "input" || tipo === "textarea") {
        const el = elemento as HTMLInputElement | HTMLTextAreaElement;
        el.value = textoAnterior;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        ultimoEstado = null;
        return true;
    }

    if (tipo === "contenteditable") {
        elemento.innerHTML = textoAnterior;
        elemento.dispatchEvent(new Event("input", { bubbles: true }));
        ultimoEstado = null;
        return true;
    }

    ultimoEstado = null;
    return false;
}
