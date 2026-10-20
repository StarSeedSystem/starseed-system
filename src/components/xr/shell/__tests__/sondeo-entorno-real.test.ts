import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATOS_SIN_SONDEO, _olvidarWebgl2, entornoReal, escucharDispositivosXR, esVisorPorUA, sondearNavegador } from "../sondeo-navegador";
import type { XRInyectable } from "../sondeo-navegador";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const PICO = "Mozilla/5.0 (Linux; Android 12; Pico 4 Build/SQ3A) AppleWebKit/537.36 Chrome/114.0 PicoBrowser/4.0 Mobile VR Safari/537.36";
const MAGIC_LEAP = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Magic Leap 2";

/** Simula window, navigator y un canvas que cuenta cuántas veces se crea y se suelta. */
function simular(opciones: { webgl2?: boolean; extra?: Record<string, unknown>; xr?: XRInyectable; standalone?: boolean; digitalGoods?: boolean } = {}) {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => (opciones.webgl2 === false ? null : { getExtension: () => ({ loseContext }) }));
    const createElement = vi.fn(() => ({ getContext }));
    vi.stubGlobal("WebGL2RenderingContext", class {});
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("navigator", { userAgent: QUEST3, maxTouchPoints: 3, xr: opciones.xr, gpu: {}, ...opciones.extra });
    vi.stubGlobal("window", {
        isSecureContext: true,
        matchMedia: () => ({ matches: opciones.standalone === true }),
        ...(opciones.digitalGoods ? { getDigitalGoodsService: () => undefined } : {}),
    });
    return { createElement, getContext, loseContext };
}

beforeEach(() => { _olvidarWebgl2(); });
afterEach(() => { vi.unstubAllGlobals(); _olvidarWebgl2(); });

describe("entornoReal", () => {
  it("lee https, UA, táctil, WebGPU, app instalada (standalone) y PWA de Quest (digital goods)", () => {
    simular({ standalone: true, digitalGoods: true });
    const e = entornoReal();
    expect(e).toMatchObject({ ua: QUEST3, seguro: true, maxTouchPoints: 3, webgpu: true, standalone: true, digitalGoods: true });
  });

  it("sin app instalada ni digital goods ni WebGPU, todo false", () => {
    simular({ extra: { gpu: undefined } });
    vi.stubGlobal("navigator", { userAgent: WIN, maxTouchPoints: 0 });
    expect(entornoReal()).toMatchObject({ webgpu: false, standalone: false, digitalGoods: false, seguro: true });
  });

  it("WebGL2: un canvas efímero que se suelta con loseContext, y UN solo canvas por carga", async () => {
    const { createElement, loseContext } = simular();
    const primero = await sondearNavegador();
    const segundo = await sondearNavegador();
    expect(primero.webgl2).toBe(true);
    expect(segundo.webgl2).toBe(true);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("sin contexto WebGL2 dice false; sin la clase WebGL2 ni siquiera crea un canvas", async () => {
    simular({ webgl2: false });
    expect((await sondearNavegador()).webgl2).toBe(false);
    _olvidarWebgl2();
    const { createElement } = simular();
    vi.stubGlobal("WebGL2RenderingContext", undefined);
    expect((await sondearNavegador()).webgl2).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("el sondeo sin argumento usa el entorno real: Quest instalada con VR+AR+offerSession", async () => {
    simular({ standalone: true, xr: { isSessionSupported: async () => true, offerSession: () => undefined } });
    expect(await sondearNavegador()).toEqual({
      ua: QUEST3, seguro: true, tieneXR: true, vr: true, ar: true, ofreceSesion: true, tactil: true, webgl2: true, webgpu: true, instalada: true,
    });
  });

  it("un navegador raro que lanza al leer una señal pierde esa señal, no todas", () => {
    simular();
    vi.stubGlobal("navigator", { get userAgent(): string { throw new Error("bloqueado"); }, maxTouchPoints: 2 });
    expect(entornoReal()).toMatchObject({ ua: "", maxTouchPoints: 2, seguro: true });
  });

  it("sin window ni navigator: entorno vacío y sin lanzar (vr/ar quedan null en el sondeo)", async () => {
    expect(entornoReal()).toMatchObject({ ua: "", seguro: false, standalone: false, maxTouchPoints: 0 });
    expect(entornoReal().webgl2()).toBe(false);
    expect(await sondearNavegador()).toEqual(DATOS_SIN_SONDEO);
  });
});

describe("escucharDispositivosXR", () => {
  const xrEventos = () => Object.assign(new EventTarget(), { isSessionSupported: async () => true });

  it("avisa en cada devicechange y deja de avisar al quitar el oyente", () => {
    const xr = xrEventos();
    const alCambiar = vi.fn();
    const quitar = escucharDispositivosXR(alCambiar, xr);
    xr.dispatchEvent(new Event("devicechange"));
    xr.dispatchEvent(new Event("devicechange"));
    expect(alCambiar).toHaveBeenCalledTimes(2);
    quitar();
    xr.dispatchEvent(new Event("devicechange"));
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  it("tolera un navigator.xr sin addEventListener, sin xr, o con uno que lanza", () => {
    const sinOyentes: XRInyectable = { isSessionSupported: async () => true };
    expect(() => escucharDispositivosXR(vi.fn(), sinOyentes)()).not.toThrow();
    expect(() => escucharDispositivosXR(vi.fn())()).not.toThrow();
    const roto: XRInyectable = {
      isSessionSupported: async () => true,
      addEventListener: () => { throw new Error("no"); },
      removeEventListener: () => { throw new Error("no"); },
    };
    expect(() => escucharDispositivosXR(vi.fn(), roto)()).not.toThrow();
    const soloAnadir: XRInyectable = { isSessionSupported: async () => true, addEventListener: vi.fn(), removeEventListener: () => { throw new Error("no"); } };
    expect(() => escucharDispositivosXR(vi.fn(), soloAnadir)()).not.toThrow();
  });

  it("sin argumento escucha el navigator.xr real", () => {
    const xr = xrEventos();
    simular({ xr });
    const alCambiar = vi.fn();
    const quitar = escucharDispositivosXR(alCambiar);
    xr.dispatchEvent(new Event("devicechange"));
    expect(alCambiar).toHaveBeenCalledTimes(1);
    quitar();
  });
});

describe("esVisorPorUA", () => {
  it("acepta Quest, Pico y Magic Leap", () => {
    expect(esVisorPorUA(QUEST3)).toBe(true);
    expect(esVisorPorUA(PICO)).toBe(true);
    expect(esVisorPorUA(MAGIC_LEAP)).toBe(true);
  });

  it("rechaza Windows, Mac, iPhone, Pixel y el UA vacío (Vision Pro y Android XR solo los confirma la sonda)", () => {
    for (const ua of [WIN, MAC, IPHONE, PIXEL, ""]) expect(esVisorPorUA(ua)).toBe(false);
  });
});
