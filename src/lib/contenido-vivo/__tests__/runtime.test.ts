// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ponerEscudo, esEscenaPropia, coordenadasRelativas } from "../escudo-3d";
import {
  EVENTO_MODO, ATRIBUTO_ETIQUETA, ATRIBUTO_INTERRUPTOR,
  normalizarModo, modoDesdeUrl, urlConModo, aplicarModo, montarInterruptor,
} from "../interruptor-movimiento";

function crearIframe(src: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("src", src);
  document.body.appendChild(iframe);
  return iframe;
}

function caja(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height, right: left + width, bottom: top + height,
    x: left, y: top, toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
describe("escudo 3D", () => {
  it("distingue las escenas propias de las ajenas", () => {
    expect(esEscenaPropia(crearIframe("https://my.spline.design/escena"))).toBe(true);
    expect(esEscenaPropia(crearIframe("https://prod.spline.design/escena"))).toBe(false);
  });

  it("calcula coordenadas relativas y las acota entre 0 y 1", () => {
    const rect = caja(10, 20, 200, 100);
    expect(coordenadasRelativas({ clientX: 110, clientY: 70 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(coordenadasRelativas({ clientX: -90, clientY: 500 }, rect)).toEqual({ x: 0, y: 1 });
  });
  it("reenvía los gestos de una escena propia y se retira limpio", () => {
    const iframe = crearIframe("https://my.spline.design/escena");
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(caja(10, 20, 200, 100));
    const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");
    const quitar = ponerEscudo(iframe);
    const capa = document.querySelector('[data-vivo-escudo-capa="propia"]') as HTMLElement;
    expect(capa).not.toBeNull();
    capa.dispatchEvent(new MouseEvent("pointermove", { clientX: 110, clientY: 70, bubbles: true }));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ tipo: "pointermove", x: 0.5, y: 0.5 });
    quitar();
    expect(document.querySelector("[data-vivo-escudo-capa]")).toBeNull();
    expect(iframe.hasAttribute("data-vivo-escudo")).toBe(false);
  });

  it("en una escena ajena la capa no reenvía gestos", () => {
    const iframe = crearIframe("https://prod.spline.design/escena");
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(caja(0, 0, 100, 100));
    const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");
    const quitar = ponerEscudo(iframe);
    const capa = document.querySelector('[data-vivo-escudo-capa="ajena"]') as HTMLElement;
    capa.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 10, bubbles: true }));
    expect(post).not.toHaveBeenCalled();
    quitar();
  });
});
describe("interruptor de movimiento", () => {
  it("normaliza modos y combina la URL con el movimiento reducido", () => {
    expect(normalizarModo("RAYOS_X")).toBe("rayos-x");
    expect(normalizarModo("off")).toBe("apagado");
    expect(normalizarModo("otro")).toBeNull();
    expect(modoDesdeUrl("?movimiento=encendido", false)).toBe("encendido");
    expect(modoDesdeUrl("?movimiento=encendido", true)).toBe("apagado");
    expect(modoDesdeUrl("?movimiento=rayos-x", true)).toBe("rayos-x");
    expect(modoDesdeUrl("", false)).toBe("encendido");
    expect(urlConModo("/pagina?x=1", "apagado")).toBe("/pagina?x=1&movimiento=apagado");
  });
  it("pinta las etiquetas en rayos-x y las quita al volver", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML =
      '<figure data-vivo="Escena 3D" data-vivo-herramienta="Spline"></figure>' +
      '<figure data-vivo="Gráfico vivo"></figure>';
    document.body.appendChild(raiz);
    const modos: string[] = [];
    const escucha = (evento: Event) => {
      modos.push((evento as CustomEvent<{ modo: string }>).detail.modo);
    };
    window.addEventListener(EVENTO_MODO, escucha);
    aplicarModo("rayos-x", raiz);
    expect(raiz.getAttribute("data-movimiento")).toBe("rayos-x");
    const etiquetas = raiz.querySelectorAll(`[${ATRIBUTO_ETIQUETA}]`);
    expect(etiquetas).toHaveLength(2);
    expect(etiquetas[0]?.textContent).toBe("Escena 3D · Spline");
    expect(etiquetas[1]?.textContent).toBe("Gráfico vivo");
    aplicarModo("apagado", raiz);
    expect(raiz.querySelectorAll(`[${ATRIBUTO_ETIQUETA}]`)).toHaveLength(0);
    expect(modos).toEqual(["rayos-x", "apagado"]);
    window.removeEventListener(EVENTO_MODO, escucha);
  });

  it("monta el botón, cicla los modos y actualiza la URL", () => {
    window.history.replaceState({}, "", "/pagina?movimiento=encendido");
    const raiz = document.createElement("div");
    document.body.appendChild(raiz);
    const interruptor = montarInterruptor({ raiz });
    expect(interruptor).not.toBeNull();
    expect(interruptor?.modo()).toBe("encendido");
    expect(interruptor?.boton.textContent).toContain("Encendido");
    interruptor?.boton.click();
    expect(interruptor?.modo()).toBe("rayos-x");
    expect(window.location.search).toBe("?movimiento=rayos-x");
    interruptor?.boton.click();
    expect(interruptor?.modo()).toBe("apagado");
    interruptor?.desmontar();
    expect(raiz.querySelector(`[${ATRIBUTO_INTERRUPTOR}]`)).toBeNull();
    expect(raiz.hasAttribute("data-movimiento")).toBe(false);
  });
});
