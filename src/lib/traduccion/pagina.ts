// StarSeed OS · TRD1020C · traducción de página entera.
// Contrato: architecture/repos-libreria-1020d.md §4. Módulo puro del DOM: sin node:* ni red,
// sin estado más allá del WeakMap de originales que permite la ida y vuelta exacta.

export type NodoTraducible = {
  nodo: Text | Attr;
  texto: string;
  atributo?: string;
};

const ATRIBUTOS = ["title", "alt", "aria-label", "placeholder"] as const;

// Nada se traduce dentro de estos elementos ni de lo marcado en contra. Los campos de
// formulario se excluyen del recorrido de texto (no tienen nodos de texto útiles), pero
// sus atributos propios sí se recogen: `placeholder` solo existe ahí. Lo oculto no se
// recoge ni como texto ni como atributo.
const EXCLUIDOS_TEXTO =
  "script,style,noscript,code,pre,textarea,input,select,[contenteditable],[translate=no],[data-no-traducir],[hidden]";
const EXCLUIDOS_ATRIBUTO =
  "script,style,noscript,[contenteditable],[translate=no],[data-no-traducir],[hidden]";

const originales = new WeakMap<Text | Attr, { texto: string; lng: string | null }>();
const yaTraducidos = new WeakSet<Text | Attr>();
const langsGuardados = new WeakMap<Element, string | null>();

function valor(nodo: Text | Attr): string {
  return nodo.nodeType === 2 ? (nodo as Attr).value : (nodo as Text).data;
}

function poner(nodo: Text | Attr, texto: string): void {
  if (nodo.nodeType === 2) (nodo as Attr).value = texto;
  else (nodo as Text).data = texto;
}

export function recogerTextos(raiz: Element): NodoTraducible[] {
  const salida: NodoTraducible[] = [];
  const caminar = (elemento: Element): void => {
    const excluidoDeTexto = elemento.closest(EXCLUIDOS_TEXTO) !== null;
    if (!excluidoDeTexto) {
      for (const hijo of elemento.childNodes) {
        if (hijo.nodeType === 3 && (hijo.nodeValue ?? "").trim()) {
          salida.push({ nodo: hijo as Text, texto: hijo.nodeValue ?? "" });
        } else if (hijo.nodeType === 1) {
          caminar(hijo as Element);
        }
      }
    }
    if (!elemento.closest(EXCLUIDOS_ATRIBUTO)) {
      for (const nombre of ATRIBUTOS) {
        const atributo = elemento.getAttributeNode(nombre);
        if (atributo && atributo.value.trim()) {
          salida.push({ nodo: atributo, texto: atributo.value, atributo: nombre });
        }
      }
    }
  };
  caminar(raiz);
  return salida;
}

function marcar(elemento: Element, idioma: string): void {
  if (!langsGuardados.has(elemento)) langsGuardados.set(elemento, elemento.getAttribute("lang"));
  elemento.setAttribute("lang", idioma);
  elemento.setAttribute("data-traducido", idioma);
}

export function aplicar(
  nodos: readonly NodoTraducible[],
  traducciones: ReadonlyMap<string, string>,
  idioma: string,
): number {
  let aplicados = 0;
  for (const item of nodos) {
    const traduccion = traducciones.get(item.texto);
    const destino =
      item.nodo.nodeType === 2 ? (item.nodo as Attr).ownerElement : item.nodo.parentElement;
    if (!traduccion || traduccion === item.texto || !destino) continue;
    if (yaTraducidos.has(item.nodo) || originales.has(item.nodo)) continue;
    originales.set(item.nodo, { texto: valor(item.nodo), lng: destino.getAttribute("lang") });
    poner(item.nodo, traduccion);
    marcar(destino, idioma);
    yaTraducidos.add(item.nodo);
    aplicados += 1;
  }
  return aplicados;
}

function devolver(nodo: Text | Attr): void {
  const guardado = originales.get(nodo);
  if (!guardado) return;
  poner(nodo, guardado.texto);
  originales.delete(nodo);
  yaTraducidos.delete(nodo);
}

function desmarcar(elemento: Element): void {
  const lng = langsGuardados.get(elemento);
  if (lng === null || lng === undefined) elemento.removeAttribute("lang");
  else elemento.setAttribute("lang", lng);
  elemento.removeAttribute("data-traducido");
  langsGuardados.delete(elemento);
}

export function restaurar(raiz: Element): void {
  const marcados: Element[] = raiz.matches("[data-traducido]")
    ? [raiz, ...Array.from(raiz.querySelectorAll("[data-traducido]"))]
    : Array.from(raiz.querySelectorAll("[data-traducido]"));
  for (const elemento of marcados) {
    for (const nombre of ATRIBUTOS) {
      const atributo = elemento.getAttributeNode(nombre);
      if (atributo) devolver(atributo);
    }
    for (const hijo of Array.from(elemento.childNodes)) {
      if (hijo.nodeType === 3) devolver(hijo as Text);
    }
  }
  for (const elemento of marcados) desmarcar(elemento);
}

export function observar(
  raiz: Element,
  alNuevo: (nuevos: readonly NodoTraducible[]) => void,
): () => void {
  const observador = new MutationObserver(() => {
    const nuevos = recogerTextos(raiz).filter((item) => !yaTraducidos.has(item.nodo));
    if (nuevos.length > 0) alNuevo(nuevos);
  });
  observador.observe(raiz, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATRIBUTOS],
  });
  return () => observador.disconnect();
}
