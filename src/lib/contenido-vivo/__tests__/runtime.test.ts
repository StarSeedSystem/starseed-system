// @vitest-environment jsdom
/**
 * Pruebas del escudo 3D y del interruptor de movimiento (CVV1028, tarea D).
 * jsdom local: sin red, sin disco, solo DOM y funciones puras.
 */
import { describe, it, expect, vi } from "vitest";
import {
  EVENTO_APUNTADOR, esEscenaPropia, normalizarCoordenadas,
  mensajeApuntador, ponerEscudo, type eventoApuntador,
} from "../escudo-3d";
import {
  EVENTO_MODO, modoDesdeUrl, resolverModo, modoQuieto, anunciarModo,
  detallePieza, textoEtiqueta, pintarRayosX, quitarRayosX,
} from "../interruptor-movimiento";

describe("interruptor de movimiento", () => {
  it("lee cada modo pedido en la URL y no inventa con valores ajenos", () => {
    expect(modoDesdeUrl("/p?movimiento=apagado")).toBe("apagado");
    expect(modoDesdeUrl("/p?movimiento=rayos-x")).toBe("rayos-x");
    expect(modoDesdeUrl("/p")).toBeNull();
    expect(modoDesdeUrl("/p?movimiento=ENCENDIDO")).toBeNull();
    expect(modoQuieto("apagado")).toBe(true);
    expect(modoQuieto("rayos-x")).toBe(false);
  });

  it("sin pedido el modo es encendido; reduce movimiento manda", () => {
    expect(resolverModo("/p", false)).toBe("encendido");
    expect(resolverModo("/p?movimiento=rayos-x", true)).toBe("apagado");
  });

  it("solo apagado pide el fotograma final quieto", () => {
    expect(modoQuieto("apagado")).toBe(true);
    expect(modoQuieto("rayos-x")).toBe(false);
  });

  it("anuncia el cambio con el evento del contrato", () => {
    let oido: string | null = null;
    const escuchar = (ev: Event) => {
      oido = (ev as CustomEvent<{ modo: string }>).detail.modo;
    };
    window.addEventListener(EVENTO_MODO, escuchar);
    anunciarModo("rayos-x");
    window.removeEventListener(EVENTO_MODO, escuchar);
    expect(EVENTO_MODO).toBe("contenido-vivo:modo");
    expect(oido).toBe("rayos-x");
  });

  it("rayos-x: lee qué · cómo, la herramienta y pinta o retira etiquetas", () => {
    document.body.innerHTML =
      '<div><section data-vivo="Foto viva · bucle" data-vivo-herramienta="ffmpeg"></section></div>';
    const pieza = document.querySelector("section")!;
    expect(detallePieza(pieza)).toEqual({ caja: "Foto viva · bucle", herramienta: "ffmpeg" });
    expect(textoEtiqueta(detallePieza(pieza))).toBe("Foto viva · bucle · ffmpeg");
    expect(textoEtiqueta({ caja: "Foto viva · bucle", herramienta: "" })).toBe("Foto viva · bucle");
    const raiz = document.querySelector("div")!;
    pintarRayosX(raiz);
    const puestas = raiz.querySelectorAll("[data-vivo-etiqueta]");
    expect(puestas).toHaveLength(1);
    expect(puestas[0].textContent).toBe("Foto viva · bucle · ffmpeg");
    pintarRayosX(raiz);
    expect(raiz.querySelectorAll("[data-vivo-etiqueta]")).toHaveLength(1);
    quitarRayosX(raiz);
    expect(raiz.querySelectorAll("[data-vivo-etiqueta]")).toHaveLength(0);
  });
});

describe("escudo 3D", () => {
  it("reconoce escenas propias y ajenas", () => {
    expect(esEscenaPropia("https://my.spline.design/pieza/abc", false)).toBe(true);
    expect(esEscenaPropia("https://lo-que-sea", true)).toBe(true);
    expect(esEscenaPropia(null, true)).toBe(true);
    expect(esEscenaPropia("https://falso-spline.design/x", false)).toBe(false);
    expect(esEscenaPropia(null, false)).toBe(false);
  });

  it("clava el apuntador entre 0 y 1 con el borde del marco", () => {
    const rect = { left: 100, top: 50, width: 200, height: 40 };
    expect(normalizarCoordenadas(rect, 200, 70)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizarCoordenadas(rect, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(normalizarCoordenadas(rect, 9999, 9999)).toEqual({ x: 1, y: 1 });
  });

  it("arma el mensaje plano que viaja por postMessage", () => {
    expect(mensajeApuntador("bajar" as eventoApuntador, 0.25, 0.75)).toEqual({
      tipo: EVENTO_APUNTADOR,
      evento: "bajar",
      x: 0.25,
      y: 0.75,
    });
    expect(EVENTO_APUNTADOR).toBe("contenido-vivo:apuntador");
  });

  it("pone la capa encima (una sola vez) y la quita al soltarla", () => {
    document.body.innerHTML = '<section><iframe title="escena"></iframe></section>';
    const padre = document.querySelector("section")!;
    const marco = document.querySelector("iframe")! as HTMLIFrameElement;
    const soltar = ponerEscudo(marco);
    expect(padre.querySelector("[data-escudo-vivo]")).toBeTruthy();
    expect(padre.style.position).toBe("relative");
    ponerEscudo(marco);
    expect(padre.querySelectorAll("[data-escudo-vivo]")).toHaveLength(1);
    soltar();
    expect(padre.querySelector("[data-escudo-vivo]")).toBeNull();
    expect(padre.style.position).toBe("");
  });

  it("escena ajena: el escudo no reenvía nada por postMessage", () => {
    document.body.innerHTML =
      '<section><iframe title="ajena" src="https://ejemplo.com/escena"></iframe></section>';
    const marco = document.querySelector("iframe")! as HTMLIFrameElement;
    const enviar = vi.fn();
    (marco.contentWindow as unknown as { postMessage: typeof enviar }).postMessage = enviar;
    const soltar = ponerEscudo(marco);
    const capa = document.querySelector("[data-escudo-vivo]")!;
    capa.dispatchEvent(new Event("pointerdown"));
    capa.dispatchEvent(new Event("click"));
    expect(enviar).not.toHaveBeenCalled();
    soltar();
  });

  it("escena propia: reenvía el apuntador con coordenadas de 0 a 1", () => {
    document.body.innerHTML = '<section><iframe title="propia" data-visor-3d></iframe></section>';
    const marco = document.querySelector("iframe")! as HTMLIFrameElement;
    const enviar = vi.fn();
    (marco.contentWindow as unknown as { postMessage: typeof enviar }).postMessage = enviar;
    Object.defineProperty(marco, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => null }),
      configurable: true,
    });
    const soltar = ponerEscudo(marco);
    const capa = document.querySelector("[data-escudo-vivo]")!;
    capa.dispatchEvent(new PointerEvent("pointermove", { clientX: 25, clientY: 10 }));
    capa.dispatchEvent(new PointerEvent("pointerdown", { clientX: 75, clientY: 40 }));
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[0][0]).toEqual({ tipo: EVENTO_APUNTADOR, evento: "mover", x: 0.25, y: 0.2 });
    expect(enviar.mock.calls[1][0]).toEqual({ tipo: EVENTO_APUNTADOR, evento: "bajar", x: 0.75, y: 0.8 });
    soltar();
  });
});
