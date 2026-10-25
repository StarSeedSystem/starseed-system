// StarSeed OS · TRD1020C · traducción de página entera.
// Módulo puro del DOM (sin node:* ni red): recoger, aplicar, restaurar y observar.
// Contrato: architecture/repos-libreria-1020d.md §4.

export type NodoTraducible = {
  nodo: Text | Attr;
  texto: string;
  atributo?: string;
};

const ATRIBUTOS = ["title", "alt", "aria-label", "placeholder"] as const;

// Nada se traduce dentro de estos nodos. Los campos de formulario no tienen texto útil,
// pero sus atributos sí se recogen: ahí vive `placeholder`. Lo vetado tampoco da atributos.
const SIN_TEXTO =
  "script,style,noscript,code,pre,textarea,input,select,[contenteditable],[translate=no],[data-no-traducir],[hidden]";
const SIN_ATRIBUTOS =
  "script,style,noscript,[contenteditable],[translate=no],[data-no-traducir],[hidden]";

const originales = new WeakMap<Text | Attr, string>();
const traducidos = new WeakSet<Text | Attr>();
const langs = new WeakMap<Element, string | null>();

const valor = (n: Text | Attr): string => (n.nodeType === 2 ? (n as Attr).value : (n as Text).data);

const poner = (n: Text | Attr, texto: string): void => {
  if (n.nodeType === 2) (n as Attr).value = texto;
  else (n as Text).data = texto;
};

export function recogerTextos(raiz: Element): NodoTraducible[] {
  const salida: NodoTraducible[] = [];
  const caminar = (el: Element): void => {
    if (!el.closest(SIN_TEXTO)) {
      for (const hijo of Array.from(el.childNodes)) {
        if (hijo.nodeType === 3 && (hijo.nodeValue ?? "").trim()) {
          salida.push({ nodo: hijo as Text, texto: hijo.nodeValue ?? "" });
        } else if (hijo.nodeType === 1) {
          caminar(hijo as Element);
        }
      }
    }
    if (el.closest(SIN_ATRIBUTOS)) return;
    for (const nombre of ATRIBUTOS) {
      const atributo = el.getAttributeNode(nombre);
      if (atributo?.value.trim()) {
        salida.push({ nodo: atributo, texto: atributo.value, atributo: nombre });
      }
    }
  };
  caminar(raiz);
  return salida;
}

export function aplicar(
  nodos: readonly NodoTraducible[],
  traducciones: ReadonlyMap<string, string>,
  idioma: string,
): number {
  let aplicados = 0;
  for (const { nodo, texto } of nodos) {
    const traduccion = traducciones.get(texto);
    const destino = nodo.nodeType === 2 ? (nodo as Attr).ownerElement : nodo.parentElement;
    if (!traduccion || traduccion === texto || !destino) continue;
    if (traducidos.has(nodo) || originales.has(nodo)) continue;
    if (!langs.has(destino)) langs.set(destino, destino.getAttribute("lang"));
    originales.set(nodo, valor(nodo));
    poner(nodo, traduccion);
    destino.setAttribute("lang", idioma);
    destino.setAttribute("data-traducido", idioma);
    traducidos.add(nodo);
    aplicados += 1;
  }
  return aplicados;
}

export function restaurar(raiz: Element): void {
  const marcados = [
    ...(raiz.matches("[data-traducido]") ? [raiz] : []),
    ...Array.from(raiz.querySelectorAll("[data-traducido]")),
  ];
  for (const el of marcados) {
    for (const nombre of ATRIBUTOS) {
      const atributo = el.getAttributeNode(nombre);
      if (!atributo) continue;
      const original = originales.get(atributo);
      if (original !== undefined) {
        atributo.value = original;
        originales.delete(atributo);
        traducidos.delete(atributo);
      }
    }
    for (const hijo of Array.from(el.childNodes)) {
      if (hijo.nodeType !== 3) continue;
      const original = originales.get(hijo as Text);
      if (original !== undefined) {
        (hijo as Text).data = original;
        originales.delete(hijo as Text);
        traducidos.delete(hijo as Text);
      }
    }
  }
  for (const el of marcados) {
    const antes = langs.get(el);
    if (antes === null || antes === undefined) el.removeAttribute("lang");
    else el.setAttribute("lang", antes);
    el.removeAttribute("data-traducido");
    langs.delete(el);
  }
}

export function observar(
  raiz: Element,
  alNuevo: (nuevos: readonly NodoTraducible[]) => void,
): () => void {
  const observador = new MutationObserver(() => {
    const nuevos = recogerTextos(raiz).filter((item) => !traducidos.has(item.nodo));
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
