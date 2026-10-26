/**
 * TRD1020C (Ola 1020U) · Traducción de página entera: recoge lo traducible,
 * aplica traducciones guardando cada original (WeakMap) y lo restaura igual.
 * Módulo puro del navegador: solo API del DOM, sin red ni node:*.
 */
const ETIQUETAS_PROHIBIDAS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT"]);
const ATRIBUTOS = ["title", "alt", "aria-label", "placeholder"] as const;
export type AtributoTraducible = (typeof ATRIBUTOS)[number];

export type NodoTraducible =
  | { tipo: "texto"; texto: string; nodo: Text; padre: Element }
  | { tipo: "atributo"; atributo: AtributoTraducible; texto: string; nodo: Element };

function estaProhibido(el: Element, eximeFormulario: boolean): boolean {
  const formulario = el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT";
  if (ETIQUETAS_PROHIBIDAS.has(el.tagName) && !(eximeFormulario && formulario)) return true;
  return (
    el.hasAttribute("contenteditable") ||
    el.getAttribute("translate") === "no" ||
    el.hasAttribute("data-no-traducir") ||
    el.hasAttribute("hidden")
  );
}

function conProhibido(nodo: Node | null, eximeFormulario: boolean): boolean {
  for (let actual: Node | null = nodo; actual; actual = actual.parentElement) {
    if (actual.nodeType === 1 && estaProhibido(actual as Element, eximeFormulario)) return true;
  }
  return false;
}

function colectarNodo(actual: Node, nodos: NodoTraducible[]): void {
  if (actual.nodeType !== 1) {
    const texto = actual.textContent ?? "";
    const padre = actual.parentElement;
    if (texto.trim() && padre && !conProhibido(actual, false)) {
      nodos.push({ tipo: "texto", texto, nodo: actual as Text, padre });
    }
    return;
  }
  const el = actual as Element;
  if (conProhibido(el, true)) return;
  for (const atributo of ATRIBUTOS) {
    const valor = el.getAttribute(atributo) ?? "";
    if (valor.trim()) nodos.push({ tipo: "atributo", atributo, texto: valor, nodo: el });
  }
}

/** Nodos de texto visibles y no vacíos, nunca dentro de las etiquetas prohibidas,
 * [contenteditable], [translate=no], [data-no-traducir] ni [hidden]; y los atributos
 * title, alt, aria-label y placeholder (los campos de formulario sí aportan los suyos). */
export function recogerTextos(raiz: Node): NodoTraducible[] {
  const nodos: NodoTraducible[] = [];
  const documento = raiz.nodeType === 9 ? (raiz as Document) : raiz.ownerDocument;
  if (!documento) return nodos;
  colectarNodo(raiz, nodos);
  const iterador = documento.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let actual: Node | null = iterador.nextNode(); actual; actual = iterador.nextNode()) {
    colectarNodo(actual, nodos);
  }
  return nodos;
}

const originales = new WeakMap<Node, Map<string, string>>();

/** Guarda cada original, cambia el texto o el atributo y marca el elemento padre con
 * lang y data-traducido; devuelve cuántas traducciones aplicó (vacías se saltan). */
export function aplicar(nodos: NodoTraducible[], traducciones: string[], idioma: string): number {
  let aplicados = 0;
  nodos.forEach((nodo, indice) => {
    const traduccion = traducciones[indice];
    if (!traduccion?.trim()) return;
    const mapa = originales.get(nodo.nodo) ?? new Map<string, string>();
    if (nodo.tipo === "texto") {
      if (!mapa.has("")) mapa.set("", nodo.nodo.textContent ?? "");
      nodo.nodo.textContent = traduccion;
    } else {
      const { atributo } = nodo;
      if (!mapa.has(atributo)) mapa.set(atributo, nodo.nodo.getAttribute(atributo) ?? "");
      nodo.nodo.setAttribute(atributo, traduccion);
    }
    originales.set(nodo.nodo, mapa);
    const marcable = nodo.tipo === "texto" ? nodo.padre : nodo.nodo;
    const marcas = originales.get(marcable) ?? new Map<string, string>();
    if (!marcas.has("lang")) marcas.set("lang", marcable.getAttribute("lang") ?? "");
    originales.set(marcable, marcas);
    marcable.setAttribute("lang", idioma);
    marcable.setAttribute("data-traducido", "sí");
    aplicados += 1;
  });
  return aplicados;
}

/** Devuelve textos, atributos y marcas a como estaban antes de aplicar. */
export function restaurar(raiz: Node): void {
  const documento = raiz.nodeType === 9 ? (raiz as Document) : raiz.ownerDocument;
  if (!documento) return;
  const iterador = documento.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let actual: Node | null = iterador.nextNode(); actual; actual = iterador.nextNode()) {
    const mapa = originales.get(actual);
    if (mapa?.has("")) {
      (actual as Text).textContent = mapa.get("") ?? "";
      mapa.delete("");
    }
  }
  const marcados = Array.from((raiz as Element).querySelectorAll("[data-traducido]"));
  if (raiz.nodeType === 1) marcados.unshift(raiz as Element);
  for (const el of marcados) {
    const mapa = originales.get(el);
    for (const [clave, valor] of Array.from(mapa?.entries() ?? [])) {
      if (valor) el.setAttribute(clave, valor);
      else el.removeAttribute(clave);
      mapa?.delete(clave);
    }
    el.removeAttribute("data-traducido");
  }
}

function yaTraducido(nodo: NodoTraducible): boolean {
  for (
    let actual: Element | null = nodo.tipo === "texto" ? nodo.padre : nodo.nodo;
    actual;
    actual = actual.parentElement
  ) {
    if (actual.hasAttribute("data-traducido")) return true;
  }
  return false;
}

function anotar(candidatos: NodoTraducible[], vistos: Set<Node>, nuevos: NodoTraducible[]): void {
  for (const candidato of candidatos) {
    if (vistos.has(candidato.nodo) || yaTraducido(candidato)) continue;
    vistos.add(candidato.nodo);
    nuevos.push(candidato);
  }
}

/** Sigue con MutationObserver los textos y atributos nuevos; devuelve la función para
 * parar. No vuelve a traducir lo ya traducido: se salta lo alcanzado por data-traducido. */
export function observar(raiz: Node, alNuevo: (nuevos: NodoTraducible[]) => void): () => void {
  const observador = new MutationObserver((mutaciones) => {
    const vistos = new Set<Node>();
    const nuevos: NodoTraducible[] = [];
    for (const mutacion of mutaciones) {
      if (mutacion.type === "characterData") {
        anotar(recogerTextos(mutacion.target), vistos, nuevos);
      } else if (mutacion.type === "childList") {
        for (const anadido of Array.from(mutacion.addedNodes)) {
          if (anadido.nodeType === 1 || anadido.nodeType === 3) {
            anotar(recogerTextos(anadido), vistos, nuevos);
          }
        }
      } else if (mutacion.type === "attributes") {
        const el = mutacion.target as Element;
        const nombre = mutacion.attributeName ?? "";
        if (valorTrim(el.getAttribute(nombre)) && (ATRIBUTOS as readonly string[]).includes(nombre)) {
          anotar(
            [{ tipo: "atributo", atributo: nombre as AtributoTraducible, texto: el.getAttribute(nombre) ?? "", nodo: el }],
            vistos,
            nuevos,
          );
        }
      }
    }
    if (nuevos.length > 0) alNuevo(nuevos);
  });
  observador.observe(raiz, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...ATRIBUTOS, "lang", "data-traducido"],
  });
  return () => observador.disconnect();
}
