// @vitest-environment jsdom
// Pruebas del escudo 3D y del interruptor de movimiento (jsdom: tocan DOM).
import { describe, expect, it, vi } from "vitest";

import { escenaPropia, ponerEscudo } from "@/lib/contenido-vivo/escudo-3d";
import {
  NOMBRE_EVENTO,
  aplicarModo,
  iniciarInterruptor,
  modoDesdeUrl,
  modoEfectivo,
  type ModoMovimiento,
} from "@/lib/contenido-vivo/interruptor-movimiento";

const RECT = { left: 40, top: 10, width: 300, height: 150 } as DOMRect;

function montarIframe(src: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  document.body.appendChild(iframe);
  iframe.getBoundingClientRect = () => RECT;
  document.body.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 800 }) as DOMRect;
  return iframe;
}

describe("escudo del 3D", () => {
  it("reconoce Spline y el visor del OS como propios; otros dominios, ajenos", () => {
    expect(escenaPropia(montarIframe("https://my.spline.design/x/abc"))).toBe(true);
    expect(escenaPropia(montarIframe("/escenas/protomolecula"))).toBe(true);
    expect(escenaPropia(montarIframe("https://embed.sketchfab.com/xyz"))).toBe(false);
    const forzada = montarIframe("https://embed.sketchfab.com/xyz");
    forzada.dataset.vivoPropia = "sí";
    expect(escenaPropia(forzada)).toBe(true);
  });

  it("en una escena propia reenvía los gestos con coordenadas de 0 a 1", () => {
    const ventana = { postMessage: vi.fn() };
    const iframe = montarIframe("https://my.spline.design/x/abc");
    Object.defineProperty(iframe, "contentWindow", { value: ventana, configurable: true });
    ponerEscudo(iframe);
    const capa = document.querySelector<HTMLElement>('[data-vivo-escudo="propio"]');
    expect(capa).not.toBeNull();
    expect(capa.style.position).toBe("absolute");
    capa!.getBoundingClientRect = () => RECT;
    capa!.dispatchEvent(new MouseEvent("click", { clientX: 190, clientY: 85 }));
    expect(ventana.postMessage).toHaveBeenCalledWith(
      { canal: "contenido-vivo", tipo: "puntero", gesto: "click", x: 0.5, y: 0.5 },
      "*",
    );
  });

  it("en una escena ajena es simple: nada reenviado y la rueda queda libre", () => {
    const ventana = { postMessage: vi.fn() };
    const iframe = montarIframe("https://embed.sketchfab.com/xyz");
    Object.defineProperty(iframe, "contentWindow", { value: ventana, configurable: true });
    ponerEscudo(iframe);
    const capa = document.querySelector<HTMLElement>('[data-vivo-escudo="ajeno"]');
    capa!.getBoundingClientRect = () => RECT;
    capa!.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 10 }));
    expect(ventana.postMessage).not.toHaveBeenCalled();
    const rueda = new WheelEvent("wheel", { cancelable: true });
    capa!.dispatchEvent(rueda);
    expect(rueda.defaultPrevented).toBe(false);
  });

  it("quitar() retira la capa y devuelve la posición del contenedor", () => {
    const iframe = montarIframe("/escenas/protomolecula");
    const quitar = ponerEscudo(iframe);
    expect(document.querySelector("[data-vivo-escudo]")).not.toBeNull();
    expect(document.body.style.position).toBe("relative");
    quitar();
    expect(document.querySelector("[data-vivo-escudo]")).toBeNull();
    expect(document.body.style.position).toBe("");
  });
});

describe("interruptor de movimiento", () => {
  it("modoDesdeUrl lee ?movimiento= y rechaza lo que no conoce", () => {
    expect(modoDesdeUrl("?movimiento=rayos-x")).toBe("rayos-x");
    expect(modoDesdeUrl("?movimiento=encendido&x=1")).toBe("encendido");
    expect(modoDesdeUrl("")).toBeNull();
    expect(modoDesdeUrl("?movimiento=zigzag")).toBeNull();
  });

  it("modoEfectivo respeta el movimiento reducido (Rayos X no anima: se queda)", () => {
    expect(modoEfectivo("encendido", false)).toBe("encendido");
    expect(modoEfectivo("encendido", true)).toBe("apagado");
    expect(modoEfectivo("rayos-x", true)).toBe("rayos-x");
  });

  it("Rayos X pinta las etiquetas de cada pieza y avisa con el evento", () => {
    const raiz = document.documentElement;
    const pieza = document.createElement("div");
    pieza.dataset.vivo = "orbe 3D · Spline";
    pieza.dataset.vivoHerramienta = "Spline";
    document.body.appendChild(pieza);
    const vistos: ModoMovimiento[] = [];
    raiz.addEventListener(NOMBRE_EVENTO, (evento) => {
      const detalle = (evento as CustomEvent<{ modo: ModoMovimiento }>).detail;
      vistos.push(detalle.modo);
    });
    aplicarModo("rayos-x", raiz);
    expect(raiz.dataset.vivoModo).toBe("rayos-x");
    const estilo = document.getElementById("contenido-vivo-rayos-x");
    expect(estilo?.textContent).toContain("attr(data-vivo)");
    expect(estilo?.textContent).toContain('" · "');
    expect(estilo?.textContent).toContain("attr(data-vivo-herramienta)");
    aplicarModo("apagado", raiz);
    expect(raiz.dataset.vivoModo).toBe("apagado");
    expect(document.getElementById("contenido-vivo-rayos-x")).toBeNull();
    expect(vistos).toEqual(["rayos-x", "apagado"]);
    pieza.remove();
  });

  it("iniciarInterruptor arranca con la URL, cambia a mano y suelta el estilo", () => {
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: false }),
      configurable: true,
    });
    window.history.replaceState(null, "", "?movimiento=rayos-x");
    const interruptor = iniciarInterruptor();
    expect(interruptor.modo()).toBe("rayos-x");
    expect(document.documentElement.dataset.vivoModo).toBe("rayos-x");
    interruptor.cambiar("apagado");
    expect(interruptor.modo()).toBe("apagado");
    expect(document.documentElement.dataset.vivoModo).toBe("apagado");
    interruptor.quitar();
    window.history.replaceState(null, "", "/");
  });
});
